#!/usr/bin/env node
// Runs the real blvck-pm workflows/pm-work.js against a fake workflow runtime: agent() answers
// from a script per label instead of spawning anything. This proves the orchestration — which
// stages run, as which persona, how many at once, when the run stops, what reaches the
// document — without spending a token. Whether a real agent follows its prompt is behavioral
// and is not claimed here.
//
// PM_WORKFLOW_SCRIPT points it at another copy of the script; init.sh uses that to prove the
// simulation fails when a ceiling is broken.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultWorkflowConfig, validateWorkflowConfig } from '../plugins/blvck-pm/skills/pm-os/scripts/lib/vault-utils.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = process.env.PM_WORKFLOW_SCRIPT || path.join(here, '..', 'plugins/blvck-pm/skills/pm-os/workflows/pm-work.js');
const source = readFileSync(scriptPath, 'utf8');
if (!source.startsWith('export const meta = {')) throw new Error('pm-work.js must begin with `export const meta = {` — the workflow runtime requires it');
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

const DRAFT = { title: 'Dunning retry', markdown: '# PRD: Dunning retry\nBody', assumptions: ['Retries stop after 3 attempts'], openQuestions: [] };
const mustFix = { lens: 'x', findings: [{ severity: 'must-fix', quote: 'retry', finding: 'retry window unstated', answer: 'use 7 days', flagged: true }], preserve: 'clear problem' };
const clean = { lens: 'x', findings: [{ severity: 'consider', finding: 'tighten intro', answer: 'cut a line', flagged: false }], preserve: 'clear problem' };

