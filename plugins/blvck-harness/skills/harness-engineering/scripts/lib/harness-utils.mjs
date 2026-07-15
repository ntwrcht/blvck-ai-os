// Adapted from harness-creator (walkinglabs/learn-harness-engineering, MIT).
// Additions: team layout (features/<id>/status.json directories), layout detection,
// team hygiene findings. Solo layout behavior is unchanged from upstream.
import { existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATE_DIR = path.join(SKILL_ROOT, 'templates');
export const SUBSYSTEMS = ['instructions', 'state', 'verification', 'scope', 'lifecycle'];

// The five things every harness has, whatever it names its files. Solo, team and user-mapped
// repos all resolve these to the same canonical virtual names, which is what lets one set of
// checks grade three different structures. See references/role-classification.md.
export const CONCEPTS = ['instructions', 'featureTracker', 'progressLog', 'sessionHandoff', 'verification'];

const CANONICAL_PATH = {
  instructions: 'AGENTS.md',
  featureTracker: 'feature_list.json',
  progressLog: 'progress.md',
  sessionHandoff: 'session-handoff.md',
  verification: 'init.sh'
};

// The instruction file has to name the state artifacts a reader should open next. Which names
// those are is a property of the resolved structure, not of a layout label — so each adapter
// declares them per concept and the scorer reads the union. These two reproduce the previous
// solo/team constants exactly; only the map path derives its own.
// Declared unconditionally, never from what resolved: an instruction file that routes to a
// tracker you have not written yet is still routing correctly. Absence is state's finding.
const SOLO_ROUTING_NEEDLES = { featureTracker: ['feature_list.json'], progressLog: ['progress.md'] };
const TEAM_ROUTING_NEEDLES = { featureTracker: ['status.json'], progressLog: ['progress/'] };

function flattenRoutingNeedles(needles) {
  return [...(needles.featureTracker ?? []), ...(needles.progressLog ?? [])];
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
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function writeText(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, 'utf8');
}

export async function copyTemplate(templateName, targetPath, replacements = {}, { force = false } = {}) {
  if (!force && await exists(targetPath)) {
    return { path: targetPath, status: 'skipped', reason: 'exists' };
  }

  let contents = await readText(path.join(TEMPLATE_DIR, templateName));
  for (const [key, value] of Object.entries(replacements)) {
    contents = contents.split(`{{${key}}}`).join(value);
  }
  await writeText(targetPath, contents);
  if (templateName.endsWith('.sh')) {
    await chmod(targetPath, 0o755);
  }
  return { path: targetPath, status: 'written' };
}

export function detectPackageManager(root, explicit) {
  if (explicit) return explicit;
  if (existsSync(path.join(root, 'bun.lockb')) || existsSync(path.join(root, 'bun.lock'))) return 'bun';
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function detectProject(root) {
  const files = await listFiles(root, { maxFiles: 800 });
  const has = (name) => files.some((file) => file === name || file.endsWith(`/${name}`));
  const hasPrefix = (prefix) => files.some((file) => file.startsWith(prefix));
  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = await exists(packageJsonPath).then((ok) => ok ? readJson(packageJsonPath) : null);

  let stack = 'generic';
  if (packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.react || hasPrefix('src/renderer')) stack = 'typescript-react';
    else if (deps.typescript || has('tsconfig.json')) stack = 'typescript';
    else stack = 'node';
  } else if (has('pyproject.toml') || has('requirements.txt')) {
    stack = 'python';
  } else if (has('go.mod')) {
    stack = 'go';
  } else if (has('Cargo.toml')) {
    stack = 'rust';
  } else if (has('pom.xml')) {
    stack = 'java-maven';
  } else if (has('build.gradle') || has('build.gradle.kts')) {
    stack = 'java-gradle';
  } else if (files.some((file) => file.endsWith('.csproj') || file.endsWith('.sln'))) {
    stack = 'dotnet';
  }

  return {
    root,
    stack,
    packageJson,
    files,
    packageManager: detectPackageManager(root)
  };
}

export async function listFiles(root, { maxFiles = 1000 } = {}) {
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__']);
  const results = [];

  async function walk(current, relative) {
    if (results.length >= maxFiles) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (ignored.has(entry.name)) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        results.push(rel);
      }
    }
  }

  await walk(root, '');
  return results.sort();
}

