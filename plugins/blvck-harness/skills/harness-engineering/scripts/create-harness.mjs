#!/usr/bin/env node
// Adapted from harness-creator (walkinglabs/learn-harness-engineering, MIT).
// Additions: --layout solo|team. Team scaffolds features/<id>/ directories
// (status.json + progress/) instead of a single feature_list.json. --mode dynamic adds the
// workflow config; --visibility local keeps the harness out of the remote.
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_AGENTS,
  DELIVERY_HOSTS,
  HarnessMapError,
  WORKFLOW_CONFIG_PATH,
  WORKFLOW_PRESETS,
  copyTemplate,
  defaultWorkflowConfig,
  detectLayout,
  detectPackageManager,
  detectProject,
  exists,
  initScriptFromCommands,
  localHarnessPaths,
  parseArgs,
  readText,
  upsertWorkflowModeSection,
  validateWorkflowConfig,
  verificationCommands,
  workflowModeSection,
  writeLocalExclude,
  writeText
} from './lib/harness-utils.mjs';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/create-harness.mjs [--target DIR] [--layout solo|team] [--agent-file AGENTS.md|CLAUDE.md] [--package-manager npm|pnpm|yarn|bun] [--commands "cmd one,cmd two"] [--feature-slug slug] [--jira-key KEY-123] [--owner name]
       [--mode classic|dynamic] [--preset recommended|lean|custom] [--host github|gitlab|none] [--target-branch main]
       [--visibility shared|local] [--no-agents] [--force]

Creates a minimal production harness.

solo layout (default):        team layout (parallel humans):
  AGENTS.md or CLAUDE.md        AGENTS.md or CLAUDE.md (+ Team Rules)
  feature_list.json             init.sh
  progress.md                   features/feat-<date|key>-<slug>/
  session-handoff.md              status.json
  init.sh                         progress/

Team feature IDs avoid running-number collisions: the date (or a Jira key via
--jira-key) is the allocator, so parallel branches never mint the same ID.
--mode dynamic writes ${WORKFLOW_CONFIG_PATH} and a Workflow Mode section in the
instruction file (inserted into an existing one, so a 1.x harness upgrades in place).
--mode dynamic also copies the four default stage personas (product-owner, tech-lead,
developer, qa-engineer) into .claude/agents/, skipping any that exist; --no-agents skips them
for a user who brings their own roster.
--visibility local lists the harness in .git/info/exclude so it never reaches the remote.

Existing files are skipped unless --force is set.

Exit codes: 0 written, 2 invalid flags.`);
  process.exit(0);
}

function usage(message) {
  console.error(`Error: ${message}`);
  process.exit(2);
}

const mode = args.mode ?? 'classic';
if (mode !== 'classic' && mode !== 'dynamic') usage(`--mode must be classic or dynamic (got ${JSON.stringify(mode)})`);
const preset = args.preset ?? 'recommended';
if (!WORKFLOW_PRESETS.includes(preset)) usage(`--preset must be one of ${WORKFLOW_PRESETS.join(', ')}`);
const host = args.host ?? 'none';
if (!DELIVERY_HOSTS.includes(host)) usage(`--host must be one of ${DELIVERY_HOSTS.join(', ')}`);
const visibility = args.visibility ?? 'shared';
if (visibility !== 'shared' && visibility !== 'local') usage('--visibility must be shared or local');

const target = path.resolve(args.target || args._[0] || process.cwd());
const agentFile = args.agentFile || 'CLAUDE.md';
const force = Boolean(args.force);
const layout = (args.layout === 'solo' || args.layout === 'team')
  ? args.layout
  : (await detectLayout(target) ?? 'solo');
const project = await detectProject(target);
project.packageManager = detectPackageManager(target, args.packageManager);
const commands = args.commands
  ? String(args.commands).split(',').map((command) => command.trim()).filter(Boolean)
  : verificationCommands(project, args.packageManager);

// A team harness is shared state by definition — claims and status only work if teammates see them.
if (layout === 'team' && visibility === 'local') {
  usage('a team layout cannot be local: teammates coordinate through the committed features/ directory. Use solo, or share the harness');
}

await mkdir(target, { recursive: true });

const isTeam = layout === 'team';
const today = new Date().toISOString().slice(0, 10);
const compactDate = today.replaceAll('-', '');

const soloBlocks = {
  STATE_READ_STEP: '**Read `feature_list.json`** to see current feature state',
  UPDATE_ARTIFACTS_RULE: '- **Update artifacts**: Before ending session, update `progress.md` and `feature_list.json`',
  REQUIRED_ARTIFACTS: `- \`feature_list.json\` — Feature state tracker (source of truth)
- \`progress.md\` — Session continuity log
- \`init.sh\` — Standard startup and verification path
- \`session-handoff.md\` — Optional, for larger sessions`,
  EVIDENCE_LOCATION: '`feature_list.json` or `progress.md`',
  END_OF_SESSION_STEPS: `1. Update \`progress.md\` with current state
2. Update \`feature_list.json\` with new feature status
3. Record any unresolved risks or blockers
4. Commit with descriptive message once work is in safe state
5. Leave repo clean enough for next session to run \`./init.sh\` immediately`,
  TEAM_RULES_SECTION: ''
};

