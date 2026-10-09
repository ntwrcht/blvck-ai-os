#!/usr/bin/env node
// Runs the real workflows/feature.js against a fake workflow runtime: agent() answers from a
// script per label instead of spawning anything. This proves the orchestration — what runs,
// in what order, how many at once, when it stops — without spending a token. What it cannot
// prove is that a real agent follows its prompt; that is behavioral, and is not claimed here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultWorkflowConfig, validateWorkflowConfig } from '../plugins/blvck-harness/skills/harness-engineering/scripts/lib/harness-utils.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, '..', 'plugins/blvck-harness/skills/harness-engineering/workflows/feature.js');
const source = readFileSync(scriptPath, 'utf8');
if (!source.startsWith('export const meta = {')) throw new Error('feature.js must begin with `export const meta = {` — the workflow runtime requires it');
const body = source.replace(/^export const meta = /, 'const meta = ');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const compiled = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow', body);

const tick = () => new Promise((resolve) => setTimeout(resolve, 2));

async function run(argsIn, answer) {
  const calls = [];
  const active = {};
  const peak = {};
  const agent = async (prompt, opts = {}) => {
    const label = opts.label;
    const stage = label.split(/[:#]/)[0];
    calls.push({ label, prompt, opts });
    active[stage] = (active[stage] ?? 0) + 1;
    peak[stage] = Math.max(peak[stage] ?? 0, active[stage]);
    await tick();
    try {
      return answer(label, prompt, calls);
    } finally {
      active[stage] -= 1;
    }
  };
  const parallel = async (thunks) => Promise.all(thunks.map((thunk) => thunk().catch(() => null)));
  const result = await compiled(agent, parallel, null, () => {}, () => {}, argsIn, { total: null }, null);
  return { result, calls, peak, labels: calls.map((call) => call.label) };
}

const PLAN = { summary: 'add widgets', approach: 'do it', doneCriteria: ['widgets render'], risks: [], openQuestions: [] };
const pass = { pass: true, failures: [], ran: ['./init.sh'] };
const approve = { approve: true, mustFix: [], suggestions: [] };

function standard(overrides = {}) {
  return (label, prompt) => {
    if (overrides[label] !== undefined) return typeof overrides[label] === 'function' ? overrides[label](prompt) : overrides[label];
    const stage = label.split(/[:#]/)[0];
    switch (stage) {
      case 'plan': return PLAN;
      case 'audit': return { verdict: 'approve', issues: [], blockingQuestions: [] };
      case 'prepare-branch': return 'feat/feat-x';
      case 'breakdown': return { tasks: [{ id: 't01', title: 'one', spec: 's', files: ['a.js'], dependsOn: [] }] };
      case 'implement': return { status: 'done', branch: 'b', summary: 'did it', filesChanged: [] };
      case 'test': return pass;
      case 'review': return approve;
      case 'integrate': return { merged: [], conflicts: [] };
      case 'deliver': return { verificationPassed: true, evidence: 'ok', recordedIn: ['feature_list.json'], pushed: true, prUrl: 'https://example/pr/1' };
      case 'cleanup': return { removedWorktrees: [], deletedBranches: [], kept: [] };
      default: throw new Error(`unexpected agent label ${label}`);
    }
  };
}

const feature = { id: 'feat-x', name: 'Widgets', description: 'Add widgets' };
const baseArgs = (config) => {
  validateWorkflowConfig(config);
  return { config, feature, grilling: 'Q: which page? A: home', harness: { layout: 'solo', resolution: {} }, verification: './init.sh' };
};
let failures = 0;
function expect(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// 1. Overlapping files merge, the implement ceiling holds, and a clean run delivers.
{
  const config = defaultWorkflowConfig({ host: 'github' });
  config.stages.implement.agents = 1;
  const { result, labels, peak, calls } = await run(baseArgs(config), standard({
    breakdown: { tasks: [
      { id: 't01', title: 'a', spec: 's', files: ['a.js'], dependsOn: [] },
      { id: 't02', title: 'b', spec: 's', files: ['b.js'], dependsOn: [] },
      { id: 't03', title: 'c', spec: 's', files: ['a.js', 'c.js'], dependsOn: [] },
    ] },
  }));
  expect('tasks sharing a file are merged into one', result.tasks.length === 2, `got ${result.tasks.length}`);
  expect('implement never exceeds its ceiling', peak.implement === 1, `peak ${peak.implement}`);
  expect('a clean run delivers with the PR link', result.status === 'delivered' && result.prUrl === 'https://example/pr/1');
  expect('every stage of the recommended preset ran', ['plan', 'audit:1', 'breakdown', 'review:feature', 'deliver', 'cleanup'].every((label) => labels.includes(label)));
  expect('the PR targets the configured host and branch', calls.find((call) => call.label === 'deliver').prompt.includes('gh pr create --base main --head feat/feat-x'));
  expect('implementers run in worktrees', calls.filter((call) => call.label.startsWith('implement')).every((call) => call.opts.isolation === 'worktree'));
  const persona = (prefix) => calls.find((call) => call.label.startsWith(prefix)).opts.agentType;
  expect('each stage runs as its persona', persona('plan') === 'product-owner' && persona('audit') === 'tech-lead' && persona('implement') === 'developer' && persona('test') === 'qa-engineer' && persona('review') === 'tech-lead' && persona('deliver') === 'tech-lead');
  expect('mechanical stages use the default agent', persona('cleanup') === undefined && persona('integrate') === undefined && persona('prepare-branch') === undefined);
}

// 2. Parallel ceilings let several implementers run at once when the user allows it.
{
  const config = defaultWorkflowConfig();
  config.stages.implement.agents = 3;
  const tasks = Array.from({ length: 5 }, (_, i) => ({ id: `t0${i + 1}`, title: `${i}`, spec: 's', files: [`f${i}.js`], dependsOn: [] }));
  const { peak } = await run(baseArgs(config), standard({ breakdown: { tasks } }));
  expect('five independent tasks run three at a time under a ceiling of three', peak.implement === 3, `peak ${peak.implement}`);
}

// 3. Unclear requirements stop the run before any code is written.
{
  const { result, labels } = await run(baseArgs(defaultWorkflowConfig()), standard({ plan: { ...PLAN, openQuestions: ['Which page?'] } }));
  expect('an open question from planning returns needs-input', result.status === 'needs-input' && result.stage === 'plan');
  expect('nothing is implemented after needs-input', !labels.some((label) => label.startsWith('implement') || label === 'prepare-branch'));
}
{
  const config = defaultWorkflowConfig();
  config.stages.audit.agents = 3;
  const { result, labels } = await run(baseArgs(config), standard({ 'audit:2': { verdict: 'revise', issues: [], blockingQuestions: ['Who approves refunds?'] } }));
  expect('one auditor\'s blocking question stops the run', result.status === 'needs-input' && result.questions.includes('Who approves refunds?'));
  expect('three auditors ran', labels.filter((label) => label.startsWith('audit:')).length === 3);
}

// 4. The repair limit: a task that fails twice passes on the third try with maxAttempts 2,
// and is blocked — with no pull request — when maxAttempts is 1.
{
  // The test prompt does not carry the attempt number, so key the fake on its label instead.
  const answers = (failUntil) => standard({
    'test:t01#1': failUntil >= 1 ? { pass: false, failures: ['broken'], ran: [] } : pass,
    'test:t01#2': failUntil >= 2 ? { pass: false, failures: ['still broken'], ran: [] } : pass,
  });
  const config = defaultWorkflowConfig();
  const repaired = await run(baseArgs(config), answers(2));
  expect('a task that fails twice passes on attempt three', repaired.result.tasks[0].attempts === 3 && repaired.result.status === 'delivered');
  const retry = repaired.calls.find((call) => call.label === 'implement:t01#2');
  expect('the retry carries the rejection reasons', retry && retry.prompt.includes('- broken'));

  const strict = defaultWorkflowConfig();
  strict.repair.maxAttempts = 1;
  const gaveUp = await run(baseArgs(strict), answers(2));
  expect('maxAttempts 1 stops after two attempts', gaveUp.result.tasks[0].attempts === 2 && gaveUp.result.status === 'blocked');
  const deliver = gaveUp.calls.find((call) => call.label === 'deliver').prompt;
  expect('a blocked feature opens no pull request', deliver.includes('Do not open a pull request') && !deliver.includes('gh pr create'));
  const cleanup = gaveUp.calls.find((call) => call.label === 'cleanup').prompt;
  expect('cleanup keeps the failed task\'s branch', /Never delete these[^\n]*feat\/feat-x--t01/.test(cleanup));
}

// 5. Lean drops audit and review; disabled breakdown means one implementer.
{
  const { labels } = await run(baseArgs(defaultWorkflowConfig({ preset: 'lean' })), standard());
  expect('lean runs no audit and no review', !labels.some((label) => label.startsWith('audit') || label.startsWith('review')));
  const config = defaultWorkflowConfig();
  config.stages.breakdown.enabled = false;
  const single = await run(baseArgs(config), standard());
  expect('without breakdown there is exactly one implementer', single.labels.filter((label) => label.startsWith('implement')).length === 1 && !single.labels.includes('breakdown'));
}

// 5b. A stage pointed at the user's own agent runs as it; null falls back to the default agent.
{
  const config = defaultWorkflowConfig();
  config.stages.implement.agent = 'my-rails-dev';
  config.stages.plan.agent = null;
  const { calls } = await run(baseArgs(config), standard());
  expect('a custom agent replaces the default persona', calls.find((call) => call.label.startsWith('implement')).opts.agentType === 'my-rails-dev');
  expect('agent: null uses the default workflow agent', calls.find((call) => call.label === 'plan').opts.agentType === undefined);
}

// 6. Dependencies become waves: a dependent task starts only after the first wave is merged.
{
  const { labels } = await run(baseArgs(defaultWorkflowConfig()), standard({
    breakdown: { tasks: [
      { id: 't01', title: 'base', spec: 's', files: ['a.js'], dependsOn: [] },
      { id: 't02', title: 'on top', spec: 's', files: ['b.js'], dependsOn: ['t01'] },
    ] },
  }));
  expect('a dependent task starts after wave one is integrated', labels.indexOf('integrate:wave1') < labels.indexOf('implement:t02#1'));
}

// 7. Several planners are merged; a local harness records into the user's checkout.
{
  const config = defaultWorkflowConfig();
  config.stages.plan.agents = 3;
  const { labels } = await run(baseArgs(config), standard());
  expect('three planners plus one merge', labels.filter((label) => /^plan:\d$/.test(label)).length === 3 && labels.includes('plan:merge'));

  const localArgs = { ...baseArgs(defaultWorkflowConfig()), local: true, repoRoot: '/repo', verification: 'bash /repo/init.sh' };
  const local = await run(localArgs, standard());
  const deliver = local.calls.find((call) => call.label === 'deliver').prompt;
  expect('a local harness is recorded in the checkout, never committed', deliver.includes('relative to /repo') && deliver.includes('never commit'));
  expect('local verification runs by absolute path', local.calls.find((call) => call.label === 'test:t01#1').prompt.includes('bash /repo/init.sh'));
}

// 8. The script refuses inputs it cannot honor.
{
  const refuses = async (argsIn) => {
    try {
      await run(argsIn, standard());
      return false;
    } catch {
      return true;
    }
  };
  expect('a classic config is refused', await refuses({ ...baseArgs(defaultWorkflowConfig()), config: { version: 1, mode: 'classic' } }));
  expect('a missing feature is refused', await refuses({ ...baseArgs(defaultWorkflowConfig()), feature: null }));
  expect('local without repoRoot is refused', await refuses({ ...baseArgs(defaultWorkflowConfig()), local: true }));
}

if (failures) {
  console.log(`workflow-sim: ${failures} failure(s)`);
  process.exit(1);
}
console.log('workflow-sim: all scenarios pass');