export function verificationCommands(project, explicitPackageManager) {
  const pm = explicitPackageManager || project.packageManager || 'npm';
  const scripts = project.packageJson?.scripts ?? {};
  const run = (script) => {
    if (pm === 'npm') return `npm run ${script}`;
    if (pm === 'yarn') return `yarn ${script}`;
    return `${pm} run ${script}`;
  };

  if (project.stack === 'python') {
    // python3 is the portable name (many systems no longer ship a bare `python`).
    // pytest exits 5 when it collects zero tests — harmless here, so don't let `set -e`
    // treat "no tests yet" as a failure. compileall's -x skips virtualenvs and build
    // artifacts so a syntax check doesn't choke on dependencies it shouldn't compile.
    const py = 'python3';
    return [
      `${py} -m pytest || [ $? -eq 5 ]`,
      `${py} -m compileall -q -x '(^|/)(\\.?venv|env|node_modules|build|dist|__pycache__)(/|$)' .`
    ];
  }

  if (project.stack === 'go') return ['go test ./...'];
  if (project.stack === 'rust') return ['cargo test'];
  if (project.stack === 'java-maven') return ['mvn test'];
  if (project.stack === 'java-gradle') return ['./gradlew test'];
  if (project.stack === 'dotnet') return ['dotnet test'];

  if (!project.packageJson) {
    return [
      'echo "No package manifest detected; replace this line with your project verification command."'
    ];
  }

  const install = pm === 'npm'
    ? 'npm install'
    : pm === 'yarn'
      ? 'yarn install'
      : `${pm} install`;
  const candidates = [
    scripts.check ? run('check') : null,
    scripts.typecheck ? run('typecheck') : null,
    scripts['type-check'] ? run('type-check') : null,
    scripts.lint ? run('lint') : null,
    scripts.test ? (pm === 'npm' ? 'npm test' : `${pm} test`) : null,
    scripts.build ? run('build') : null
  ].filter(Boolean);

  return [install, ...dedupe(candidates)];
}

export function initScriptFromCommands(commands, layout = 'solo') {
  const body = commands.map((command) => `echo "=== ${escapeForEcho(command)} ==="\n${command}`).join('\n\n');
  const nextSteps = layout === 'team'
    ? `echo "1. List features/*/status.json to see current feature state"
echo "2. Pick ONE unclaimed feature whose dependencies are done"
echo "3. Claim it: write your owner + branch into its status.json, commit early"
echo "4. Implement only that feature; log the session in its progress/ folder"
echo "5. Re-run verification before claiming done"`
    : `echo "1. Read feature_list.json to see current feature state"
echo "2. Pick ONE unfinished feature to work on"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming done"`;
  return `#!/bin/bash
set -e

echo "=== Harness Initialization ==="

${body}

echo "=== Verification Complete ==="
echo ""
echo "Next steps:"
${nextSteps}
`;
}

function escapeForEcho(value) {
  return value.replaceAll('"', '\\"');
}

export function dedupe(values) {
  return [...new Set(values)];
}

// Layout detection: a repo is "team" when features/<something>/status.json exists,
// "solo" when feature_list.json exists, otherwise null (no harness state yet).
export async function detectLayout(root, explicit) {
  if (explicit === 'solo' || explicit === 'team') return explicit;
  const featuresDir = path.join(root, 'features');
  if (await exists(featuresDir)) {
    let entries = [];
    try {
      entries = await readdir(featuresDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isDirectory() && await exists(path.join(featuresDir, entry.name, 'status.json'))) {
        return 'team';
      }
    }
  }
  if (await exists(path.join(root, 'feature_list.json')) || await exists(path.join(root, 'feature-list.json'))) {
    return 'solo';
  }
  return null;
}

export async function listFeatureDirs(root) {
  const featuresDir = path.join(root, 'features');
  if (!await exists(featuresDir)) return [];
  const entries = await readdir(featuresDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (entry.isDirectory() && await exists(path.join(featuresDir, entry.name, 'status.json'))) {
      dirs.push(path.join(featuresDir, entry.name));
    }
  }
  return dirs.sort();
}

