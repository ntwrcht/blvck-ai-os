// Shared logic for the blvck-pm vault scripts.
//
// Split of responsibility, deliberately: this file decides only what a machine can decide.
// "Does the PRD have a success metric" is checkable; "is it a good success metric" is a
// conversation and belongs to /blvck-pm:validate, which is a prompt. Nothing here judges
// quality, and adding a check that does is the signal it belongs on the other side of the line.
import { readdir, readFile, realpath, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocument, classifyDocument, resolveChecklist } from './checklists.mjs';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATE_DIR = path.join(SKILL_ROOT, 'templates');

export const CONFIG_JSON = 'pm-os.config.json';
export const CONFIG_MD = 'pm-os.config.md';

export const MODULES = ['identity', 'product', 'plan', 'roadmap', 'config'];

export const ROADMAP_STATUSES = ['idea', 'validated', 'planned', 'building', 'shipped', 'measured'];

// The terminal state is `measured`, not `shipped`. That single difference is what makes this a
// product tracker rather than an engineering one: blvck-harness finishes when verification
// passes, blvck-pm finishes when the number moved.
export const ROADMAP_TERMINAL = 'measured';

export const DEFAULT_PATHS = {
  identity: 'ABOUT-ME',
  identityFile: 'ABOUT-ME/CLAUDE.md',
  antiStyle: 'ABOUT-ME/anti-style.md',
  principles: 'ABOUT-ME/pm-principles.md',
  currentFocus: 'ABOUT-ME/current-focus.md',
  productContext: 'PROJECTS/{{PRODUCT_SLUG}}/CLAUDE.md',
  vision: 'PROJECTS/{{PRODUCT_SLUG}}/vision.md',
  roadmap: 'PROJECTS/{{PRODUCT_SLUG}}/roadmap.json',
  templates: 'TEMPLATES',
  outputs: 'CLAUDE-OUTPUTS',
  agents: '.claude/agents'
};

export const REQUIRED_OUTPUT_DIRS = ['prds', 'strategy-docs', 'research', 'stakeholder-comms', 'data-analysis'];
export const OPTIONAL_OUTPUT_DIRS = ['feature-briefs', 'prototypes', 'drafts'];

// Files a vault legitimately keeps at its root. Anything else ending in .md there is a stray:
// a generated artifact that escaped the outputs dir, which is the most common vault-rot symptom.
const ROOT_ALLOWLIST = new Set(['README.md', 'CLAUDE.md', 'AGENTS.md', CONFIG_MD, 'CONTRIBUTING.md', 'LICENSE.md', 'NOTICE.md']);

export class VaultConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VaultConfigError';
  }
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(filePath) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

export async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

export async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function listFiles(root, { maxFiles = 4000 } = {}) {
  const out = [];
  const skip = new Set(['.git', 'node_modules', '.migration-backup', '_archive']);
  async function walk(dir) {
    if (out.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(root, full));
      if (out.length >= maxFiles) return;
    }
  }
  await walk(root);
  return out;
}

// --- config -----------------------------------------------------------------------------

// Resolution ladder, in order: the JSON config, then the markdown one, then defaults. The JSON
// exists because a markdown bullet list cannot be parsed reliably; the markdown reader is a
// bridge for vaults built before it, not a second supported format. It reads what it can and
// stays silent about what it cannot rather than guessing.
// Kept for the one-time conversion in create-vault.mjs --upgrade-config, not for scoring.
// Best-effort by nature: it reads what it can and stays silent about what it cannot, which is
// exactly why it is unfit to be a config source and fine as a migration aid.
export function parsePathsFromMarkdown(text) {
  const paths = {};
  const section = text.split(/^##\s+/m).find((block) => block.startsWith('Paths'));
  if (!section) return paths;
  const roleMap = {
    'identity': 'identity',
    'product context': 'productContext',
    'vision': 'vision',
    'roadmap': 'roadmap',
    'templates': 'templates',
    'outputs': 'outputs',
    'agents': 'agents'
  };
  for (const line of section.split('\n')) {
    const match = /^-\s*([A-Za-z ]+?):\s*(\S+)/.exec(line.trim());
    if (!match) continue;
    const role = roleMap[match[1].trim().toLowerCase()];
    if (!role) continue;
    paths[role] = match[2].replace(/\/$/, '');
    const inner = /\(identity file:\s*([^)]+)\)/.exec(line);
    if (inner) paths.identityFile = inner[1].trim();
  }
  return paths;
}

