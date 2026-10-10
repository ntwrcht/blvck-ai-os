// Shared logic for the blvck-pm vault scripts.
//
// Split of responsibility, deliberately: this file decides only what a machine can decide.
// "Does the PRD have a success metric" is checkable; "is it a good success metric" is a
// conversation and belongs to /blvck-pm:check, which is a prompt. Nothing here judges
// quality, and adding a check that does is the signal it belongs on the other side of the line.
import { readdir, readFile, realpath, stat, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
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

// `mine`: work in this codebase is a task in the PM's plan. `dependency`: work there belongs to a
// named owner and enters the plan as a dependency. Deliberately NOT a write permission — in real
// use the PM commits heavily to repos the vault reads as read-only. Access follows where the
// session starts (vault root plans, a session inside the repo builds), not this field.
export const CODEBASE_SCOPES = ['mine', 'dependency'];
const CODEBASE_KEYS = new Set(['name', 'path', 'scope', 'branch', 'rootClaudeMd']);

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

export async function listFiles(root, options) {
  return (await walkVault(root, options)).files;
}

// A subfolder with its own `.git` is a codebase, not vault material, and the walk does not enter
// it. Decided by what the folder IS rather than what it is called: a vault may already keep PM
// files in a folder named CODE/, and a repo can sit anywhere before migrate moves it. Without
// this a repo's `{{...}}` blocks the vault and a large repo spends the whole file cap before the
// PRDs are reached. `.git` may be a file (worktrees, submodules), so the name alone decides.
export async function walkVault(root, { maxFiles = 4000 } = {}) {
  const out = [];
  const repos = [];
  const skip = new Set(['.git', 'node_modules', '.migration-backup', '_archive']);
  async function walk(dir) {
    if (out.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dir !== root && entries.some((entry) => entry.name === '.git')) {
      repos.push(path.relative(root, dir));
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
  return { files: out, repos };
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

function expandHome(value) {
  if (value === '~') return homedir();
  if (value.startsWith('~/')) return path.join(homedir(), value.slice(2));
  return value;
}

// The registry is the one place a declared path may leave the vault. The inside-the-vault rule
// exists so a vault cannot borrow another vault's score, and a codebase earns no points — so the
// rule has nothing to protect here, while a repo shared by two vaults has to live outside at
// least one of them. Everything else about a declaration still holds: an entry the tool cannot
// parse looks configured and does nothing, so it is a config error, not a shrug.
async function parseCodebases(root, value) {
  if (value === undefined) return [];
  const where = `${CONFIG_JSON}: codebases`;
  if (!Array.isArray(value)) throw new VaultConfigError(`${where} must be an array`);
  const realRoot = await realpath(root).catch(() => path.resolve(root));
  const names = new Set();
  const codebases = [];
  for (const [index, entry] of value.entries()) {
    const at = `${where}[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new VaultConfigError(`${at} must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!CODEBASE_KEYS.has(key)) {
        throw new VaultConfigError(`${at}: unknown key "${key}" (known: ${[...CODEBASE_KEYS].join(', ')})`);
      }
    }
    for (const key of ['name', 'path', 'scope']) {
      if (typeof entry[key] !== 'string' || entry[key].length === 0) {
        throw new VaultConfigError(`${at}.${key} must be a non-empty string`);
      }
    }
    if (!CODEBASE_SCOPES.includes(entry.scope)) {
      throw new VaultConfigError(`${at}.scope must be one of ${CODEBASE_SCOPES.join(' | ')} (got "${entry.scope}")`);
    }
    if (entry.branch !== undefined && (typeof entry.branch !== 'string' || entry.branch.length === 0)) {
      throw new VaultConfigError(`${at}.branch must be a non-empty string when present`);
    }
    // The one way to answer the inheritance warning. Same rule as a document's "## Completeness"
    // section: a recorded trade-off is a decision, not a gap. Exactly one value, because an
    // acknowledgement the tool cannot read would silence nothing while looking like it had.
    if (entry.rootClaudeMd !== undefined && entry.rootClaudeMd !== 'accepted') {
      throw new VaultConfigError(`${at}.rootClaudeMd must be "accepted" when present (got ${JSON.stringify(entry.rootClaudeMd)})`);
    }
    if (names.has(entry.name)) throw new VaultConfigError(`${at}.name "${entry.name}" is a duplicate`);
    names.add(entry.name);
    const resolved = path.resolve(realRoot, expandHome(entry.path));
    codebases.push({
      name: entry.name,
      path: entry.path.replace(/\/$/, ''),
      scope: entry.scope,
      branch: entry.branch ?? null,
      rootClaudeMdAccepted: entry.rootClaudeMd === 'accepted',
      resolved,
      inside: resolved.startsWith(realRoot + path.sep)
    });
  }
  return codebases;
}

// `configPath` scores a reading of the vault that is not saved yet: /blvck-pm:check discovers
// which folder plays each role, writes that as a scratch config outside the vault, and scores it
// with the same checks before the user agrees to save anything.
export async function loadConfig(root, { configPath } = {}) {
  const jsonPath = configPath ? path.resolve(configPath) : path.join(root, CONFIG_JSON);
  if (configPath && !await exists(jsonPath)) {
    throw new VaultConfigError(`--config: "${configPath}" does not exist`);
  }
  const mdPath = path.join(root, CONFIG_MD);
  let source = null;
  let declared = {};
  let language = null;
  let product = null;
  let agents = [];
  let completeness = {};
  let codebases = [];
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
    codebases = await parseCodebases(root, raw.codebases);
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

  return { source, paths, declared, language, product: slug, agents, completeness, codebases, raw };
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

// What a declared codebase is promising, checked on disk. Missing or not-a-repo entries are
// broken promises (they block in validate-vault.mjs); a `mine` repo without a harness is a weak
// result (it scores). Nothing here reads the repo's harness for quality — that is
// blvck-harness's job, and the two plugins' scripts share no code on purpose.
export async function inspectCodebases(codebases) {
  const report = [];
  for (const codebase of codebases) {
    const present = await isDir(codebase.resolved);
    const repo = present && await exists(path.join(codebase.resolved, '.git'));
    const harness = repo
      && await exists(path.join(codebase.resolved, 'CLAUDE.md'))
      && await exists(path.join(codebase.resolved, 'init.sh'));
    report.push({ ...codebase, present, repo, harness });
  }
  return report;
}

export async function scoreVault(root, { config, roadmap, files, repos = [] }) {
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

  const codebases = await inspectCodebases(config.codebases || []);
  const unharnessed = codebases.filter((c) => c.scope === 'mine' && c.repo && !c.harness);

  // Warnings change neither the score nor the exit code. Each names something that works today
  // but will surprise the user later, and is reported so the surprise happens here instead.
  const warnings = [];
  // Claude Code loads every CLAUDE.md above the working directory. A repo nested under a vault
  // root that has one inherits the vault's rules in every coding session — in real use that
  // blocked a merge, a branch switch and an edit, because the vault said its repos were read-only.
  if (await exists(path.join(root, 'CLAUDE.md'))) {
    // Acknowledged entries drop out: a warning that cannot be answered trains people to ignore
    // warnings, and the next one will be real.
    for (const c of codebases.filter((entry) => entry.inside && entry.present && !entry.rootClaudeMdAccepted)) {
      warnings.push(`${c.name}: sits inside the vault, so the vault's root CLAUDE.md loads in every coding session there (if that is intended, set "rootClaudeMd": "accepted" on this entry)`);
    }
  }
  const realRoot = await realpath(root).catch(() => path.resolve(root));
  const declaredInside = new Set(codebases.filter((c) => c.inside).map((c) => path.relative(realRoot, c.resolved)));
  for (const repo of repos) {
    if (!declaredInside.has(repo)) {
      warnings.push(`${repo}: a git repo inside the vault that the codebases registry does not list (run /blvck-pm:setup to declare it)`);
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
      check('config.agentBudgets', agentsMissingBudget.length === 0, 'Every agent declares a tool and model budget', agentsMissingBudget),
      // Passes when no codebase is declared, so it can only ever raise an existing vault's score.
      check('config.codebaseHarness', unharnessed.length === 0, 'Every codebase in scope "mine" carries a harness (CLAUDE.md + init.sh)',
        unharnessed.map((c) => `${c.name} (${c.path}): run /blvck-harness:setup there`))
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
  result.codebases = codebases.map(({ resolved, ...rest }) => rest);
  result.warnings = warnings;
  result.unscored = config.source === null && !identityText && !productText;
  return result;
}

export function formatVaultReport(result, root, config, roadmap) {
  const lines = [`PM vault validation for ${root}`, `Config: ${config.source ?? 'none found'}`];
  if (result.unscored) {
    lines.push(
      '',
      'Unscored — no vault found here. The score below is arithmetic on an empty directory, not a measurement.',
      'If this directory does hold PM material in another shape, /blvck-pm:check can discover it and /blvck-pm:setup can declare it.'
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

  if (result.codebases?.length) {
    lines.push('Codebases:');
    const width = Math.max(...result.codebases.map((c) => c.name.length)) + 2;
    for (const c of result.codebases) {
      const state = !c.present ? 'MISSING' : !c.repo ? 'NOT A REPO' : c.inside ? 'inside' : 'outside';
      const note = c.rootClaudeMdAccepted ? '  root CLAUDE.md accepted' : '';
      lines.push(`  ${c.name.padEnd(width)}${c.scope.padEnd(12)}${state.padEnd(12)}${c.path}${c.branch ? `  (${c.branch})` : ''}${note}`);
    }
    lines.push('');
  }

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

  if (result.warnings?.length) {
    lines.push('Warnings (no effect on score or exit code):');
    for (const w of result.warnings) lines.push(`  - ${w}`);
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

// --- workflow mode (pm-os.config.json "workflow") --------------------------------------
//
// How PM work runs, never how the vault scores: validate-vault.mjs reads this beside
// scoreVault, not inside it, so the same vault scores the same in classic and dynamic. Absent
// key = classic, which is why a 2.x vault keeps working unchanged.

export const WORKFLOW_PRESETS = ['recommended', 'lean', 'custom'];
export const DELIVER_TARGETS = ['confluence', 'drive', 'jira'];

// One entry per pipeline, one row per stage. `required` stages carry the work from brief to a
// delivered document, so turning one off leaves a run that cannot finish. `maxAgents` is a
// ceiling, never a target: a parallel stage runs one agent per real source, competitor or lens,
// at most that many at once.
export const PIPELINES = {
  prd: {
    discover: { required: false, maxAgents: 16 },
    draft: { required: true, maxAgents: 1 },
    review: { required: false, maxAgents: 8, lenses: true },
    revise: { required: false, maxAgents: 1, needs: 'review' },
    completeness: { required: false, maxAgents: 1 },
    deliver: { required: true, maxAgents: 1, targets: true }
  },
  'research-synthesis': {
    analyze: { required: true, maxAgents: 16 },
    synthesize: { required: true, maxAgents: 1 },
    review: { required: false, maxAgents: 8, lenses: true },
    revise: { required: false, maxAgents: 1, needs: 'review' },
    deliver: { required: true, maxAgents: 1, targets: true }
  },
  'competitor-teardown': {
    analyze: { required: true, maxAgents: 16 },
    compare: { required: true, maxAgents: 1 },
    review: { required: false, maxAgents: 8, lenses: true },
    revise: { required: false, maxAgents: 1, needs: 'review' },
    deliver: { required: true, maxAgents: 1, targets: true }
  },
  'prd-review': {
    review: { required: true, maxAgents: 8, lenses: true },
    consolidate: { required: true, maxAgents: 1 },
    deliver: { required: true, maxAgents: 1, targets: true }
  }
};

// Jira tickets come from a PRD's Must requirements; no other document has anything to ticket.
const TARGETS_BY_PIPELINE = { prd: DELIVER_TARGETS };
const targetsFor = (pipeline) => TARGETS_BY_PIPELINE[pipeline] ?? ['confluence', 'drive'];

const stage = (enabled, agents, agent, skills, extra = {}) => ({ enabled, agents, agent, skills, ...extra });
const lens = (name, agent) => ({ name, agent });
const FOUR_LENSES = [lens('engineer', 'lead-engineer'), lens('designer', 'blind-reviewer'),
  lens('customer', 'customer-voice'), lens('executive', 'board-executive')];
// Lean keeps one persona for every review: two blind lenses cost far less than four specialists.
const TWO_BLIND_LENSES = [lens('engineer', 'blind-reviewer'), lens('executive', 'blind-reviewer')];

function presetPipelines(preset) {
  const lean = preset === 'lean';
  return {
    prd: {
      enabled: true,
      stages: {
        discover: stage(!lean, 5, 'research-analyst', ['research', 'discovery-synthesis']),
        draft: stage(true, 1, 'product-manager', ['write-a-prd']),
        review: stage(true, lean ? 2 : 4, null, ['scrutinize'], { lenses: lean ? TWO_BLIND_LENSES : FOUR_LENSES }),
        revise: stage(!lean, 1, 'product-manager', ['write-a-prd']),
        completeness: stage(true, 1, null, []),
        deliver: stage(true, 1, null, ['stakeholder-comms'], { targets: [] })
      }
    },
    'research-synthesis': {
      enabled: true,
      stages: {
        analyze: stage(true, 5, 'research-analyst', ['research']),
        synthesize: stage(true, 1, 'customer-voice', ['discovery-synthesis']),
        review: stage(!lean, 1, null, ['scrutinize'], { lenses: [lens('skeptic', 'blind-reviewer')] }),
        revise: stage(!lean, 1, 'customer-voice', ['discovery-synthesis']),
        deliver: stage(true, 1, null, [], { targets: [] })
      }
    },
    'competitor-teardown': {
      enabled: true,
      stages: {
        analyze: stage(true, 5, 'competitive-intel', ['research']),
        compare: stage(true, 1, 'product-manager', []),
        review: stage(!lean, 1, null, ['scrutinize'], { lenses: [lens('executive', 'board-executive')] }),
        revise: stage(!lean, 1, 'product-manager', []),
        deliver: stage(true, 1, null, [], { targets: [] })
      }
    },
    'prd-review': {
      enabled: true,
      stages: {
        review: stage(true, lean ? 2 : 4, null, ['scrutinize'], { lenses: lean ? TWO_BLIND_LENSES : FOUR_LENSES }),
        consolidate: stage(true, 1, 'product-manager', []),
        deliver: stage(true, 1, null, [], { targets: [] })
      }
    }
  };
}

export function defaultWorkflowConfig({ preset = 'recommended' } = {}) {
  return {
    version: 1,
    mode: 'dynamic',
    preset,
    pipelines: presetPipelines(preset === 'lean' ? 'lean' : 'recommended'),
    destinations: {},
    grilling: { skill: 'grilling' }
  };
}

// Every persona an enabled stage runs as, so setup can scaffold exactly those and no others.
export function workflowPersonas(workflow) {
  const names = new Set();
  for (const pipeline of Object.values(workflow?.pipelines ?? {})) {
    if (!pipeline.enabled) continue;
    for (const s of Object.values(pipeline.stages)) {
      if (!s.enabled) continue;
      if (s.agent) names.add(s.agent);
      for (const l of s.lenses ?? []) if (l.agent) names.add(l.agent);
    }
  }
  return [...names].sort();
}

const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;
const WORKFLOW_KEYS = new Set(['version', 'mode', 'preset', 'pipelines', 'destinations', 'grilling']);
const PIPELINE_KEYS = new Set(['enabled', 'stages']);
const STAGE_KEYS = new Set(['enabled', 'agents', 'agent', 'skills', 'lenses', 'targets']);

function unknownKeys(object, known, where) {
  for (const key of Object.keys(object)) {
    if (!known.has(key)) throw new VaultConfigError(`${where}: unknown key "${key}" (known: ${[...known].join(', ')})`);
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Same contract as the rest of the config: anything the tool cannot trust stops the run with
// exit 2 and names the problem. It never falls back to a preset, because a typo'd stage that
// silently reverted to "recommended" would spend tokens the user declined to spend.
export function validateWorkflowConfig(workflow, rootConfig = {}) {
  const where = `${CONFIG_JSON}: workflow`;
  const fail = (message) => { throw new VaultConfigError(`${where}${message}`); };
  if (!isObject(workflow)) fail(' must be an object');
  unknownKeys(workflow, WORKFLOW_KEYS, where);
  if (workflow.version !== 1) {
    fail(`.version must be 1 (got ${JSON.stringify(workflow.version)})`);
  }
  if (workflow.mode !== 'classic' && workflow.mode !== 'dynamic') {
    fail(`.mode must be "classic" or "dynamic" (got ${JSON.stringify(workflow.mode)})`);
  }
  if (workflow.mode === 'classic') return;

  if (workflow.preset !== undefined && !WORKFLOW_PRESETS.includes(workflow.preset)) {
    fail(`.preset must be one of ${WORKFLOW_PRESETS.join(', ')} (got ${JSON.stringify(workflow.preset)})`);
  }
  const destinations = workflow.destinations ?? {};
  if (!isObject(destinations)) fail('.destinations must be an object');
  for (const [target, value] of Object.entries(destinations)) {
    if (!DELIVER_TARGETS.includes(target)) fail(`.destinations: unknown target "${target}" (known: ${DELIVER_TARGETS.join(', ')})`);
    if (typeof value !== 'string' || !value.trim()) fail(`.destinations.${target} must name where documents go (a space, folder, or project key)`);
  }
  if (workflow.grilling !== undefined) {
    const skill = workflow.grilling?.skill;
    if (!isObject(workflow.grilling) || (skill !== null && (typeof skill !== 'string' || !skill.trim()))) {
      fail('.grilling.skill must be a skill name, or null for the built-in grilling style');
    }
  }

  const pipelines = workflow.pipelines;
  if (!isObject(pipelines)) fail('.pipelines must be an object');
  let anyOn = false;
  for (const [name, pipeline] of Object.entries(pipelines)) {
    const rules = PIPELINES[name];
    const at = `.pipelines.${name}`;
    if (!rules) fail(`.pipelines: unknown pipeline "${name}" (known: ${Object.keys(PIPELINES).join(', ')})`);
    if (!isObject(pipeline)) fail(`${at} must be an object`);
    unknownKeys(pipeline, PIPELINE_KEYS, `${where}${at}`);
    if (typeof pipeline.enabled !== 'boolean') fail(`${at}.enabled must be true or false`);
    anyOn ||= pipeline.enabled;
    if (!isObject(pipeline.stages)) fail(`${at}.stages must be an object`);
    for (const stageName of Object.keys(pipeline.stages)) {
      if (!rules[stageName]) fail(`${at}: unknown stage "${stageName}" (known: ${Object.keys(rules).join(', ')})`);
    }
    for (const [stageName, rule] of Object.entries(rules)) {
      const s = pipeline.stages[stageName];
      const sat = `${at}.stages.${stageName}`;
      if (s === undefined) {
        if (rule.required) fail(`${sat} is required — the ${name} pipeline cannot deliver without it`);
        continue;
      }
      if (!isObject(s)) fail(`${sat} must be an object`);
      unknownKeys(s, STAGE_KEYS, `${where}${sat}`);
      if (typeof s.enabled !== 'boolean') fail(`${sat}.enabled must be true or false`);
      if (rule.required && !s.enabled) fail(`${sat} cannot be disabled — the ${name} pipeline cannot deliver without it`);
      if (!Number.isInteger(s.agents) || s.agents < 1 || s.agents > rule.maxAgents) {
        fail(`${sat}.agents must be a whole number from 1 to ${rule.maxAgents} (got ${JSON.stringify(s.agents)})`);
      }
      if (s.agent !== undefined && s.agent !== null && (typeof s.agent !== 'string' || !AGENT_NAME.test(s.agent))) {
        fail(`${sat}.agent must be a subagent name in lowercase-hyphen form, or null for the default workflow agent (got ${JSON.stringify(s.agent)})`);
      }
      if (!Array.isArray(s.skills) || s.skills.some((skill) => typeof skill !== 'string' || !skill.trim())) {
        fail(`${sat}.skills must be an array of skill names (empty is fine)`);
      }
      if (s.lenses !== undefined && !rule.lenses) fail(`${sat}.lenses: only a review stage has lenses`);
      if (rule.lenses && s.enabled) {
        if (!Array.isArray(s.lenses) || s.lenses.length === 0) fail(`${sat}.lenses must list at least one review lens`);
        if (s.lenses.length > rule.maxAgents) fail(`${sat}.lenses: at most ${rule.maxAgents} lenses`);
        const seen = new Set();
        for (const [i, l] of s.lenses.entries()) {
          if (!isObject(l) || typeof l.name !== 'string' || !AGENT_NAME.test(l.name)) {
            fail(`${sat}.lenses[${i}] must be { "name": "<lowercase-hyphen>", "agent": <subagent name or null> }`);
          }
          unknownKeys(l, new Set(['name', 'agent']), `${where}${sat}.lenses[${i}]`);
          if (l.agent !== undefined && l.agent !== null && (typeof l.agent !== 'string' || !AGENT_NAME.test(l.agent))) {
            fail(`${sat}.lenses[${i}].agent must be a subagent name in lowercase-hyphen form, or null`);
          }
          if (seen.has(l.name)) fail(`${sat}.lenses: "${l.name}" appears twice — two identical lenses give two answers and no way to choose`);
          seen.add(l.name);
        }
      }
      if (s.targets !== undefined && !rule.targets) fail(`${sat}.targets: only the deliver stage has targets`);
      if (rule.targets && s.targets !== undefined) {
        if (!Array.isArray(s.targets)) fail(`${sat}.targets must be an array (empty = the vault only)`);
        for (const target of s.targets) {
          if (!targetsFor(name).includes(target)) {
            fail(`${sat}.targets: "${target}" is not a target for ${name} (allowed: ${targetsFor(name).join(', ')})`);
          }
          // A target whose integration is switched off, or that names nowhere to publish, reads
          // as configured and delivers nothing.
          if (rootConfig.integrations?.[target] !== true) {
            fail(`${sat}.targets: "${target}" needs integrations.${target} set to true`);
          }
          if (!destinations[target]) fail(`${sat}.targets: "${target}" needs workflow.destinations.${target}`);
        }
      }
      if (rule.needs && s.enabled && pipeline.stages[rule.needs]?.enabled !== true) {
        fail(`${sat} needs the ${rule.needs} stage on — it has nothing to work from otherwise`);
      }
    }
  }
  if (!anyOn) fail('.pipelines: dynamic mode needs at least one pipeline on (or set mode to "classic")');
}

export function readWorkflow(rawConfig) {
  if (!rawConfig || rawConfig.workflow === undefined) return { mode: 'classic' };
  validateWorkflowConfig(rawConfig.workflow, rawConfig);
  return rawConfig.workflow;
}

// --- local-only vault --------------------------------------------------------------------
// Kept out of the remote through .git/info/exclude, never .gitignore: .gitignore is itself
// committed, so it would announce the vault it hides.

const EXCLUDE_START = '# blvck-pm:local:start';
const EXCLUDE_END = '# blvck-pm:local:end';

// Agent files are listed one by one rather than as .claude/agents/: a user's other agents may be
// meant for the team even when the vault is not.
export function localVaultPaths(paths, agents = []) {
  const dirs = new Set([paths.identity, path.dirname(paths.productContext), paths.templates, paths.outputs]
    .map((dir) => `/${dir.replace(/\/$/, '')}/`));
  return [...dirs, `/${CONFIG_JSON}`, ...agents.map((name) => `/${paths.agents}/${name}.md`), '/.claude/skills/', '/.agents/'];
}

export async function readLocalExclude(root) {
  const text = await readText(path.join(root, '.git', 'info', 'exclude'));
  if (text === null) return null;
  const start = text.indexOf(EXCLUDE_START);
  const end = text.indexOf(EXCLUDE_END);
  if (start === -1 || end < start) return null;
  return text.slice(start + EXCLUDE_START.length, end).split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function writeLocalExclude(root, entries) {
  if (!await isDir(path.join(root, '.git'))) {
    throw new VaultConfigError('--visibility local needs a git repository with a .git directory (a worktree or submodule checkout cannot hold its own exclude file)');
  }
  const excludePath = path.join(root, '.git', 'info', 'exclude');
  const current = (await readText(excludePath)) ?? '';
  const block = `${EXCLUDE_START}\n${entries.join('\n')}\n${EXCLUDE_END}\n`;
  const start = current.indexOf(EXCLUDE_START);
  const end = current.indexOf(EXCLUDE_END);
  const next = start !== -1 && end > start
    ? current.slice(0, start) + block + current.slice(end + EXCLUDE_END.length).replace(/^\n/, '')
    : `${current.replace(/\n*$/, current ? '\n\n' : '')}${block}`;
  await writeText(excludePath, next);
  return { path: excludePath, status: 'written' };
}