// Scoring reads canonical virtual file names and the routing needles the loader resolved.
// It does not know whether the repo is solo, team, or user-mapped — every adapter hands it
// the same shape, which is what lets one check set grade three different structures.
export function scoreHarness(files, { routingNeedles = SOLO_ROUTING_NEEDLES, vocabulary = {} } = {}) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const allText = files.map((file) => `${file.path}\n${file.content}`).join('\n\n');
  const agents = byPath.get('AGENTS.md') || byPath.get('CLAUDE.md') || '';
  const featureList = byPath.get('feature_list.json') || byPath.get('feature-list.json') || '';
  const progress = byPath.get('progress.md') || '';
  const init = byPath.get('init.sh') || '';
  const handoff = byPath.get('session-handoff.md') || '';

  const stateRoutingNeedles = flattenRoutingNeedles(routingNeedles);

  // Map-declared synonyms ADD to the built-in needles, never replace them, and they still
  // route through structuredText — a synonym only earns a point from a heading, list, or
  // table. Vocabulary changes which word counts, never whether structure has to carry it.
  // `check.file` deliberately takes no vocabulary: existence is not a matter of wording.
  const withVocab = (id, needles) => (vocabulary[id] ? [...needles, ...vocabulary[id]] : needles);
  // Synonyms are appended after the built-ins and the primitives return the first match, so a
  // matched synonym means no built-in matched. Worth recording: the report discloses it rather
  // than letting the user's own wording quietly earn a point that looks like a standard pass.
  const tagSynonym = (id, result) => (result.matched && vocabulary[id]?.includes(result.matched)
    ? { ...result, matchedVia: 'synonym' }
    : result);
  const check = {
    file: (id, names, message) => hasFile(id, byPath, names, message),
    text: (id, text, needles, message) => tagSynonym(id, textHas(id, text, withVocab(id, needles), message)),
    structured: (id, markdown, needles, message) => tagSynonym(id, structuredHas(id, markdown, withVocab(id, needles), message)),
    json: (id, text, message) => jsonFeatureList(id, text, message)
  };

  const checks = {
    instructions: [
      check.file('instructions.exists', ['AGENTS.md', 'CLAUDE.md'], 'Agent instruction file exists'),
      check.structured('instructions.startupWorkflow', agents, ['Startup Workflow', 'Before writing code'], 'Startup workflow documented'),
      check.structured('instructions.definitionOfDone', agents, ['Definition of Done', 'done only when'], 'Definition of done documented'),
      check.structured('instructions.verificationCommands', agents, ['Verification Commands', './init.sh', 'test', 'verify'], 'Verification commands discoverable'),
      check.structured('instructions.stateRouting', agents, stateRoutingNeedles, 'State artifacts routed from instructions')
    ],
    state: [
      check.file('state.trackerExists', ['feature_list.json', 'feature-list.json'], 'Feature tracker exists'),
      check.json('state.trackerSchema', featureList, 'Feature tracker is valid and has feature fields'),
      check.file('state.progressExists', ['progress.md'], 'Progress log exists'),
      check.structured('state.progressRestart', progress, ['Current State', 'What', 'Next'], 'Progress log supports restart'),
      check.structured('state.handoffContent', handoff || progress, ['Blockers', 'Files', 'Next Session'], 'Handoff captures blockers/files/next step')
    ],
    verification: [
      check.file('verification.entrypointExists', ['init.sh'], 'Verification entrypoint exists'),
      check.text('verification.failsFast', init, ['set -e'], 'Verification fails fast'),
      check.text('verification.testCommand', init + agents, ['test', 'pytest', 'vitest', 'cargo test', 'go test', 'dotnet test'], 'Test command documented'),
      check.text('verification.staticCheck', init + agents, ['build', 'type', 'lint', 'compile'], 'Static/build check documented'),
      check.text('verification.evidence', allText, ['Evidence', 'Verification Evidence', 'command and output'], 'Verification evidence is recorded')
    ],
    scope: [
      check.structured('scope.oneFeatureAtATime', agents, ['One feature at a time', 'one-feature-at-a-time'], 'One-feature-at-a-time rule exists'),
      check.text('scope.dependencies', featureList, ['dependencies'], 'Feature dependencies are tracked'),
      check.text('scope.statusExplicit', agents + featureList, ['status'], 'Feature status is explicit'),
      check.structured('scope.boundary', agents, ['Stay in scope', 'scope'], 'Scope boundary documented'),
      check.structured('scope.completionGate', agents, ['Definition of Done'], 'Completion gate limits scope closure')
    ],
    lifecycle: [
      // Same predicate as verification.entrypointExists, deliberately: the startup script
      // IS the verification entrypoint, and each subsystem must read on its own. The link
      // lets the fix list say "one file clears both" instead of showing two unrelated fails.
      linkedTo(check.file('lifecycle.startupScript', ['init.sh'], 'Startup script exists'), 'verification.entrypointExists'),
      check.structured('lifecycle.endOfSession', agents, ['End of Session', 'Before ending'], 'End-of-session procedure exists'),
      check.file('lifecycle.handoffExists', ['session-handoff.md'], 'Session handoff exists'),
      check.structured('lifecycle.restartMarkers', progress + '\n' + handoff, ['Last Updated', 'Current Objective', 'Recommended Next Step'], 'Session restart markers exist'),
      check.text('lifecycle.cleanRestart', agents + init, ['restartable', 'clean', 'Next steps'], 'Clean restart path documented')
    ]
  };

  const subsystems = Object.fromEntries(Object.entries(checks).map(([name, subsystemChecks]) => {
    const passed = subsystemChecks.filter((check) => check.pass).length;
    const score = Math.max(1, Math.round((passed / subsystemChecks.length) * 5));
    return [name, {
      score,
      passed,
      total: subsystemChecks.length,
      checks: subsystemChecks
    }];
  }));

  const total = Object.values(subsystems).reduce((sum, item) => sum + item.score, 0);
  const overall = Math.round((total / (SUBSYSTEMS.length * 5)) * 100);
  const ranked = Object.entries(subsystems).sort((a, b) => a[1].score - b[1].score);
  // A bottleneck only means something when a subsystem is weaker than the rest.
  // When every subsystem already maxes out, reporting one is misleading.
  const bottleneck = ranked[0][1].score === 5 ? null : ranked[0][0];
  return { overall, bottleneck, subsystems };
}

// Every check carries a stable id so the fix list, the map's vocabulary overrides, and
// anything parsing --json can name a check without string-matching its English message.
// Ids are permanent: never renamed, never reordered, never reused for different logic.
function hasFile(id, byPath, names, message) {
  const matched = names.find((name) => byPath.has(name)) ?? null;
  return { id, kind: 'file', pass: matched !== null, message, matched };
}

// Reports which needle matched, not just that one did — an adapted harness scores against
// the user's own words, so the report has to be able to say which word earned the point.
function textHas(id, text, needles, message) {
  const lower = text.toLowerCase();
  const matched = needles.find((needle) => lower.includes(needle.toLowerCase())) ?? null;
  return { id, kind: 'text', pass: matched !== null, message, matched };
}