export function parseLanguageFromMarkdown(text) {
  const section = text.split(/^##\s+/m).find((block) => block.startsWith('Language'));
  if (!section) return null;
  const match = /^-\s*Language:\s*(\S+)/m.exec(section);
  return match ? match[1] : null;
}

// A declared path that escapes the vault is a configuration error, never a low score. Resolve
// against the *real* root: on macOS a temp dir is handed out as /var/... while realpath gives
// /private/var/..., and comparing the two shapes rejects paths that are merely missing.
async function assertInsideRoot(root, relative, label) {
  const realRoot = await realpath(root).catch(() => path.resolve(root));
  const resolved = path.resolve(realRoot, relative);
  if (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep)) {
    throw new VaultConfigError(`${label}: "${relative}" resolves outside the vault`);
  }
  return resolved;
}

export async function loadConfig(root) {
  const jsonPath = path.join(root, CONFIG_JSON);
  const mdPath = path.join(root, CONFIG_MD);
  let source = null;
  let declared = {};
  let language = null;
  let product = null;
  let agents = [];
  let completeness = {};
  let raw = null;

  const jsonText = await readText(jsonPath);
  if (jsonText !== null) {
    try {
      raw = JSON.parse(jsonText);
    } catch (error) {
      throw new VaultConfigError(`${CONFIG_JSON} is not valid JSON: ${error.message}`);
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new VaultConfigError(`${CONFIG_JSON} must contain a JSON object`);
    }
    if (raw.paths !== undefined && (typeof raw.paths !== 'object' || raw.paths === null || Array.isArray(raw.paths))) {
      throw new VaultConfigError(`${CONFIG_JSON}: "paths" must be an object`);
    }
    for (const [role, value] of Object.entries(raw.paths || {})) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new VaultConfigError(`${CONFIG_JSON}: paths.${role} must be a non-empty string`);
      }
      if (!(role in DEFAULT_PATHS)) {
        throw new VaultConfigError(`${CONFIG_JSON}: unknown path role "${role}" (known: ${Object.keys(DEFAULT_PATHS).join(', ')})`);
      }
      await assertInsideRoot(root, value, `${CONFIG_JSON}: paths.${role}`);
      declared[role] = value.replace(/\/$/, '');
    }
    language = typeof raw.language === 'string' ? raw.language : null;
    product = typeof raw.product === 'string' ? raw.product : null;
    agents = Array.isArray(raw.agents) ? raw.agents.filter((a) => typeof a === 'string') : [];
    completeness = (raw.completeness && typeof raw.completeness === 'object') ? raw.completeness : {};
    source = CONFIG_JSON;
  } else if (await exists(mdPath)) {
    // 2.0.0: the markdown config is no longer read. It was never reliably parseable — bullets
    // with parentheticals — and keeping a second source of truth meant the two drifted silently.
    // Failing loudly with the fix beats reading half of it and scoring on a guess.
    throw new VaultConfigError(
      `${CONFIG_MD} is no longer read (blvck-pm 2.0.0). Convert it once:\n` +
      `  node <plugin>/skills/pm-os/scripts/create-vault.mjs --upgrade-config --target ${root}\n` +
      `That writes ${CONFIG_JSON} from it and leaves the markdown alone for you to delete.`
    );
  }

  // Defaults carry a {{PRODUCT_SLUG}} token. With no configured product, find the one product
  // directory that exists rather than reporting every product path as missing.
  let slug = product;
  if (!slug) {
    const projects = path.join(root, 'PROJECTS');
    if (await isDir(projects)) {
      const entries = (await readdir(projects, { withFileTypes: true })).filter((e) => e.isDirectory());
      if (entries.length === 1) slug = entries[0].name;
    }
  }

  const paths = {};
  for (const [role, fallback] of Object.entries(DEFAULT_PATHS)) {
    paths[role] = declared[role] ?? (slug ? fallback.replaceAll('{{PRODUCT_SLUG}}', slug) : fallback);
  }

  return { source, paths, declared, language, product: slug, agents, completeness, raw };
}

// --- roadmap ----------------------------------------------------------------------------

