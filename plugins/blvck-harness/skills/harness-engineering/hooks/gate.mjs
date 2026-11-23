#!/usr/bin/env node
// Guarded mode gates: Claude Code runs this as Stop, PreToolUse and PostToolUse hooks, and the agent
// runs it as a CLI. It imports nothing, because it is copied into the repo's git directory.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = '.claude/harness-workflow.json';
const SELF = path.resolve(process.argv[1]);
const [command = 'help', ...rest] = process.argv.slice(2);

function git(args, { cwd, env, allowFail = false } = {}) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.status === 0 ? result.stdout.trim() : null;
}

function readStdin() {
  if (process.stdin.isTTY) return {};
  try {
    const text = fs.readFileSync(0, 'utf8');
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// Hook output is JSON on stdout. Anything else a hook prints is ignored, so every exit goes
// through these three helpers.
function allow(message) {
  if (message) process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
  process.exit(0);
}
function blockStop(reason) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
  process.exit(0);
}
function denyTool(reason) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`);
  process.exit(0);
}

function locate(input) {
  const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const root = git(['rev-parse', '--show-toplevel'], { cwd: start, allowFail: true });
  if (!root) return null;
  const gitDir = git(['rev-parse', '--absolute-git-dir'], { cwd: root });
  return { root, gitDir, stateDir: path.join(gitDir, 'blvck-harness'), statePath: path.join(gitDir, 'blvck-harness', 'run.json') };
}

function readConfig(root) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), 'utf8'));
    return config && config.mode === 'guarded' ? config : null;
  } catch {
    return null;
  }
}

function readState(where) {
  try {
    return JSON.parse(fs.readFileSync(where.statePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(where, state) {
  fs.mkdirSync(where.stateDir, { recursive: true });
  fs.writeFileSync(where.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

// Hash of the working tree as git would commit it, minus the bookkeeping files. Leaving those out
// means updating the tracker after a review or a passing check does not void either one.
function codeTree(where, state) {
  const temp = path.join(where.stateDir, 'index.tmp');
  fs.mkdirSync(where.stateDir, { recursive: true });
  const realIndex = path.join(where.gitDir, 'index');
  if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, temp);
  else fs.rmSync(temp, { force: true });
  const env = { ...process.env, GIT_INDEX_FILE: temp };
  git(['add', '-A', '--', '.'], { cwd: where.root, env });
  const skip = [...state.trackerPaths, ...state.progressPaths].map((entry) => entry.replace(/\/+$/, ''));
  if (skip.length) git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...skip], { cwd: where.root, env });
  const tree = git(['write-tree'], { cwd: where.root, env });
  fs.rmSync(temp, { force: true });
  return tree;
}

// Content fingerprint of a file or folder. Works the same whether git tracks the path or a local
// harness keeps it out of git, which a plain git diff could not see.
function fingerprint(root, entry) {
  const hash = createHash('sha256');
  const walk = (full, rel) => {
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      hash.update(`missing:${rel}\n`);
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) walk(path.join(full, name), `${rel}/${name}`);
    } else {
      hash.update(`file:${rel}\n`);
      hash.update(fs.readFileSync(full));
    }
  };
  walk(path.join(root, entry), entry);
  return hash.digest('hex');
}

function changedGroup(where, state, key) {
  const paths = state[key];
  return paths.length === 0 || paths.some((entry) => fingerprint(where.root, entry) !== state.baseFingerprints[entry]);
}

function runVerification(where, state) {
  const result = spawnSync('bash', ['-c', state.verify], {
    cwd: where.root, encoding: 'utf8', timeout: 14 * 60 * 1000, maxBuffer: 64 * 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n').slice(-30).join('\n');
  return { passed: result.status === 0, output: result.error ? `${result.error.message}\n${output}` : output };
}

// The verification result is cached per code tree, so a stop that changed nothing does not pay
// for the whole suite again.
function verified(where, state, tree) {
  if (state.passes[tree]) return { passed: true };
  const result = runVerification(where, state);
  if (result.passed) state.passes[tree] = true;
  return result;
}

function reviewsOn(state, tree) {
  return state.reviews.filter((review) => review.tree === tree).length;
}

function missingGates(where, state, tree) {
  const missing = [];
  if (state.gates.verify) {
    const result = verified(where, state, tree);
    if (!result.passed) missing.push({ gate: 'verify', text: `Verification \`${state.verify}\` fails on the current code. Fix it and stop again. Last output:\n${result.output}` });
  }
  if (state.gates.bookkeeping) {
    if (!changedGroup(where, state, 'trackerPaths')) missing.push({ gate: 'tracker', text: `The feature tracker is unchanged since the run started. Update ${state.feature}'s status and evidence in ${state.trackerPaths.join(', ')}.` });
    if (!changedGroup(where, state, 'progressPaths')) missing.push({ gate: 'progress', text: `The progress log is unchanged since the run started. Record this session in ${state.progressPaths.join(', ')}.` });
  }
  if (state.review) {
    const done = reviewsOn(state, tree);
    if (done < state.review.agents) {
      missing.push({ gate: 'review', text: `Independent review: ${done} of ${state.review.agents} \`${state.review.agent}\` subagents have reviewed the current code. Start ${state.review.agents - done} more with the Agent tool (subagent_type "${state.review.agent}"), each with a different lens, then fix what they must-fix. Any code change after a review needs a new review.` });
    }
  }
  return missing;
}