function linkedTo(check, otherId) {
  return { ...check, sharedWith: otherId };
}

// A real instruction doc carries its load-bearing phrases in structure — headings,
// list items, tables, fenced code, or bold lead-ins — not in free prose. Scoring only
// the structured lines means a genuine harness still passes, while a file that just
// sprinkles the right keywords across a paragraph to game the score does not.
function structuredText(markdown) {
  const kept = [];
  let inFence = false;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { kept.push(line); continue; }
    if (!line) continue;
    const isHeading = /^#{1,6}\s/.test(line);
    const isList = /^([-*+]|\d+\.)\s/.test(line);
    const isTable = line.startsWith('|');
    const isBoldLead = /^\*\*[^*]+\*\*/.test(line);
    if (isHeading || isList || isTable || isBoldLead) kept.push(line);
  }
  return kept.join('\n');
}

function structuredHas(id, markdown, needles, message) {
  return { ...textHas(id, structuredText(markdown), needles, message), kind: 'structured' };
}

function jsonFeatureList(id, text, message) {
  try {
    const parsed = JSON.parse(text);
    const valid = Array.isArray(parsed.features) && parsed.features.every((feature) =>
      typeof feature.id === 'string'
      && typeof feature.name === 'string'
      && typeof feature.description === 'string'
      && typeof feature.status === 'string'
    );
    return { id, kind: 'json', pass: valid, message, matched: null };
  } catch {
    return { id, kind: 'json', pass: false, message, matched: null };
  }
}

// ---------------------------------------------------------------------------
// User map (.harness-map.json) — the third adapter, alongside solo and team.
// ---------------------------------------------------------------------------

export const MAP_FILENAME = '.harness-map.json';
const TRACKER_FIELDS = ['id', 'name', 'description', 'status', 'dependencies'];
// Concepts scoring reads as one file. The rest aggregate.
const SINGLE_VALUED = new Set(['sessionHandoff']);

// Derived by running the check set, never hand-listed: a second list would drift the first
// time someone adds a check, and a vocabulary key that silently matches nothing is exactly
// the failure this feature exists to remove.
const ALL_CHECKS = Object.values(scoreHarness([]).subsystems).flatMap((subsystem) => subsystem.checks);
export const CHECK_IDS = new Set(ALL_CHECKS.map((check) => check.id));
// Only phrase checks take synonyms. No wording makes a missing file present, so declaring
// vocabulary on an existence check is a mistake worth naming rather than ignoring.
export const VOCABULARY_CHECK_IDS = new Set(
  ALL_CHECKS.filter((check) => check.kind === 'text' || check.kind === 'structured').map((check) => check.id)
);

export class HarnessMapError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HarnessMapError';
  }
}