const teamBlocks = {
  STATE_READ_STEP: '**List `features/*/status.json`** — pick exactly ONE unclaimed feature whose dependencies are done, then claim it: write your `owner` and `branch` into its `status.json` and commit that claim early',
  UPDATE_ARTIFACTS_RULE: '- **Update artifacts**: Before ending session, update your feature\'s `status.json` and add a new session file in its `progress/` folder',
  REQUIRED_ARTIFACTS: `- \`features/<id>/status.json\` — That feature's state: dependencies, status, phase, owner, branch, evidence (source of truth)
- \`features/<id>/tasks/tNN.json\` — Optional task breakdown, one file per acceptance criterion
- \`features/<id>/progress/YYYY-MM-DD-<author>.md\` — Session logs, one new file per session
- \`init.sh\` — Standard startup and verification path`,
  EVIDENCE_LOCATION: 'the feature\'s `status.json`',
  END_OF_SESSION_STEPS: `1. Add a new session file to your feature's \`progress/\` folder (never edit another session's file)
2. Update your feature's \`status.json\` with status and evidence
3. Record any unresolved risks or blockers in the session file's Handoff section
4. Commit with descriptive message once work is in safe state
5. Leave repo clean enough for next session to run \`./init.sh\` immediately`,
  TEAM_RULES_SECTION: `
## Team Rules

- **Claim before work**: write \`owner\` + \`branch\` into the feature's \`status.json\`, commit and push that claim early so parallel sessions see it
- **Never edit another owner's in-progress feature directory** — a merge conflict inside one \`features/<id>/\` means two people genuinely collided on the same work
- **One session = one new file** in that feature's \`progress/\` — never edit other sessions' logs
- **Feature IDs never use bare running numbers**: the date (\`feat-${compactDate}-slug\`) or a ticket key (\`feat-KEY-123-slug\`) is the allocator; task numbers (\`t01\`…) are fine because a claimed feature directory has one owner
`
};

const replacements = {
  AGENT_FILE_NAME: agentFile,
  PROJECT_PURPOSE: project.stack === 'generic'
    ? 'Project harness for reliable agent-assisted development.'
    : `Project harness for reliable agent-assisted development in a ${project.stack} codebase.`,
  VERIFICATION_COMMANDS: commands.map((command) => `- \`${command}\``).join('\n'),
  PRIMARY_VERIFICATION_COMMAND: './init.sh',
  WORKFLOW_MODE_SECTION: '',
  ...(isTeam ? teamBlocks : soloBlocks)
};

const results = [];
results.push(await copyTemplate('agents.md', path.join(target, agentFile), replacements, { force }));