function standard(overrides = {}) {
  return (label, prompt) => {
    if (overrides[label] !== undefined) return typeof overrides[label] === 'function' ? overrides[label](prompt) : overrides[label];
    const stage = label.split(/[:#]/)[0];
    switch (stage) {
      case 'discover':
      case 'analyze': return { subject: label, summary: 's', evidence: ['quote'], contradictions: [] };
      case 'draft':
      case 'synthesize':
      case 'compare':
      case 'revise': return { ...DRAFT, assumptions: stage === 'revise' ? ['Window is 7 days'] : DRAFT.assumptions };
      case 'review': return { ...mustFix, lens: label.split(':')[1] };
      case 'consolidate': return { markdown: '# Review', topFix: 'state the window', decided: ['d'], flagged: ['f'] };
      case 'completeness': return { unmet: ['Rollout — no gating metric'], unchecked: [] };
      case 'deliver': return { path: 'CLAUDE-OUTPUTS/prds/prd-dunning-v1-2026-10-10.md', written: true, roadmapUpdated: true, targets: [], proposedFeatures: [] };
      default: throw new Error(`unexpected agent label ${label}`);
    }
  };
}

const vault = {
  root: '/vault',
  language: 'en',
  productName: 'Northwind',
  paths: { identityFile: 'ABOUT-ME/CLAUDE.md', antiStyle: 'ABOUT-ME/anti-style.md', productContext: 'PROJECTS/northwind/CLAUDE.md', vision: 'PROJECTS/northwind/vision.md', roadmap: 'PROJECTS/northwind/roadmap.json', templates: 'TEMPLATES', outputs: 'CLAUDE-OUTPUTS' },
};
const integrations = { jira: false, confluence: false, drive: false, bigquery: false };
const baseArgs = (config, pipeline = 'prd', extra = {}) => {
  validateWorkflowConfig(config, { integrations: extra.integrations ?? integrations });
  return {
    config,
    pipeline,
    brief: { title: 'Dunning retry', slug: 'dunning', summary: 'retry failed payments', sources: ['research/a.md', 'research/b.md'], competitors: ['Acme', 'Globex', 'Initech'], document: 'CLAUDE-OUTPUTS/prds/prd-dunning-v1-2026-08-14.md' },
    grilling: 'Q: who? A: SMB admins',
    outcome: { id: 'out-20260801-recover-revenue', outcome: 'recover failed revenue', metric: 'recovered MRR' },
    vault,
    checklist: ['at least one success metric with baseline and target', 'rollout tier with a gating metric'],
    codebases: [],
    date: '2026-10-10',
    ...extra,
  };
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
const find = (calls, prefix) => calls.find((call) => call.label.startsWith(prefix));

// 1. PRD, recommended: every stage runs as its persona and the document lands at the right path.
{
  const { result, labels, calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('a recommended PRD run delivers', result.status === 'delivered');
  expect('every recommended PRD stage ran', ['discover:1', 'draft', 'review:engineer', 'revise', 'completeness', 'deliver'].every((label) => labels.includes(label)), labels.join(','));
  const persona = (label) => calls.find((call) => call.label === label).opts.agentType;
  expect('each stage runs as its persona', persona('discover:1') === 'research-analyst' && persona('draft') === 'product-manager' && persona('revise') === 'product-manager');
  expect('each review lens runs as its own persona', persona('review:engineer') === 'lead-engineer' && persona('review:designer') === 'blind-reviewer' && persona('review:customer') === 'customer-voice' && persona('review:executive') === 'board-executive');
  expect('completeness and deliver use the default agent', persona('completeness') === undefined && persona('deliver') === undefined);
  expect('the PRD is delivered under prds/ with the naming convention', find(calls, 'deliver').prompt.includes('CLAUDE-OUTPUTS/prds/prd-dunning-v1-2026-10-10.md'));
  expect('one discover agent per source', labels.filter((label) => label.startsWith('discover:')).length === 2);
}

// 2. Ceilings, not targets: agents follow the real count, never more at once than allowed.
{
  const config = defaultWorkflowConfig();
  config.pipelines.prd.stages.discover.agents = 2;
  config.pipelines.prd.stages.review.agents = 1;
  const sources = Array.from({ length: 6 }, (_, i) => `research/s${i}.md`);
  const args = baseArgs(config);
  const { peak, labels } = await run({ ...args, brief: { ...args.brief, sources } }, standard());
  expect('six sources run six analysts, two at a time under a ceiling of two', labels.filter((label) => label.startsWith('discover:')).length === 6 && peak.discover === 2, `peak ${peak.discover}`);
  expect('four lenses run one at a time under a ceiling of one', labels.filter((label) => label.startsWith('review:')).length === 4 && peak.review === 1, `peak ${peak.review}`);

  const competitorConfig = defaultWorkflowConfig();
  competitorConfig.pipelines['competitor-teardown'].stages.analyze.agents = 3;
  const many = baseArgs(competitorConfig, 'competitor-teardown');
  const { peak: tp, labels: tl } = await run({ ...many, brief: { ...many.brief, competitors: ['a', 'b', 'c', 'd', 'e'] } }, standard());
  expect('five competitors run five analysts, three at a time', tl.filter((label) => label.startsWith('analyze:')).length === 5 && tp.analyze === 3, `peak ${tp.analyze}`);
}

// 3. A question only the PM can answer stops the run before anything is written.
{
  const { result, labels } = await run(baseArgs(defaultWorkflowConfig()), standard({ draft: { ...DRAFT, openQuestions: ['Should retries apply to annual plans?'] } }));
  expect('an open question from drafting returns needs-input', result.status === 'needs-input' && result.stage === 'draft' && result.questions.length === 1);
  expect('nothing is reviewed or delivered after needs-input', !labels.some((label) => label.startsWith('review') || label === 'deliver'));
  const plain = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('drafters get the decide-versus-ask bar', find(plain.calls, 'draft').prompt.includes('Decide versus ask'));
}

// 4. Assumptions and flagged findings reach the document; revise only runs when there is something to fix.
{
  const { result, calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  const deliver = find(calls, 'deliver').prompt;
  expect('assumptions from draft and revise both reach the document', deliver.includes('Retries stop after 3 attempts') && deliver.includes('Window is 7 days') && result.assumptions.length === 2);
  expect('flagged review findings are listed for a person to confirm', deliver.includes('## Flagged by review') && deliver.includes('retry window unstated'));
  expect('revise receives every must-fix finding', find(calls, 'revise').prompt.includes('retry window unstated'));
  const quiet = await run(baseArgs(defaultWorkflowConfig()), standard({ 'review:engineer': clean, 'review:designer': clean, 'review:customer': clean, 'review:executive': clean }));
  expect('no serious finding, no revise', !quiet.labels.includes('revise') && quiet.result.status === 'delivered');
}

// 5. Blind means blind: no reviewer is shown another review.
{
  const { calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  const reviews = calls.filter((call) => call.label.startsWith('review:'));
  expect('reviewers never see another review', reviews.every((call) => !call.prompt.includes('preserve') || call.prompt.includes('Name one thing')) && reviews.every((call) => !call.prompt.includes('retry window unstated')));
}

// 6. Completeness names gaps and never fills them; the PM accepts a gap after the run, not the run.
{
  const { result, calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('the gate gets the resolved checklist', find(calls, 'completeness').prompt.includes('rollout tier with a gating metric'));
  expect('unmet items come back for the PM', result.completeness.unmet.length === 1);
  expect('deliver never writes a completeness override', find(calls, 'deliver').prompt.includes('Do not add a "## Completeness" section'));
  const args = baseArgs(defaultWorkflowConfig());
  const skipped = await run({ ...args, checklist: [] }, standard());
  expect('a skipped checklist runs no gate', !skipped.labels.includes('completeness'));
}

// 7. Deliver targets: outside tools are named with their destination, and never block the vault.
{
  const config = defaultWorkflowConfig();
  config.destinations = { confluence: 'PM/Specs', jira: 'BILL' };
  config.pipelines.prd.stages.deliver.targets = ['confluence', 'jira'];
  const on = { ...integrations, confluence: true, jira: true };
  const { result, calls } = await run(baseArgs(config, 'prd', { integrations: on }), standard({
    deliver: { path: 'p', written: true, roadmapUpdated: true, targets: [{ target: 'confluence', status: 'skipped', reason: 'not connected' }, { target: 'jira', status: 'published', link: 'BILL-1' }] },
  }));
  const deliver = find(calls, 'deliver').prompt;
  expect('each target is named with its destination', deliver.includes('Confluence at PM/Specs') && deliver.includes('project BILL'));
  expect('a missing integration does not block delivery', result.status === 'delivered' && result.targets[0].status === 'skipped');
  const plain = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('no targets means the vault only', find(plain.calls, 'deliver').prompt.includes('the vault is the only destination'));
  expect('deliver never commits', find(plain.calls, 'deliver').prompt.includes('Do not commit, stage, or push'));
}

// 8. The roadmap seam: the document is recorded on the outcome it serves, and only there.
{
  const { calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('the document is added to its outcome', find(calls, 'deliver').prompt.includes('documents array of item out-20260801-recover-revenue'));
  const args = baseArgs(defaultWorkflowConfig());
  const none = await run({ ...args, outcome: null }, standard());
  expect('no outcome means the roadmap is not touched', find(none.calls, 'deliver').prompt.includes('do not touch the roadmap') && find(none.calls, 'draft').prompt.includes('none fits'));
}

// 9. Proposed harness features: only for "mine" codebases, and only as a proposal.
{
  const args = baseArgs(defaultWorkflowConfig());
  const withCode = await run({ ...args, codebases: [{ name: 'billing-api', path: 'CODE/billing-api', scope: 'mine', commit: 'abc123' }, { name: 'points', path: '~/points', scope: 'dependency', commit: 'def456' }] }, standard());
  const deliver = find(withCode.calls, 'deliver').prompt;
  expect('a mine codebase gets proposed features, never written into it', deliver.includes('## Proposed harness features') && deliver.includes('billing-api') && !deliver.includes('points)') && deliver.includes('write nothing into any codebase'));
  expect('agents read code at the pinned commit', find(withCode.calls, 'review:engineer').prompt.includes('billing-api (mine): CODE/billing-api @ abc123'));
  const without = await run(args, standard());
  expect('no mine codebase, no proposal', !find(without.calls, 'deliver').prompt.includes('## Proposed harness features'));
}

// 10. Only Deliver writes.
{
  const { calls } = await run(baseArgs(defaultWorkflowConfig()), standard());
  const writers = calls.filter((call) => !call.prompt.includes('write no files'));
  expect('every stage except deliver is told to write no files', writers.length === 1 && writers[0].label === 'deliver', writers.map((call) => call.label).join(','));
}

// 11. Lean: no discover, no revise, two blind lenses.
{
  const { labels, calls } = await run(baseArgs(defaultWorkflowConfig({ preset: 'lean' })), standard());
  expect('lean runs no discover and no revise', !labels.some((label) => label.startsWith('discover') || label === 'revise'));
  expect('lean reviews with two blind lenses', calls.filter((call) => call.label.startsWith('review:')).every((call) => call.opts.agentType === 'blind-reviewer') && labels.filter((label) => label.startsWith('review:')).length === 2);
  expect('lean leaves serious findings open in the document', find(calls, 'deliver').prompt.includes('## Open review findings'));
}

// 12. Research synthesis and competitor teardown.
{
  const { result, labels, calls } = await run(baseArgs(defaultWorkflowConfig(), 'research-synthesis'), standard());
  expect('research synthesis: one analyst per source, then synthesize', labels.filter((label) => label.startsWith('analyze:')).length === 2 && labels.includes('synthesize') && result.status === 'delivered');
  expect('synthesis runs as customer-voice and lands in research/', find(calls, 'synthesize').opts.agentType === 'customer-voice' && find(calls, 'deliver').prompt.includes('CLAUDE-OUTPUTS/research/synthesis-dunning-2026-10-10.md'));
  expect('synthesis passes every analysis to the synthesizer', find(calls, 'synthesize').prompt.includes('analyze:1') && find(calls, 'synthesize').prompt.includes('analyze:2'));

  const teardown = await run(baseArgs(defaultWorkflowConfig(), 'competitor-teardown'), standard());
  expect('teardown: one analyst per competitor as competitive-intel', teardown.calls.filter((call) => call.label.startsWith('analyze:')).length === 3 && find(teardown.calls, 'analyze').opts.agentType === 'competitive-intel');
  expect('teardown compares and lands in research/', teardown.labels.includes('compare') && find(teardown.calls, 'deliver').prompt.includes('research/teardown-dunning-2026-10-10.md'));
}

// 12b. Found in a live run: a synthesis stopped twice over where its finding belongs on the
// roadmap, and listed "wrote no file" as an assumption. Decisions for the PM ride along in the
// document instead of stopping the run, and research revises its serious findings.
{
  const { labels, calls, result } = await run(baseArgs(defaultWorkflowConfig(), 'research-synthesis'), standard({
    synthesize: { ...DRAFT, decisions: ['Add retry visibility to the dunning PRD, or make it its own outcome'] },
  }));
  const synth = find(calls, 'synthesize').prompt;
  expect('research stops only when the work cannot be done', synth.includes('you cannot do the work without it') && !synth.includes('pricing, a success metric'));
  expect('assumptions exclude the run\'s own instructions', synth.includes('never about how this run is set up'));
  expect('a decision for the PM reaches the document and the result, not a stop', find(calls, 'deliver').prompt.includes('## Decisions for the PM') && result.decisions.length === 1 && result.status === 'delivered');
  expect('research revises serious findings in the recommended preset', labels.includes('revise') && find(calls, 'revise').opts.agentType === 'customer-voice' && !find(calls, 'deliver').prompt.includes('## Open review findings'));
  const teardown = await run(baseArgs(defaultWorkflowConfig(), 'competitor-teardown'), standard());
  expect('teardown revises serious findings too', teardown.labels.includes('revise'));
  const lean = await run(baseArgs(defaultWorkflowConfig({ preset: 'lean' }), 'research-synthesis'), standard());
  expect('lean research skips review and revise', !lean.labels.some((label) => label.startsWith('review') || label === 'revise'));
  const prd = await run(baseArgs(defaultWorkflowConfig()), standard());
  expect('a PRD still stops for scope, pricing, or a metric', find(prd.calls, 'draft').prompt.includes('pricing, a success metric'));
}

// 13. PRD review: blind lenses on the existing document, then one consolidated review.
{
  const { result, labels, calls } = await run(baseArgs(defaultWorkflowConfig(), 'prd-review'), standard());
  expect('prd-review drafts nothing', !labels.includes('draft') && !labels.some((label) => label.startsWith('analyze') || label.startsWith('discover')));
  expect('each lens reads the existing document', calls.filter((call) => call.label.startsWith('review:')).every((call) => call.prompt.includes('CLAUDE-OUTPUTS/prds/prd-dunning-v1-2026-08-14.md')));
  expect('consolidation splits decided from flagged', labels.includes('consolidate') && result.topFix === 'state the window' && result.flagged[0] === 'f');
  expect('the review lands beside the PRD', find(calls, 'deliver').prompt.includes('CLAUDE-OUTPUTS/prds/dunning-multi-review-2026-10-10.md'));
}

// 14. A failed write is blocked, not delivered.
{
  const { result } = await run(baseArgs(defaultWorkflowConfig()), standard({ deliver: { path: 'p', written: false, roadmapUpdated: false, targets: [], notes: 'permission denied' } }));
  expect('a document that was not written reports blocked', result.status === 'blocked');
}

// 15. The script refuses inputs it cannot honor.
{
  const refuses = async (argsIn) => {
    try {
      await run(argsIn, standard());
      return false;
    } catch {
      return true;
    }
  };
  const good = baseArgs(defaultWorkflowConfig());
  const off = defaultWorkflowConfig();
  off.pipelines['prd-review'].enabled = false;
  expect('a classic config is refused', await refuses({ ...good, config: { version: 1, mode: 'classic' } }));
  expect('an unknown pipeline is refused', await refuses({ ...good, pipeline: 'roadmap' }));
  expect('a pipeline that is off is refused', await refuses({ ...baseArgs(off, 'prd-review') }));
  expect('a slug that cannot be a file name is refused', await refuses({ ...good, brief: { ...good.brief, slug: 'Dunning Retry' } }));
  expect('a missing date is refused', await refuses({ ...good, date: '' }));
  expect('research with no sources is refused', await refuses({ ...baseArgs(defaultWorkflowConfig(), 'research-synthesis'), brief: { ...good.brief, sources: [] } }));
  expect('prd-review with no document is refused', await refuses({ ...baseArgs(defaultWorkflowConfig(), 'prd-review'), brief: { ...good.brief, document: '' } }));
}

if (failures) {
  console.log(`pm-workflow-sim: ${failures} failure(s)`);
  process.exit(1);
}
console.log('pm-workflow-sim: all scenarios pass');