const escapeHatch = () => `If only the user can clear what stops you (a service that is down, access you lack, a decision that is theirs), record it and stop:\n  node "${SELF}" block "<what is stuck>" --human "<what the user must do>"\nIf you need the user's answer to go on:\n  node "${SELF}" ask "<question>"`;

function blockerList(state) {
  return state.blockers.map((blocker, index) => `${index + 1}. ${blocker.what}\n   You: ${blocker.human}`).join('\n');
}

function onStop(input) {
  const where = locate(input);
  if (!where || !readConfig(where.root)) allow();
  const state = readState(where);
  if (!state || state.status !== 'active') allow();

  if (state.asks.some((ask) => !ask.answeredAt)) {
    for (const ask of state.asks) ask.answeredAt ??= new Date().toISOString();
    state.stuck = null;
    writeState(where, state);
    allow();
  }
  if (state.blockers.length) {
    state.status = 'blocked';
    writeState(where, state);
    allow(`blvck-harness: ${state.feature} is blocked on something only you can clear:\n${blockerList(state)}\nWhen it is cleared, tell the agent to continue. It runs: node "${SELF}" clear`);
  }

  const tree = codeTree(where, state);
  // Nothing built yet (planning, a question to the user): there is nothing to gate.
  if (tree === state.baseTree) allow();

  const missing = missingGates(where, state, tree);
  if (!missing.length) {
    state.status = 'complete';
    state.completedTree = tree;
    state.stuck = null;
    writeState(where, state);
    allow(`blvck-harness: every gate passed for ${state.feature} (verification, bookkeeping${state.review ? ', independent review' : ''}).`);
  }

  // The same gates failing on the same code means the agent is not getting anywhere. Turn that
  // into a blocker for the user well before Claude Code's own cap silently ends the loop.
  const key = `${tree}:${missing.map((item) => item.gate).join(',')}`;
  state.stuck = state.stuck && state.stuck.key === key ? { key, count: state.stuck.count + 1 } : { key, count: 1 };
  if (state.stuck.count > state.stuckAfter) {
    state.blockers.push({
      what: `The agent stopped ${state.stuckAfter + 1} times with the same unmet gates: ${missing.map((item) => item.gate).join(', ')}`,
      human: 'Read the last gate message in the session, clear the cause or tell the agent how, then tell the agent to continue',
      at: new Date().toISOString(),
      auto: true
    });
    state.status = 'blocked';
    writeState(where, state);
    allow(`blvck-harness: ${state.feature} is stuck. It needs you:\n${blockerList(state)}\n\nUnmet:\n${missing.map((item) => `- ${item.text}`).join('\n')}`);
  }
  writeState(where, state);
  blockStop(`blvck-harness gates for ${state.feature} are not met yet (attempt ${state.stuck.count} of ${state.stuckAfter}):\n\n${missing.map((item) => `- ${item.text}`).join('\n')}\n\n${escapeHatch()}`);
}