function normalizePaths(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function validateHarnessMap(map, label) {
  const fail = (message) => {
    throw new HarnessMapError(`${label}: ${message}`);
  };
  if (!map || typeof map !== 'object' || Array.isArray(map)) fail('must be a JSON object');

  // `version` is required so a file that merely shares the name is rejected loudly instead of
  // being silently reinterpreted as a map.
  if (map.version !== 1) {
    fail(map.version === undefined
      ? 'missing "version". If this is not a harness map, rename it or point --map elsewhere'
      : `unsupported "version" ${JSON.stringify(map.version)} — this build understands 1`);
  }
  if (map.concepts === undefined && map.vocabulary === undefined) {
    fail('declares neither "concepts" nor "vocabulary", so it would change nothing');
  }
  if (map.layout !== undefined && map.layout !== 'solo' && map.layout !== 'team') {
    fail(`"layout" must be "solo" or "team" (got ${JSON.stringify(map.layout)}). "adapted" is what the report calls the result, not something you declare`);
  }

  for (const [concept, spec] of Object.entries(map.concepts ?? {})) {
    if (!CONCEPTS.includes(concept)) fail(`unknown concept "${concept}". Known concepts: ${CONCEPTS.join(', ')}`);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail(`concepts.${concept} must be an object`);
    const paths = normalizePaths(spec.paths ?? spec.path);
    if (paths.length === 0) fail(`concepts.${concept} declares no "paths"`);
    for (const declared of paths) {
      if (typeof declared !== 'string' || !declared.trim()) fail(`concepts.${concept}.paths must be non-empty strings`);
      if (path.isAbsolute(declared)) fail(`concepts.${concept}: "${declared}" is absolute — declare paths relative to the repo root`);
    }
    if (spec.pick !== undefined && spec.pick !== 'first' && spec.pick !== 'last') {
      fail(`concepts.${concept}.pick must be "first" or "last" (got ${JSON.stringify(spec.pick)})`);
    }
    if (spec.shape !== undefined) {
      if (concept !== 'featureTracker') fail(`concepts.${concept}: "shape" only applies to featureTracker`);
      if (!spec.shape || typeof spec.shape !== 'object' || Array.isArray(spec.shape)) fail('concepts.featureTracker.shape must be an object');
      if (spec.shape.collection !== undefined && typeof spec.shape.collection !== 'string') {
        fail('concepts.featureTracker.shape.collection must be a string');
      }
      for (const [canonical, source] of Object.entries(spec.shape.fields ?? {})) {
        if (!TRACKER_FIELDS.includes(canonical)) {
          fail(`concepts.featureTracker.shape.fields: unknown field "${canonical}". Known fields: ${TRACKER_FIELDS.join(', ')}`);
        }
        if (typeof source !== 'string' || !source.trim()) fail(`concepts.featureTracker.shape.fields.${canonical} must be a non-empty string`);
      }
    }
  }

  for (const [id, extra] of Object.entries(map.vocabulary ?? {})) {
    if (!CHECK_IDS.has(id)) fail(`vocabulary targets unknown check "${id}"`);
    if (!VOCABULARY_CHECK_IDS.has(id)) {
      fail(`vocabulary targets "${id}", which tests whether a file exists rather than how it is worded — declare its path under "concepts" instead`);
    }
    if (!Array.isArray(extra) || extra.length === 0 || extra.some((needle) => typeof needle !== 'string' || !needle.trim())) {
      fail(`vocabulary["${id}"] must be a non-empty array of non-empty strings`);
    }
  }
}

export async function readHarnessMap(root, explicitPath) {
  const mapPath = explicitPath ? path.resolve(root, explicitPath) : path.join(root, MAP_FILENAME);
  const label = path.relative(root, mapPath) || path.basename(mapPath);
  if (!await exists(mapPath)) {
    // An absent default just means "this repo does not use a map" — the common case, and the
    // reason an unmapped repo behaves exactly as it did before this feature existed. An
    // explicitly requested map that is missing is a different claim, and an error.
    if (explicitPath) throw new HarnessMapError(`--map ${explicitPath}: no such file`);
    return null;
  }
  let raw;
  try {
    raw = await readJson(mapPath);
  } catch (error) {
    throw new HarnessMapError(`${label} is not valid JSON: ${error.message}`);
  }
  validateHarnessMap(raw, label);
  return { ...raw, path: label };
}

// Segment-aware glob: `*` stays inside one path segment, `**` spans them. Enough to declare
// where files live, deliberately not a general glob implementation.
function globToRegExp(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`${out}$`);
}

const isGlob = (pattern) => /[*?]/.test(pattern);

function expandDeclaredPaths(declared, allFiles) {
  const matches = [];
  for (const pattern of declared) {
    if (isGlob(pattern)) {
      const regExp = globToRegExp(pattern);
      matches.push(...allFiles.filter((file) => regExp.test(file)));
    } else {
      matches.push(pattern);
    }
  }
  return dedupe(matches);
}

// The map is a repo file telling this script what to read, and --json prints what it read
// back out. Without containment, a pull request could add a map pointing at ~/.ssh and
// exfiltrate it through CI. realpath rather than resolve, because readFile follows symlinks:
// the link's target is what actually gets read.
async function assertInsideRoot(root, candidate, label) {
  let realRoot;
  try {
    realRoot = await realpath(root);
  } catch {
    realRoot = path.resolve(root);
  }
  // Resolve against the *real* root, not the raw one. Both have to be in the same namespace
  // to be compared: on macOS a temp dir is handed out as /var/... while its realpath is
  // /private/var/..., so mixing the two rejects a merely-missing file as an escape attempt.
  const full = path.resolve(realRoot, candidate);
  let realFull;
  try {
    realFull = await realpath(full);
  } catch {
    // Nothing there to resolve — judge the lexical path, which path.resolve has already
    // normalized. A genuinely missing file is reported separately by the caller.
    realFull = full;
  }
  if (realFull !== realRoot && !realFull.startsWith(realRoot + path.sep)) {
    throw new HarnessMapError(`${label}: "${candidate}" resolves outside the target directory`);
  }
  return full;
}

async function isDirectory(fullPath) {
  try {
    return (await stat(fullPath)).isDirectory();
  } catch {
    return false;
  }
}

async function readDeclaredFiles(root, concept, spec, allFiles, errors) {
  const declared = normalizePaths(spec.paths ?? spec.path);
  const single = SINGLE_VALUED.has(concept);
  const read = [];

  for (const candidate of expandDeclaredPaths(declared, allFiles)) {
    const full = await assertInsideRoot(root, candidate, `concepts.${concept}`);
    if (!await exists(full)) {
      errors.push({ concept, declared: candidate, status: 'missing', message: `concepts.${concept}: "${candidate}" does not exist` });
      continue;
    }
    if (await isDirectory(full)) {
      if (single) {
        errors.push({ concept, declared: candidate, status: 'directory', message: `concepts.${concept}: "${candidate}" is a directory, but ${concept} resolves to a single file` });
        continue;
      }
      const suffix = concept === 'featureTracker' ? '/**/*.json' : '/**/*';
      const trimmed = candidate.replace(/\/+$/, '');
      for (const nested of expandDeclaredPaths([trimmed + suffix], allFiles)) {
        read.push({ path: nested, content: await readText(path.join(root, nested)) });
      }
      continue;
    }
    read.push({ path: candidate, content: await readText(full) });
  }

  if (single && read.length > 1) {
    const sorted = [...read].sort((a, b) => a.path.localeCompare(b.path));
    return [spec.pick === 'last' ? sorted.at(-1) : sorted[0]];
  }
  return read;
}