export function validateRoadmap(data) {
  const errors = [];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['roadmap must be a JSON object'], items: [] };
  }
  if (!Array.isArray(data.items)) {
    return { errors: ['roadmap.items must be an array'], items: [] };
  }
  const seen = new Set();
  const ids = new Set(data.items.map((item) => item && item.id).filter(Boolean));
  for (const [index, item] of data.items.entries()) {
    const where = `items[${index}]`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${where} must be an object`);
      continue;
    }
    if (typeof item.id !== 'string' || !item.id) errors.push(`${where}.id is required`);
    else if (seen.has(item.id)) errors.push(`${where}.id "${item.id}" is a duplicate`);
    else seen.add(item.id);
    if (typeof item.outcome !== 'string' || !item.outcome) errors.push(`${where}.outcome is required`);
    if (typeof item.status !== 'string' || !ROADMAP_STATUSES.includes(item.status)) {
      errors.push(`${where}.status must be one of ${ROADMAP_STATUSES.join(' | ')} (got ${JSON.stringify(item?.status)})`);
    }
    // `measured` is the terminal state, so it is the one status that has to carry a result.
    // Without this an item can be marked finished while the number it existed for is unknown,
    // which is the exact failure the lifecycle was designed to prevent.
    if (item.status === ROADMAP_TERMINAL && (!item.measured || typeof item.measured !== 'object')) {
      errors.push(`${where} is "${ROADMAP_TERMINAL}" but carries no measured result`);
    }
    for (const dep of Array.isArray(item.dependencies) ? item.dependencies : []) {
      if (!ids.has(dep)) errors.push(`${where}.dependencies references unknown id "${dep}"`);
    }
  }
  return { errors, items: data.items };
}

export async function loadRoadmap(root, paths) {
  const file = path.join(root, paths.roadmap);
  const text = await readText(file);
  if (text === null) return { present: false, errors: [], items: [], data: null };
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { present: true, errors: [`${paths.roadmap} is not valid JSON: ${error.message}`], items: [], data: null };
  }
  const { errors, items } = validateRoadmap(data);
  return { present: true, errors, items, data };
}

// --- checks -----------------------------------------------------------------------------

const OUTPUT_NAME = /^[a-z0-9]+(?:-[a-z0-9.]+)*-\d{4}-\d{2}-\d{2}\.md$/;

function check(id, pass, message, detail) {
  return detail === undefined ? { id, pass, message } : { id, pass, message, detail };
}

function daysSince(dateText) {
  const parsed = Date.parse(dateText);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86400000);
}

export async function scoreVault(root, { config, roadmap, files }) {
  const p = config.paths;
  const has = async (relative) => exists(path.join(root, relative));
  const text = async (relative) => (await readText(path.join(root, relative))) ?? '';

  const identityText = await text(p.identityFile);
  const focusText = await text(p.currentFocus);
  const productText = await text(p.productContext);
  const visionText = await text(p.vision);

  const outputFiles = files.filter((f) => f.startsWith(p.outputs + path.sep) && f.endsWith('.md'));
  const rootMd = files.filter((f) => !f.includes(path.sep) && f.endsWith('.md') && !ROOT_ALLOWLIST.has(f));
  const agentPaths = files.filter((f) => f.startsWith(p.agents + path.sep) && f.endsWith('.md'));
  const agentFiles = agentPaths.map((f) => path.basename(f, '.md'));

  // A documented budget nobody checks is advice. Every archetype ships with `tools` and `model`
  // in its frontmatter, so an agent in a vault without them was hand-written past the contract.
  const agentsMissingBudget = [];
  for (const file of agentPaths) {
    const front = /^---\n([\s\S]*?)\n---/.exec(await text(file))?.[1] ?? '';
    const missing = ['tools', 'model'].filter((field) => !new RegExp(`^${field}:`, 'm').test(front));
    if (missing.length) agentsMissingBudget.push(`${file} (missing ${missing.join(', ')})`);
  }
  const placeholders = [];
  for (const file of files.filter((f) => f.endsWith('.md') || f.endsWith('.json'))) {
    const body = await text(file);
    if (/\{\{[A-Z_]+\}\}/.test(body)) placeholders.push(file);
  }

  // feat-011 said a typo'd completeness override "reads as configured and silently does nothing".
  // Saying so in a prompt did not stop it; this does.
  const DOC_TYPES = new Set(['vision', 'prd', 'lightweight-spec', 'one-pager', 'prfaq', 'rice',
    'metrics-tree', 'tracking-plan', 'gtm-brief']);
  const completenessErrors = [];
  for (const [docType, rule] of Object.entries(config.completeness || {})) {
    if (!DOC_TYPES.has(docType)) {
      completenessErrors.push(`unknown document type "${docType}" (known: ${[...DOC_TYPES].join(', ')})`);
      continue;
    }
    if (rule === 'skip') continue;
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      completenessErrors.push(`${docType}: must be "skip" or an object of drop/add lists`);
      continue;
    }
    for (const verb of Object.keys(rule)) {
      if (verb !== 'drop' && verb !== 'add') {
        completenessErrors.push(`${docType}.${verb}: only "drop" and "add" are verbs (or the value "skip")`);
      } else if (!Array.isArray(rule[verb])) {
        completenessErrors.push(`${docType}.${verb}: must be an array of strings`);
      }
    }
  }

  // Each document against its own checklist — the half of the completeness gate that was still
  // model behaviour through 2.0.0. The gate WARNS by design (a founder may knowingly ship an
  // experiment with no metric), so an unmet item never blocks; it only counts when nobody
  // acknowledged it. A document carrying a "## Completeness" override has been acknowledged,
  // and an acknowledged trade-off is a decision rather than a gap.
  const documentFindings = [];
  const documentPaths = [p.vision, ...outputFiles];
  for (const relative of documentPaths) {
    const docType = classifyDocument(relative);
    if (!docType) continue;
    const body = await text(relative);
    if (!body) continue;
    const found = checkDocument(body, docType, config.completeness);
    if (found.unmet.length > 0 && !found.acknowledged) {
      documentFindings.push({ path: relative, docType, unmet: found.unmet });
    }
  }

  const focusDate = /updated[:*\s]*(\d{4}-\d{2}-\d{2})/i.exec(focusText)?.[1];
  const focusAge = focusDate ? daysSince(focusDate) : null;

  const subsystems = {
    identity: [
      check('identity.fileExists', Boolean(identityText), `Identity file present (${p.identityFile})`),
      check('identity.focusArea', /##\s*Identity/i.test(identityText) && identityText.length > 200, 'Identity file has an Identity section with real content'),
      check('identity.antiStyle', await has(p.antiStyle), `Anti-style rules present (${p.antiStyle})`),
      check('identity.principles', await has(p.principles), `PM principles present (${p.principles})`),
      check('identity.focusFresh', focusAge !== null && focusAge <= 30, focusDate ? `Current focus updated ${focusAge} days ago (30-day bar)` : 'Current focus carries no "Updated: YYYY-MM-DD" line')
    ],
    product: [
      check('product.contextExists', Boolean(productText), `Product context present (${p.productContext})`),
      check('product.nsmDeclared', /\*\*North Star Metric:/i.test(productText), 'North Star Metric named and bolded in product context'),
      check('product.usersDescribed', /##\s*Primary Users/i.test(productText) && !/\{\{USER_ROWS\}\}/.test(productText), 'Primary users filled in (not template text)'),
      check('product.terminology', /##\s*Terminology/i.test(productText) && !/\{\{TERMINOLOGY_ROWS\}\}/.test(productText), 'Terminology table filled in'),
      check('product.visionExists', Boolean(visionText), `Vision present (${p.vision})`)
    ],
    plan: [
      check('plan.outputsDir', await isDir(path.join(root, p.outputs)), `Outputs dir present (${p.outputs})`),
      check('plan.outputSubdirs', (await Promise.all(REQUIRED_OUTPUT_DIRS.map((d) => isDir(path.join(root, p.outputs, d))))).every(Boolean), `Required output subdirs present (${REQUIRED_OUTPUT_DIRS.join(', ')})`),
      check('plan.templatesDir', await isDir(path.join(root, p.templates)), `Templates dir present (${p.templates})`),
      check('plan.naming', outputFiles.every((f) => OUTPUT_NAME.test(path.basename(f))), 'Every output follows [type]-[description]-[YYYY-MM-DD].md', outputFiles.filter((f) => !OUTPUT_NAME.test(path.basename(f)))),
      check('plan.noStrays', rootMd.length === 0, 'No generated markdown stranded at the vault root', rootMd),
      check('plan.completeness', documentFindings.length === 0, 'Every document meets its checklist or records why it shipped incomplete',
        documentFindings.map((f) => `${f.path}: ${f.unmet.join('; ')}`))
    ],
    roadmap: [
      check('roadmap.exists', roadmap.present, `Roadmap present (${p.roadmap})`),
      check('roadmap.schema', roadmap.present && roadmap.errors.length === 0, 'Roadmap parses and every item is well formed', roadmap.errors),
      check('roadmap.metrics', roadmap.present && roadmap.items.length > 0 && roadmap.items.every((i) => typeof i?.metric === 'string' && i.metric), 'Every roadmap item names the metric that proves it'),
      check('roadmap.outcomes', roadmap.present && roadmap.items.length >= 1, 'Roadmap has at least one outcome'),
      check('roadmap.traceable', roadmap.present && roadmap.items.some((i) => i?.visionOutcome !== undefined || (Array.isArray(i?.documents) && i.documents.length > 0)), 'At least one item traces to a vision outcome or a document')
    ],
    config: [
      check('config.exists', config.source !== null, `Config present (${CONFIG_JSON} or ${CONFIG_MD})`),
      check('config.completeness', completenessErrors.length === 0, 'Completeness overrides use only drop/add/skip against known document types', completenessErrors),
      check('config.language', Boolean(config.language), 'Output language declared'),
      check('config.agentRoster', config.agents.length === 0 || config.agents.every((name) => agentFiles.includes(name)), 'Every agent in the roster has a file', config.agents.filter((name) => !agentFiles.includes(name))),
      check('config.noPlaceholders', placeholders.length === 0, 'No unresolved {{PLACEHOLDERS}} anywhere in the vault', placeholders),
      check('config.agentBudgets', agentsMissingBudget.length === 0, 'Every agent declares a tool and model budget', agentsMissingBudget)
    ]
  };

  const result = { modules: {}, overall: 0, bottleneck: null, unscored: false };
  let passed = 0;
  let total = 0;
  let worst = null;
  for (const [name, checks] of Object.entries(subsystems)) {
    const modulePassed = checks.filter((c) => c.pass).length;
    passed += modulePassed;
    total += checks.length;
    result.modules[name] = { score: modulePassed, total: checks.length, checks };
    if (worst === null || modulePassed < result.modules[worst].score) worst = name;
  }
  // Linear on purpose. blvck-harness floors each subsystem at 1, so an empty repo reports
  // 20/100 — a number that reads as a measurement and is not one. Here 0 means 0, and
  // `unscored` still separates "nothing to find" from "found and bad".
  result.overall = Math.round((passed / total) * 100);
  result.passed = passed;
  result.total = total;
  result.bottleneck = passed === total ? null : worst;
  // Surfaced separately from its check because it blocks: an override the tool cannot parse
  // looks configured and does nothing, which no score bar can be trusted to catch.
  result.completenessErrors = completenessErrors;
  result.documentFindings = documentFindings;
  result.unscored = config.source === null && !identityText && !productText;
  return result;
}

export function formatVaultReport(result, root, config, roadmap) {
  const lines = [`PM vault validation for ${root}`, `Config: ${config.source ?? 'none found'}`];
  if (result.unscored) {
    lines.push(
      '',
      'Unscored — no vault found here. The score below is arithmetic on an empty directory, not a measurement.',
      'If this directory does hold PM material in another shape, run /blvck-pm:migrate to declare it.'
    );
  }
  lines.push('', `Overall: ${result.overall}/100 (${result.passed}/${result.total} checks)`,
    `Bottleneck: ${result.bottleneck ?? 'none — every module at full score'}`, '');

  lines.push('Resolution:');
  for (const [role, value] of Object.entries(config.paths)) {
    const via = config.declared[role] ? '  (config)' : '';
    lines.push(`  ${role.padEnd(16)}${value}${via}`);
  }
  lines.push('');

  for (const [name, module] of Object.entries(result.modules)) {
    lines.push(`${name}: ${module.score}/${module.total}`);
    for (const c of module.checks) {
      lines.push(`  ${c.pass ? 'PASS' : 'FAIL'} [${c.id}] ${c.message}`);
      if (!c.pass && Array.isArray(c.detail) && c.detail.length) {
        for (const d of c.detail.slice(0, 5)) lines.push(`         - ${d}`);
        if (c.detail.length > 5) lines.push(`         … ${c.detail.length - 5} more`);
      }
    }
    lines.push('');
  }

  if (roadmap.present && roadmap.items.length) {
    const byStatus = {};
    for (const item of roadmap.items) byStatus[item?.status] = (byStatus[item?.status] || 0) + 1;
    lines.push(`Roadmap: ${roadmap.items.length} outcomes — ` +
      ROADMAP_STATUSES.map((s) => `${s} ${byStatus[s] || 0}`).join(', '), '');
  }
  return lines.join('\n');
}

export async function copyTemplate(name, target, replacements = {}, { force = false } = {}) {
  if (!force && await exists(target)) return { path: target, status: 'skipped' };
  let body = await readFile(path.join(TEMPLATE_DIR, name), 'utf8');
  for (const [token, value] of Object.entries(replacements)) {
    body = body.replaceAll(`{{${token}}}`, value);
  }
  await writeText(target, body);
  return { path: target, status: 'written' };
}