if (isTeam) {
  const slug = (args.featureSlug || 'project-setup').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const featureId = args.jiraKey ? `feat-${args.jiraKey}-${slug}` : `feat-${compactDate}-${slug}`;
  const featureDir = path.join(target, 'features', featureId);
  results.push(await copyTemplate('team/status.json', path.join(featureDir, 'status.json'), {
    FEATURE_ID: featureId,
    FEATURE_NAME: 'Project Setup',
    FEATURE_DESCRIPTION: 'Confirm the project can install dependencies, run verification, and start from a clean checkout',
    PROJECT: project.stack,
    OWNER: args.owner || '',
    BRANCH: '',
    CREATED: today
  }, { force }));
  await mkdir(path.join(featureDir, 'progress'), { recursive: true });
} else {
  results.push(await copyTemplate('solo/feature-list.json', path.join(target, 'feature_list.json'), {}, { force }));
  results.push(await copyTemplate('solo/progress.md', path.join(target, 'progress.md'), {}, { force }));
  results.push(await copyTemplate('solo/session-handoff.md', path.join(target, 'session-handoff.md'), { AGENT_FILE_NAME: agentFile }, { force }));
}

// The config is only ever written in dynamic mode; its absence is what "classic" means, so a
// classic scaffold stays byte-identical to what 1.x produced.
if (mode === 'dynamic') {
  const configPath = path.join(target, WORKFLOW_CONFIG_PATH);
  let config = defaultWorkflowConfig({ preset: preset === 'custom' ? 'recommended' : preset, host, targetBranch: args.targetBranch || 'main' });
  if (preset === 'custom') config.preset = 'custom';
  if (force || !await exists(configPath)) {
    await writeText(configPath, `${JSON.stringify(config, null, 2)}\n`);
    results.push({ path: configPath, status: 'written' });
  } else {
    try {
      config = JSON.parse(await readText(configPath));
      validateWorkflowConfig(config);
    } catch (error) {
      usage(`${WORKFLOW_CONFIG_PATH} exists but is not usable: ${error.message}`);
    }
    results.push({ path: configPath, status: 'skipped', reason: 'exists — section rendered from it' });
  }
  // The section is a render of the config, so it is refreshed even when the instruction file
  // itself was skipped. That refresh is what makes setup's reconfigure path a single command.
  const agentPath = path.join(target, agentFile);
  const current = await readText(agentPath);
  const next = upsertWorkflowModeSection(current, workflowModeSection(config));
  if (next !== current) {
    await writeText(agentPath, next);
    const entry = results.find((result) => result.path === agentPath);
    entry.status = entry.status === 'written' ? 'written' : 'updated';
    entry.reason = 'Workflow Mode section';
  }
}

if (mode === 'dynamic' && !args.noAgents) {
  for (const name of DEFAULT_AGENTS) {
    results.push(await copyTemplate(`agents/${name}.md`, path.join(target, '.claude', 'agents', `${name}.md`), {}, { force }));
  }
}

if (visibility === 'local') {
  try {
    results.push(await writeLocalExclude(target, localHarnessPaths({ layout, agentFile })));
  } catch (error) {
    if (error instanceof HarnessMapError) usage(error.message);
    throw error;
  }
}

const initPath = path.join(target, 'init.sh');
if (force || !await exists(initPath)) {
  await writeText(initPath, initScriptFromCommands(commands, layout));
  await chmod(initPath, 0o755);
  results.push({ path: initPath, status: 'written' });
} else {
  results.push({ path: initPath, status: 'skipped', reason: 'exists' });
}

console.log(`Created ${layout} harness for ${target} (mode: ${mode}${mode === 'dynamic' ? `, preset: ${preset}` : ''}, visibility: ${visibility})`);
console.log(`Detected stack: ${project.stack}`);
console.log(`Verification commands:`);
for (const command of commands) {
  console.log(`  - ${command}`);
}
console.log('');
for (const result of results) {
  console.log(`${result.status.toUpperCase()} ${path.relative(target, result.path)}${result.reason ? ` (${result.reason})` : ''}`);
}