// Field remapping, not invention: the user's own tracker fields are renamed into the canonical
// ones so the same schema check reads them. Originals are kept — the virtual file is a view,
// and dropping keys would lose information the user may be routing to. A concept the map never
// maps stays absent, and the check for it fails, which is the honest answer.
function mapTrackerFields(item, fields) {
  if (!fields || !item || typeof item !== 'object' || Array.isArray(item)) return item;
  const out = { ...item };
  for (const [canonical, source] of Object.entries(fields)) {
    if (source in item) out[canonical] = item[source];
  }
  return out;
}

function normalizeTracker(sources, shape) {
  const features = [];
  for (const { path: source, content } of sources) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      features.push({ id: source, invalid: true });
      continue;
    }
    let items;
    if (shape?.collection) items = parsed?.[shape.collection];
    else if (Array.isArray(parsed)) items = parsed;
    else if (Array.isArray(parsed?.features)) items = parsed.features;
    else items = [parsed];
    if (!Array.isArray(items)) items = [items];
    for (const item of items) features.push(mapTrackerFields(item, shape?.fields));
  }
  return JSON.stringify({ features }, null, 2);
}

// Which names the instruction file should be routing to, read off what the map declares.
// Derivation runs only here — solo and team keep their literal constants, so the paths that
// init.sh already guards cannot shift underneath them.
function needlesFromDeclared(declared) {
  const out = [];
  for (const pattern of declared) {
    const segments = pattern.split('/');
    const globAt = segments.findIndex(isGlob);
    if (globAt === -1) {
      out.push(segments.at(-1));
      if (segments.length > 1) out.push(`${segments.slice(0, -1).join('/')}/`);
    } else if (globAt > 0) {
      out.push(`${segments.slice(0, globAt).join('/')}/`);
    }
  }
  return dedupe(out.filter(Boolean));
}

export async function loadMappedHarnessFiles(root, map, base) {
  const files = [...base.files];
  const resolution = { ...base.resolution };
  const routingNeedles = { ...base.routingNeedles };
  const errors = [];
  const allFiles = await listFiles(root);

  for (const [concept, spec] of Object.entries(map.concepts ?? {})) {
    const declared = normalizePaths(spec.paths ?? spec.path);
    const canonical = CANONICAL_PATH[concept];
    const found = await readDeclaredFiles(root, concept, spec, allFiles, errors);

    // Every built-in name for this concept leaves the file set, including any the base adapter
    // loaded: the map says where this concept lives, so a leftover CLAUDE.md must not keep
    // feeding allText once instructions point somewhere else.
    const drop = new Set([...(SOLO_CONCEPT_CANDIDATES[concept] ?? []), canonical]);
    for (let i = files.length - 1; i >= 0; i -= 1) {
      if (drop.has(files[i].path)) files.splice(i, 1);
    }

    if (concept === 'featureTracker' || concept === 'progressLog') {
      const needles = needlesFromDeclared(declared);
      if (needles.length > 0) routingNeedles[concept] = needles;
    }

    if (found.length === 0) {
      // A declared path is an assertion. When it is wrong, say so — never quietly fall back to
      // a built-in name, or a typo in the map reads as a harness that is simply missing a file.
      resolution[concept] = { canonical, sources: [], declared, via: 'unresolved' };
      continue;
    }

    const content = concept === 'featureTracker'
      ? normalizeTracker(found, spec.shape)
      : found.map((file) => file.content).join('\n\n');

    files.push({ path: canonical, content });
    resolution[concept] = { canonical, sources: found.map((file) => file.path), declared, via: 'map' };
  }

  return { files, resolution, routingNeedles, mapErrors: errors };
}

// Built-in names, tried in order. A concept resolves to the first of its candidates that
// exists, but every candidate that exists is still loaded — allText spans the whole harness.
const SOLO_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'feature_list.json',
  'feature-list.json',
  'progress.md',
  'session-handoff.md',
  'init.sh'
];

const SOLO_CONCEPT_CANDIDATES = {
  instructions: ['AGENTS.md', 'CLAUDE.md'],
  featureTracker: ['feature_list.json', 'feature-list.json'],
  progressLog: ['progress.md'],
  sessionHandoff: ['session-handoff.md'],
  verification: ['init.sh']
};

function emptyResolution() {
  return Object.fromEntries(CONCEPTS.map((concept) =>
    [concept, { canonical: CANONICAL_PATH[concept], sources: [], via: 'unresolved' }]));
}

export async function loadSoloHarnessFiles(root) {
  const files = [];
  for (const candidate of SOLO_CANDIDATES) {
    const fullPath = path.join(root, candidate);
    if (await exists(fullPath)) {
      files.push({ path: candidate, content: await readText(fullPath) });
    }
  }

  const resolution = emptyResolution();
  for (const [concept, names] of Object.entries(SOLO_CONCEPT_CANDIDATES)) {
    const found = names.find((name) => files.some((file) => file.path === name));
    if (found) resolution[concept] = { canonical: found, sources: [found], via: 'builtin' };
  }
  return { files, resolution, routingNeedles: SOLO_ROUTING_NEEDLES };
}

