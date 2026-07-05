// Adapted from harness-creator (walkinglabs/learn-harness-engineering, MIT).
// Additions: team layout (features/<id>/status.json directories), layout detection,
// team hygiene findings. Solo layout behavior is unchanged from upstream.
import { existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TEMPLATE_DIR = path.join(SKILL_ROOT, 'templates');
export const SUBSYSTEMS = ['instructions', 'state', 'verification', 'scope', 'lifecycle'];

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

export function scoreHarness(files, { layout = 'solo' } = {}) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const allText = files.map((file) => `${file.path}\n${file.content}`).join('\n\n');
  const agents = byPath.get('AGENTS.md') || byPath.get('CLAUDE.md') || '';
  const featureList = byPath.get('feature_list.json') || byPath.get('feature-list.json') || '';
  const progress = byPath.get('progress.md') || '';
  const init = byPath.get('init.sh') || '';
  const handoff = byPath.get('session-handoff.md') || '';

  // In team layout the state artifacts have different names; the instruction file
  // must route to those instead of the solo file names.
  const stateRoutingNeedles = layout === 'team'
    ? ['status.json', 'progress/']
    : ['feature_list.json', 'progress.md'];

  const checks = {
    instructions: [
      hasFile(byPath, ['AGENTS.md', 'CLAUDE.md'], 'Agent instruction file exists'),
      structuredHas(agents, ['Startup Workflow', 'Before writing code'], 'Startup workflow documented'),
      structuredHas(agents, ['Definition of Done', 'done only when'], 'Definition of done documented'),
      structuredHas(agents, ['Verification Commands', './init.sh', 'test', 'verify'], 'Verification commands discoverable'),
      structuredHas(agents, stateRoutingNeedles, 'State artifacts routed from instructions')
    ],
    state: [
      hasFile(byPath, ['feature_list.json', 'feature-list.json'], 'Feature tracker exists'),
      jsonFeatureList(featureList, 'Feature tracker is valid and has feature fields'),
      hasFile(byPath, ['progress.md'], 'Progress log exists'),
      structuredHas(progress, ['Current State', 'What', 'Next'], 'Progress log supports restart'),
      structuredHas(handoff || progress, ['Blockers', 'Files', 'Next Session'], 'Handoff captures blockers/files/next step')
    ],
    verification: [
      hasFile(byPath, ['init.sh'], 'Verification entrypoint exists'),
      textHas(init, ['set -e'], 'Verification fails fast'),
      textHas(init + agents, ['test', 'pytest', 'vitest', 'cargo test', 'go test', 'dotnet test'], 'Test command documented'),
      textHas(init + agents, ['build', 'type', 'lint', 'compile'], 'Static/build check documented'),
      textHas(allText, ['Evidence', 'Verification Evidence', 'command and output'], 'Verification evidence is recorded')
    ],
    scope: [
      structuredHas(agents, ['One feature at a time', 'one-feature-at-a-time'], 'One-feature-at-a-time rule exists'),
      textHas(featureList, ['dependencies'], 'Feature dependencies are tracked'),
      textHas(agents + featureList, ['status'], 'Feature status is explicit'),
      structuredHas(agents, ['Stay in scope', 'scope'], 'Scope boundary documented'),
      structuredHas(agents, ['Definition of Done'], 'Completion gate limits scope closure')
    ],
    lifecycle: [
      hasFile(byPath, ['init.sh'], 'Startup script exists'),
      structuredHas(agents, ['End of Session', 'Before ending'], 'End-of-session procedure exists'),
      hasFile(byPath, ['session-handoff.md'], 'Session handoff exists'),
      structuredHas(progress + '\n' + handoff, ['Last Updated', 'Current Objective', 'Recommended Next Step'], 'Session restart markers exist'),
      textHas(agents + init, ['restartable', 'clean', 'Next steps'], 'Clean restart path documented')
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

function hasFile(byPath, names, message) {
  return { pass: names.some((name) => byPath.has(name)), message };
}

function textHas(text, needles, message) {
  const lower = text.toLowerCase();
  return { pass: needles.some((needle) => lower.includes(needle.toLowerCase())), message };
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

function structuredHas(markdown, needles, message) {
  return textHas(structuredText(markdown), needles, message);
}

function jsonFeatureList(text, message) {
  try {
    const parsed = JSON.parse(text);
    const valid = Array.isArray(parsed.features) && parsed.features.every((feature) =>
      typeof feature.id === 'string'
      && typeof feature.name === 'string'
      && typeof feature.description === 'string'
      && typeof feature.status === 'string'
    );
    return { pass: valid, message };
  } catch {
    return { pass: false, message };
  }
}

export async function loadHarnessFiles(root) {
  const candidates = [
    'AGENTS.md',
    'CLAUDE.md',
    'feature_list.json',
    'feature-list.json',
    'progress.md',
    'session-handoff.md',
    'init.sh'
  ];
  const files = [];
  for (const candidate of candidates) {
    const fullPath = path.join(root, candidate);
    if (await exists(fullPath)) {
      files.push({ path: candidate, content: await readText(fullPath) });
    }
  }
  return files;
}

// Team layout normalization: aggregate features/*/status.json into one virtual
// feature_list.json and every features/*/progress/*.md into one virtual progress.md,
// so the same 25 scoring checks run against both layouts. The most recent session
// entry is also surfaced as the handoff — in team layout each session file carries
// its own handoff section by design, there is no separate session-handoff.md.
export async function loadHarnessFilesAuto(root, explicitLayout) {
  const layout = await detectLayout(root, explicitLayout);
  if (layout !== 'team') {
    return { layout: layout ?? 'solo', files: await loadHarnessFiles(root) };
  }

  const files = [];
  for (const candidate of ['AGENTS.md', 'CLAUDE.md', 'init.sh']) {
    const fullPath = path.join(root, candidate);
    if (await exists(fullPath)) {
      files.push({ path: candidate, content: await readText(fullPath) });
    }
  }

  const featureDirs = await listFeatureDirs(root);
  const features = [];
  const progressParts = [];
  let latestEntry = null;
  for (const dir of featureDirs) {
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
        progressParts.push(`## ${path.basename(dir)}/progress/${entry}\n\n${content}`);
        if (!latestEntry || entry >= latestEntry.name) {
          latestEntry = { name: entry, content };
        }
      }
    }
  }

  files.push({ path: 'feature_list.json', content: JSON.stringify({ features }, null, 2) });
  if (progressParts.length > 0) {
    files.push({ path: 'progress.md', content: progressParts.join('\n\n') });
  }
  if (latestEntry) {
    files.push({ path: 'session-handoff.md', content: latestEntry.content });
  }
  return { layout, files };
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

export function formatScoreReport(result, root = '.') {
  const lines = [
    `Harness validation for ${root}`,
    `Overall: ${result.overall}/100`,
    `Bottleneck: ${result.bottleneck ?? 'none — all subsystems at full score'}`,
    ''
  ];

  for (const [name, subsystem] of Object.entries(result.subsystems)) {
    lines.push(`${name}: ${subsystem.score}/5 (${subsystem.passed}/${subsystem.total})`);
    for (const check of subsystem.checks) {
      lines.push(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.message}`);
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