// Matches git with optional global flags (-C dir, -c k=v) before the subcommand.
const gitSub = (sub) => new RegExp(`(^|[\\s;&|(])git(\\s+-[cC]\\s+\\S+|\\s+--\\S+)*\\s+${sub}\\b`);
const DELIVERS = [gitSub('push'), /(^|[\s;&|(])gh\s+pr\s+create\b/, /(^|[\s;&|(])glab\s+mr\s+create\b/];

function onPreBash(input) {
  const commandText = input.tool_input?.command;
  if (typeof commandText !== 'string') allow();
  const commits = gitSub('commit').test(commandText);
  const delivers = DELIVERS.some((pattern) => pattern.test(commandText));
  if (!commits && !delivers) allow();
  const where = locate(input);
  if (!where || !readConfig(where.root)) allow();
  const state = readState(where);
  if (!state || !['active', 'blocked', 'complete'].includes(state.status)) allow();
  // A finished run still guards a push of code changed after it finished.
  if (state.status === 'complete' && !delivers) allow();

  if (state.status === 'blocked') {
    denyTool(`blvck-harness: ${state.feature} is blocked until the user clears:\n${blockerList(state)}`);
  }
  const tree = codeTree(where, state);
  if (delivers) {
    const missing = missingGates(where, state, tree);
    writeState(where, state);
    if (missing.length) denyTool(`blvck-harness: not ready to push or open a PR/MR for ${state.feature}:\n${missing.map((item) => `- ${item.text}`).join('\n')}`);
    allow();
  }
  if (state.gates.verify) {
    const result = verified(where, state, tree);
    writeState(where, state);
    if (!result.passed) denyTool(`blvck-harness: commit refused. Verification \`${state.verify}\` fails on the current code:\n${result.output}`);
  }
  allow();
}

function onPostAgent(input) {
  const type = input.tool_input?.subagent_type;
  if (typeof type !== 'string') allow();
  const where = locate(input);
  if (!where || !readConfig(where.root)) allow();
  const state = readState(where);
  if (!state || state.status !== 'active' || !state.review || type !== state.review.agent) allow();
  state.reviews.push({ tree: codeTree(where, state), agent: type, at: new Date().toISOString() });
  writeState(where, state);
  allow();
}

function option(name) {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
}
const list = (value) => (value ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : []);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(2);
}

function cliWhere() {
  const where = locate({});
  if (!where) fail('not inside a git repository');
  return where;
}

function start() {
  const where = cliWhere();
  const config = readConfig(where.root);
  if (!config) fail(`${CONFIG_PATH} is missing or not in guarded mode`);
  const feature = option('feature');
  if (!feature) fail('--feature <id> is required');
  const existing = readState(where);
  if (existing && ['active', 'blocked'].includes(existing.status) && existing.feature !== feature && !rest.includes('--replace')) {
    fail(`${existing.feature} is still ${existing.status}. Finish it, or pass --replace to drop its run state`);
  }
  const trackerPaths = list(option('tracker'));
  const progressPaths = list(option('progress'));
  if (config.gates.bookkeeping && (!trackerPaths.length || !progressPaths.length)) {
    fail('--tracker and --progress are required while the bookkeeping gate is on');
  }
  const review = config.gates.review?.enabled ? { agent: config.gates.review.agent, agents: config.gates.review.agents } : null;
  const state = {
    version: 1,
    feature,
    status: 'active',
    startedAt: new Date().toISOString(),
    verify: option('verify') || './init.sh',
    gates: { verify: config.gates.verify, bookkeeping: config.gates.bookkeeping },
    review,
    stuckAfter: config.gates.stuckAfter,
    trackerPaths,
    progressPaths,
    baseFingerprints: {},
    passes: {},
    reviews: [],
    blockers: [],
    asks: [],
    stuck: null
  };
  for (const entry of [...trackerPaths, ...progressPaths]) state.baseFingerprints[entry] = fingerprint(where.root, entry);
  state.baseTree = codeTree(where, state);
  // Resuming the same feature keeps what was already proven on this code.
  if (existing && existing.feature === feature) {
    state.passes = existing.passes || {};
    state.reviews = existing.reviews || [];
    state.baseFingerprints = existing.baseFingerprints || state.baseFingerprints;
    state.baseTree = existing.baseTree || state.baseTree;
    state.startedAt = existing.startedAt || state.startedAt;
  }
  writeState(where, state);
  console.log(`Guarded run started for ${feature}. Gates: verify (${state.verify})${state.gates.bookkeeping ? ', tracker and progress updated' : ''}${review ? `, ${review.agents} independent review(s) by ${review.agent}` : ''}.`);
}

function record(kind) {
  const where = cliWhere();
  const state = readState(where);
  if (!state || !['active', 'blocked'].includes(state.status)) fail('no guarded run is active');
  const text = rest.find((value, index) => !value.startsWith('--') && (index === 0 || !rest[index - 1].startsWith('--')));
  if (!text) fail(`say what to record: ${kind} "<text>"`);
  if (kind === 'block') {
    const human = option('human');
    if (!human) fail('--human "<what the user must do>" is required, so the user knows how to clear it');
    state.blockers.push({ what: text, human, at: new Date().toISOString() });
  } else {
    state.asks.push({ question: text, at: new Date().toISOString() });
  }
  writeState(where, state);
  console.log(kind === 'block' ? `Recorded. ${state.feature} now waits for the user:\n${blockerList(state)}` : 'Recorded. Ask the user and stop; the next stop is allowed.');
}

function clear() {
  const where = cliWhere();
  const state = readState(where);
  if (!state) fail('no guarded run to clear');
  const cleared = state.blockers.length;
  state.blockers = [];
  state.stuck = null;
  if (state.status === 'blocked') state.status = 'active';
  writeState(where, state);
  console.log(`Cleared ${cleared} blocker(s). ${state.feature} is active again; its gates apply on the next stop.`);
}

function status() {
  const where = cliWhere();
  const state = readState(where);
  if (rest.includes('--json')) {
    console.log(JSON.stringify(state ?? { status: 'none' }, null, 2));
    return;
  }
  if (!state) {
    console.log('No guarded run.');
    return;
  }
  const tree = codeTree(where, state);
  console.log(`${state.feature}: ${state.status}`);
  console.log(`- verification on the current code: ${state.passes[tree] ? 'passed' : 'not passed yet'}`);
  if (state.gates.bookkeeping) {
    console.log(`- tracker updated: ${changedGroup(where, state, 'trackerPaths') ? 'yes' : 'no'}`);
    console.log(`- progress updated: ${changedGroup(where, state, 'progressPaths') ? 'yes' : 'no'}`);
  }
  if (state.review) console.log(`- independent reviews of the current code: ${reviewsOn(state, tree)} of ${state.review.agents}`);
  if (state.blockers.length) console.log(`Needs the user:\n${blockerList(state)}`);
}

function end() {
  const where = cliWhere();
  fs.rmSync(where.statePath, { force: true });
  console.log('Guarded run state removed. The gates are off until the next run starts.');
}

const hooks = { stop: onStop, 'pre-bash': onPreBash, 'post-agent': onPostAgent };
const commands = { start, block: () => record('block'), ask: () => record('ask'), clear, status, end };

try {
  if (hooks[command]) {
    hooks[command](readStdin());
  } else if (commands[command]) {
    commands[command]();
  } else {
    console.log(`Usage: gate.mjs <start|block|ask|clear|status|end> [options]
  start --feature ID [--verify CMD] [--tracker a,b] [--progress c] [--replace]
  block "<what is stuck>" --human "<what the user must do>"
  ask "<question>"      clear      status [--json]      end
Hook entry points: stop, pre-bash, post-agent (read the hook JSON on stdin).`);
  }
} catch (error) {
  // A crashed gate must not trap the session. Exit 1 is a non-blocking hook error, so Claude
  // Code shows it and carries on, and preflight reports a broken install before the next run.
  console.error(`blvck-harness gate error: ${error.message}`);
  process.exit(1);
}