// Team layout normalization: aggregate features/*/status.json into one virtual
// feature_list.json and every features/*/progress/*.md into one virtual progress.md,
// so the same 25 scoring checks run against both layouts. The most recent session
// entry is also surfaced as the handoff — in team layout each session file carries
// its own handoff section by design, there is no separate session-handoff.md.
export async function loadTeamHarnessFiles(root) {
  const files = [];
  const resolution = emptyResolution();
  for (const candidate of ['AGENTS.md', 'CLAUDE.md', 'init.sh']) {
    const fullPath = path.join(root, candidate);
    if (await exists(fullPath)) {
      files.push({ path: candidate, content: await readText(fullPath) });
    }
  }

  const instructions = ['AGENTS.md', 'CLAUDE.md'].find((name) => files.some((file) => file.path === name));
  if (instructions) resolution.instructions = { canonical: instructions, sources: [instructions], via: 'builtin' };
  if (files.some((file) => file.path === 'init.sh')) {
    resolution.verification = { canonical: 'init.sh', sources: ['init.sh'], via: 'builtin' };
  }

  const featureDirs = await listFeatureDirs(root);
  const features = [];
  const progressParts = [];
  const trackerSources = [];
  const progressSources = [];
  let latestEntry = null;
  for (const dir of featureDirs) {
    trackerSources.push(path.relative(root, path.join(dir, 'status.json')));
    try {
      features.push(await readJson(path.join(dir, 'status.json')));
    } catch {
      features.push({ id: path.basename(dir), invalid: true });
    }
    const progressDir = path.join(dir, 'progress');
    if (await exists(progressDir)) {
      const entries = (await readdir(progressDir)).filter((name) => name.endsWith('.md')).sort();
      for (const entry of entries) {
        const content = await readText(path.join(progressDir, entry));
        const source = path.relative(root, path.join(progressDir, entry));
        progressParts.push(`## ${path.basename(dir)}/progress/${entry}\n\n${content}`);
        progressSources.push(source);
        if (!latestEntry || entry >= latestEntry.name) {
          latestEntry = { name: entry, content, source };
        }
      }
    }
  }

  files.push({ path: 'feature_list.json', content: JSON.stringify({ features }, null, 2) });
  resolution.featureTracker = { canonical: 'feature_list.json', sources: trackerSources, via: 'builtin' };
  if (progressParts.length > 0) {
    files.push({ path: 'progress.md', content: progressParts.join('\n\n') });
    resolution.progressLog = { canonical: 'progress.md', sources: progressSources, via: 'builtin' };
  }
  if (latestEntry) {
    files.push({ path: 'session-handoff.md', content: latestEntry.content });
    resolution.sessionHandoff = { canonical: 'session-handoff.md', sources: [latestEntry.source], via: 'builtin' };
  }
  return { files, resolution, routingNeedles: TEAM_ROUTING_NEEDLES };
}

// Dispatches to the adapter that matches the repo, and hands the scorer one shape regardless:
// canonical virtual files, a resolution recording which real file satisfied each concept, and
// the routing needles that structure implies.
//
// With no map this is the solo/team path exactly as it has always been — the map is an overlay
// on a base layout, never a replacement, so a repo that maps one file keeps built-in resolution
// for the rest and a repo that maps nothing is untouched.
export async function loadHarnessFilesAuto(root, { layout: explicit, mapPath } = {}) {
  const map = await readHarnessMap(root, mapPath);
  const baseLayout = (await detectLayout(root, explicit ?? map?.layout)) ?? 'solo';
  const base = baseLayout === 'team'
    ? await loadTeamHarnessFiles(root)
    : await loadSoloHarnessFiles(root);

  if (!map) {
    return {
      layout: baseLayout,
      baseLayout,
      files: base.files,
      resolution: base.resolution,
      routingNeedles: base.routingNeedles,
      mapErrors: [],
      map: null,
      vocabulary: {}
    };
  }

  const mapped = await loadMappedHarnessFiles(root, map, base);
  return {
    layout: 'adapted',
    baseLayout,
    files: mapped.files,
    resolution: mapped.resolution,
    routingNeedles: mapped.routingNeedles,
    mapErrors: mapped.mapErrors,
    map: { path: map.path, version: map.version },
    vocabulary: map.vocabulary ?? {}
  };
}

// Team hygiene findings that only make sense in the sharded layout.
// File-based only — branch existence and unpushed claims are checked by the
// /blvck-harness:validate command prompt, which can run git.
export async function teamFindings(root, { staleDays = 14, now = new Date() } = {}) {
  const findings = { danglingDependencies: [], duplicateSlugs: [], staleClaims: [], unclaimedInProgress: [], invalidStatusFiles: [] };
  const featureDirs = await listFeatureDirs(root);
  const features = [];
  for (const dir of featureDirs) {
    try {
      const data = await readJson(path.join(dir, 'status.json'));
      features.push({ dir, data });
    } catch {
      findings.invalidStatusFiles.push(path.basename(dir));
    }
  }

  const ids = new Set(features.map(({ data }) => data.id));
  const slugCount = new Map();
  for (const { data } of features) {
    // Slug = the id with its allocator prefix (date or ticket key) stripped.
    const slug = String(data.id ?? '').replace(/^feat-([0-9]{8}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z][A-Za-z0-9]*-[0-9]+)-/, '');
    slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCount) {
    if (slug && count > 1) findings.duplicateSlugs.push(`${slug} (${count} features share this slug — likely the same work minted twice)`);
  }

  for (const { dir, data } of features) {
    for (const dep of data.dependencies ?? []) {
      if (!ids.has(dep)) {
        findings.danglingDependencies.push(`${data.id} depends on ${dep}, which does not exist`);
      }
    }
    if (data.status === 'in-progress' && !data.owner) {
      findings.unclaimedInProgress.push(`${data.id} is in-progress with no owner`);
    }
    if (data.status === 'in-progress' && data.owner) {
      const progressDir = path.join(dir, 'progress');
      let latest = null;
      if (await exists(progressDir)) {
        const entries = (await readdir(progressDir)).filter((name) => /^\d{4}-\d{2}-\d{2}/.test(name)).sort();
        latest = entries.at(-1)?.slice(0, 10) ?? null;
      }
      const reference = latest ?? data.created ?? null;
      if (reference) {
        const ageDays = Math.floor((now - new Date(reference)) / 86400000);
        if (ageDays > staleDays) {
          findings.staleClaims.push(`${data.id} claimed by ${data.owner}, no progress entry for ${ageDays} days`);
        }
      }
    }
  }
  return findings;
}

export function formatTeamFindings(findings) {
  const sections = [
    ['Dangling dependencies', findings.danglingDependencies],
    ['Duplicate slugs', findings.duplicateSlugs],
    ['Stale claims', findings.staleClaims],
    ['In-progress without owner', findings.unclaimedInProgress],
    ['Invalid status.json files', findings.invalidStatusFiles]
  ];
  const lines = ['Team layout findings:'];
  let any = false;
  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    any = true;
    lines.push(`  ${title}:`);
    for (const item of items) lines.push(`    - ${item}`);
  }
  if (!any) lines.push('  none — claim and dependency hygiene is clean');
  return lines.join('\n');
}

function formatLayout(result) {
  if (result.layout !== 'adapted') return `Layout: ${result.layout}`;
  return `Layout: adapted (base: ${result.baseLayout}, map: ${result.map?.path ?? MAP_FILENAME})`;
}

// Always shown, mapped or not: an adapted score is only trustworthy if the report says which
// file earned it, and a built-in resolution is worth seeing for the same reason.
function formatResolution(resolution) {
  if (!resolution) return [];
  const lines = ['Resolution:'];
  for (const [concept, entry] of Object.entries(resolution)) {
    const from = entry.via === 'unresolved'
      ? (entry.declared?.length ? `(declared ${entry.declared.join(', ')} — not found)` : '(unresolved)')
      : entry.sources.join(', ');
    const suffix = entry.via === 'map' ? '  (map)' : '';
    lines.push(`  ${concept.padEnd(16)}${entry.canonical.padEnd(20)}<- ${from}${suffix}`);
  }
  return [...lines, ''];
}

export function formatScoreReport(result, root = '.') {
  const lines = [`Harness validation for ${root}`, formatLayout(result)];

  if (result.unscored) {
    // The floor makes an empty repo look like a 20/100 harness. It is not a measurement, and
    // saying so is the difference between "we could not find your harness" and "yours is bad".
    lines.push(
      '',
      'Unscored — no harness artifacts found. The nominal score below is a floor artifact, not a measurement.',
      'If this repo does have a harness under its own file names, run /blvck-harness:migrate to map it.'
    );
  }

  lines.push('', `Overall: ${result.overall}/100`, `Bottleneck: ${result.bottleneck ?? 'none — all subsystems at full score'}`, '');
  lines.push(...formatResolution(result.resolution));

  if (result.mapErrors?.length) {
    lines.push('Map errors (a declared path is an assertion; these are broken):');
    for (const error of result.mapErrors) lines.push(`  - ${error.message}`);
    lines.push('');
  }

  for (const [name, subsystem] of Object.entries(result.subsystems)) {
    lines.push(`${name}: ${subsystem.score}/5 (${subsystem.passed}/${subsystem.total})`);
    for (const check of subsystem.checks) {
      // Disclose a synonym match rather than hiding it — a point bought by the user's own
      // wording should say so, so the reader can judge whether it was earned.
      const via = check.matchedVia === 'synonym' ? ` (matched map synonym "${check.matched}")` : '';
      lines.push(`  ${check.pass ? 'PASS' : 'FAIL'} [${check.id}] ${check.message}${via}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function copyFileSafe(source, target, { force = false } = {}) {
  if (!force && await exists(target)) {
    return { path: target, status: 'skipped', reason: 'exists' };
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return { path: target, status: 'written' };
}
