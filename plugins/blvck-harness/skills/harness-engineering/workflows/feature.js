export const meta = {
  name: 'blvck-feature',
  description: 'Deliver one harness feature: plan, audit, break down, implement in parallel worktrees, test and review each task, open a PR/MR, clean up',
  whenToUse: 'Launched by /blvck-harness:run in dynamic mode, after the main session has grilled the user and picked one feature',
  phases: [
    { title: 'Plan' },
    { title: 'Audit' },
    { title: 'Breakdown' },
    { title: 'Implement' },
    { title: 'Test' },
    { title: 'Review' },
    { title: 'Deliver' },
    { title: 'Clean up' },
  ],
}

// Lives outside the plugin's workflows/ directory on purpose: anything there becomes its own
// slash command, and the plugin's menu is exactly setup, run, check. /blvck-harness:run
// launches this by path and passes everything it needs through `args`, because a workflow
// script has no filesystem access of its own.
//
// args = {
//   config,       // validated .claude/harness-workflow.json (mode must be "dynamic")
//   feature,      // the one tracker entry the user picked: { id, name, description, ... }
//   grilling,     // the answers the user gave in the main session, as plain text
//   harness,      // { layout, resolution } from validate-harness --json — where state lives
//   verification, // the repo's verification command, usually ./init.sh
//   local,        // true when the harness is in .git/info/exclude — worktrees will not contain it
//   repoRoot,     // absolute path of the user's checkout; where local harness files live
//   codeStyle,    // the instruction file's Code Style section, as text (optional)
// }
//
// A local harness is invisible to git, so a worktree has no CLAUDE.md, tracker or init.sh.
// The run command passes `verification` as an absolute path for that case, and Deliver writes
// state straight into the user's checkout instead of committing it to the feature branch.

const { config, feature, grilling = '', harness = {}, verification = './init.sh', local = false, repoRoot = '', codeStyle = '' } = args || {}
if (local && !repoRoot) throw new Error('A local harness needs args.repoRoot so Deliver can find the state files')
if (!config || config.mode !== 'dynamic') throw new Error('blvck-feature needs a dynamic-mode config in args.config — run it through /blvck-harness:run')
if (!feature || !feature.id) throw new Error('blvck-feature needs the picked feature in args.feature')

const stages = config.stages
const on = (name) => Boolean(stages[name] && stages[name].enabled)
const ceiling = (name) => (on(name) ? stages[name].agents : 1)
const maxAttempts = 1 + config.repair.maxAttempts
const prefix = config.delivery.branchPrefix ?? 'feat/'
const featureBranch = `${prefix}${feature.id}`
const target = config.delivery.targetBranch
const taskBranch = (task) => `${featureBranch}--${task.id}`

const skillLine = (name) => {
  const skills = (stages[name] && stages[name].skills) || []
  return skills.length ? `Use these skills when they are available to you: ${skills.join(', ')}. Skip any that are not installed.` : ''
}
// The persona a stage runs as — a subagent from .claude/agents/ — or the default workflow agent.
const as = (name) => (stages[name] && stages[name].agent ? { agentType: stages[name].agent } : {})
const styleLine = codeStyle ? `Code style rules the user set for this repository — follow every one:\n${codeStyle}` : ''
const brief = [
  `Feature ${feature.id}: ${feature.name || ''}`,
  feature.description ? `Description: ${feature.description}` : '',
  grilling ? `Requirements the user confirmed before this run:\n${grilling}` : '',
].filter(Boolean).join('\n')

// Per-stage ceilings. The workflow runtime has its own global cap; this one is the user's
// choice from setup, and a stage never runs more agents at once than they allowed.
function limiter(n) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= n || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    fn().then(resolve, reject).finally(() => { active--; next() })
  }
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next() })
}

const PLAN = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    approach: { type: 'string' },
    doneCriteria: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'approach', 'doneCriteria', 'assumptions', 'openQuestions'],
}
const AUDIT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'revise'] },
    issues: { type: 'array', items: { type: 'string' } },
    blockingQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues', 'blockingQuestions'],
}
const TASKS = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          spec: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'title', 'spec', 'files', 'dependsOn'],
      },
    },
  },
  required: ['tasks'],
}
const IMPLEMENTED = {
  type: 'object',
  properties: { worktree: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    branch: { type: 'string' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    blocker: { type: 'string' },
  },
  required: ['status', 'branch', 'summary', 'filesChanged'],
}
const TESTED = {
  type: 'object',
  properties: { worktree: { type: 'string' }, pass: { type: 'boolean' }, failures: { type: 'array', items: { type: 'string' } }, ran: { type: 'array', items: { type: 'string' } } },
  required: ['pass', 'failures', 'ran'],
}
const REVIEWED = {
  type: 'object',
  properties: { approve: { type: 'boolean' }, mustFix: { type: 'array', items: { type: 'string' } }, suggestions: { type: 'array', items: { type: 'string' } } },
  required: ['approve', 'mustFix'],
}
const INTEGRATED = {
  type: 'object',
  properties: { worktree: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflicts: { type: 'array', items: { type: 'string' } } },
  required: ['merged', 'conflicts'],
}
const DELIVERED = {
  type: 'object',
  properties: { worktree: { type: 'string' },
    verificationPassed: { type: 'boolean' },
    evidence: { type: 'string' },
    recordedIn: { type: 'array', items: { type: 'string' } },
    pushed: { type: 'boolean' },
    prUrl: { type: 'string' },
    manualPrLink: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['verificationPassed', 'evidence', 'recordedIn', 'pushed'],
}
const CLEANED = {
  type: 'object',
  properties: {
    removedWorktrees: { type: 'array', items: { type: 'string' } },
    deletedBranches: { type: 'array', items: { type: 'string' } },
    kept: { type: 'array', items: { type: 'string' } },
  },
  required: ['removedWorktrees', 'deletedBranches', 'kept'],
}

// Every agent that runs in a worktree reports where it ran, so clean-up removes exactly this
// run's worktrees and never another session's that share the same directory.
const WHERE = 'Report the absolute path of your working directory (`pwd`) as worktree.'
const worktrees = new Set()
const track = (result) => {
  if (result && result.worktree) worktrees.add(result.worktree)
  return result
}

const needsInput = (questions, stage) => ({
  status: 'needs-input',
  featureId: feature.id,
  stage,
  questions,
  summary: `The ${stage} stage found requirements only the user can settle, so nothing was built.`,
})

// ---------------------------------------------------------------------------
// Plan — one planner, or several independent angles merged by a synthesizer
// ---------------------------------------------------------------------------
phase('Plan')
// Without a bar, "never guess" never builds: a real run asked two rounds of questions about
// Unicode whitespace. Questions are for what the user would notice or object to; the rest is
// decided and disclosed, so nothing is hidden and nothing stalls.
const MATERIAL = `Decide versus ask:
- Put a question in openQuestions only when the answer changes what gets built in a way the user would notice or object to: scope, behavior a user sees, data kept or lost, security or permissions, or anything hard to reverse.
- Everything else — an edge case with a conventional answer, a naming or structure choice, input nobody will realistically send — decide it yourself and record the decision in assumptions, one line each, so the user sees it in the pull request.
- Never ask about something the confirmed requirements already answer.`
const ANGLES = ['the smallest change that meets every done criterion', 'risk first: what could break and how the plan prevents it', 'test first: how each criterion will be proven', 'reuse first: what already exists in this codebase', 'the user outcome: what the person using this will notice']
const planPrompt = (angle) => `Plan the implementation of one feature in this repository. Read the code you need; do not edit anything.
${brief}
Approach the plan from this angle: ${angle}.
${skillLine('plan')}
List done criteria a test or command can check.
${MATERIAL}`

let plan
if (stages.plan.agents > 1) {
  const drafts = (await parallel(ANGLES.slice(0, stages.plan.agents).map((angle, i) => () =>
    agent(planPrompt(angle), { label: `plan:${i + 1}`, phase: 'Plan', schema: PLAN, ...as('plan') })))).filter(Boolean)
  plan = await agent(`Merge these independent plans for the same feature into one. Keep the strongest approach, graft the best ideas from the others, and keep every assumption. Keep an open question only if it still passes this bar:
${MATERIAL}
${brief}
Plans:
${JSON.stringify(drafts, null, 2)}`, { label: 'plan:merge', phase: 'Plan', schema: PLAN, ...as('plan') })
} else {
  plan = await agent(planPrompt(ANGLES[0]), { label: 'plan', phase: 'Plan', schema: PLAN, ...as('plan') })
}
if (!plan) throw new Error('The plan stage returned nothing')
plan.assumptions = plan.assumptions || []
if (plan.openQuestions.length) return needsInput(plan.openQuestions, 'plan')

// ---------------------------------------------------------------------------
// Audit — skeptics try to break the plan; a majority asking for changes earns one revision
// ---------------------------------------------------------------------------
if (on('audit')) {
  phase('Audit')
  const votes = (await parallel(Array.from({ length: stages.audit.agents }, (_, i) => () =>
    agent(`Audit this implementation plan as a skeptic. Try to find where it fails the feature, misses a done criterion, or rests on a requirement nobody confirmed. Read code as needed; do not edit anything.
${brief}
${skillLine('audit')}
Plan:
${JSON.stringify(plan, null, 2)}
Put a question in blockingQuestions only when it passes this bar — otherwise it is an issue, fixable by deciding and recording an assumption:
${MATERIAL}`, { label: `audit:${i + 1}`, phase: 'Audit', schema: AUDIT, ...as('audit') })))).filter(Boolean)

  const blocking = [...new Set(votes.flatMap((vote) => vote.blockingQuestions))]
  if (blocking.length) return needsInput(blocking, 'audit')
  const revise = votes.filter((vote) => vote.verdict === 'revise')
  if (revise.length * 2 > votes.length) {
    const revised = await agent(`Revise this plan to resolve the audit issues. Keep what the auditors did not object to, and record each decision you make as an assumption.
${MATERIAL}
${brief}
Plan:
${JSON.stringify(plan, null, 2)}
Issues:
${revise.flatMap((vote) => vote.issues).map((issue) => `- ${issue}`).join('\n')}`, { label: 'audit:revise', phase: 'Audit', schema: PLAN, ...as('plan') })
    if (revised) plan = { ...revised, assumptions: revised.assumptions || [] }
    if (plan.openQuestions.length) return needsInput(plan.openQuestions, 'audit')
  }
}

// ---------------------------------------------------------------------------
// Breakdown — tasks that own disjoint files, grouped into waves by dependency
// ---------------------------------------------------------------------------
phase('Breakdown')
const prepared = await agent(`Create the feature branch for this run without touching the current checkout. Run: git fetch --quiet origin ${target} 2>/dev/null || true; then create ${featureBranch} from origin/${target} if that ref exists, otherwise from ${target}, using \`git branch\` (never git checkout or git switch in this directory — the user is working here). If ${featureBranch} already exists, leave it as it is. Return the branch name.`,
  { label: 'prepare-branch', phase: 'Breakdown', effort: 'low' })
if (!prepared) throw new Error(`Could not create ${featureBranch}`)

let rawTasks
if (on('breakdown')) {
  const result = await agent(`Split this plan into tasks that different engineers can build at the same time in separate git worktrees.
${brief}
Plan:
${JSON.stringify(plan, null, 2)}
Each task lists every file it will create or edit in "files". Two tasks must never share a file — if they would, make them one task. Use dependsOn only when a task needs another task's code to exist first. Give tasks short ids like t01, t02. Make as many tasks as the work genuinely splits into, and no more.`, { label: 'breakdown', phase: 'Breakdown', schema: TASKS, ...as('breakdown') })
  rawTasks = (result && result.tasks.length) ? result.tasks : null
}
if (!rawTasks) {
  rawTasks = [{ id: 't01', title: plan.summary, spec: plan.approach, files: [], dependsOn: [] }]
}

// The breakdown agent is asked for disjoint files; this makes it true. Any two tasks that share
// a file are merged, because two implementers editing one file in two worktrees is a merge
// conflict scheduled in advance.
function mergeOverlapping(tasks) {
  const parent = tasks.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const owner = new Map()
  tasks.forEach((task, i) => {
    for (const file of task.files) {
      if (owner.has(file)) parent[find(i)] = find(owner.get(file))
      else owner.set(file, i)
    }
  })
  const groups = new Map()
  tasks.forEach((task, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(task)
  })
  const merged = []
  const renamed = new Map()
  for (const group of groups.values()) {
    const id = group[0].id
    for (const task of group) renamed.set(task.id, id)
    merged.push(group.length === 1 ? { ...group[0] } : {
      id,
      title: group.map((task) => task.title).join(' + '),
      spec: group.map((task) => `${task.title}: ${task.spec}`).join('\n\n'),
      files: [...new Set(group.flatMap((task) => task.files))],
      dependsOn: group.flatMap((task) => task.dependsOn),
      mergedFrom: group.map((task) => task.id),
    })
  }
  for (const task of merged) {
    task.dependsOn = [...new Set(task.dependsOn.map((dep) => renamed.get(dep)).filter((dep) => dep && dep !== task.id))]
  }
  return merged
}

// Waves by dependency depth. A cycle (or a dependency on a task that does not exist, already
// dropped above) cannot be ordered, so whatever is left joins the last wave rather than
// deadlocking the run.
function toWaves(tasks) {
  const waves = []
  const placed = new Set()
  let remaining = [...tasks]
  while (remaining.length) {
    const ready = remaining.filter((task) => task.dependsOn.every((dep) => placed.has(dep)))
    const wave = ready.length ? ready : remaining
    waves.push(wave)
    wave.forEach((task) => placed.add(task.id))
    remaining = remaining.filter((task) => !placed.has(task.id))
  }
  return waves
}

const tasks = mergeOverlapping(rawTasks)
const waves = toWaves(tasks)
if (tasks.length < rawTasks.length) log(`${rawTasks.length - tasks.length} task(s) shared files with another and were merged into it`)
log(`${tasks.length} task(s) in ${waves.length} wave(s); up to ${ceiling('implement')} implementer(s) at once`)

// ---------------------------------------------------------------------------
// Implement → test + review, per task, as soon as each one finishes
// ---------------------------------------------------------------------------
const implementSlot = limiter(ceiling('implement'))
const testSlot = limiter(ceiling('test'))
const reviewSlot = limiter(ceiling('review'))

async function runTask(task) {
  const branch = taskBranch(task)
  let feedback = ''
  const history = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const built = await implementSlot(() => agent(`Implement one task of a larger feature. You are in your own git worktree.
${brief}
Task ${task.id}: ${task.title}
${task.spec}
Files this task owns: ${task.files.length ? task.files.join(', ') : 'decide from the spec'}. Do not edit files outside that list; if you must, say which and why in your summary.
${skillLine('implement')}
${styleLine}
Git: ${attempt === 1 ? `run \`git checkout -B ${branch} ${featureBranch}\`` : `run \`git checkout ${branch}\``} first. Commit all of your work to ${branch}. When finished, run \`git checkout --detach\` so the branch is free for the next stage. ${WHERE}
${feedback ? `This is attempt ${attempt}. The previous attempt was rejected for these reasons — fix every one:\n${feedback}` : ''}`,
      { label: `implement:${task.id}#${attempt}`, phase: 'Implement', schema: IMPLEMENTED, isolation: 'worktree', ...as('implement') }).then(track))

    if (!built || built.status === 'blocked') {
      history.push({ attempt, result: 'blocked', reason: built ? built.blocker || built.summary : 'implementer returned nothing' })
      return { task, branch, status: 'failed', attempts: attempt, history }
    }

    const checks = await parallel([
      () => (on('test') ? testSlot(() => agent(`Test one task's work. You are in your own git worktree; run \`git checkout --detach ${branch}\` first.
${brief}
Task ${task.id}: ${task.title}
${task.spec}
What the implementer says changed: ${built.summary}
${skillLine('test')}
Run ${verification} and any tests that cover this task. A done criterion with no test is a failure to report, not a test for you to add — the developer owns the task branch. Report every failure precisely enough that someone else can fix it. ${WHERE}`,
        { label: `test:${task.id}#${attempt}`, phase: 'Test', schema: TESTED, isolation: 'worktree', ...as('test') }).then(track)) : Promise.resolve({ pass: true, failures: [], ran: [] })),
      () => (on('review') ? reviewSlot(() => agent(`Review one task's code. Read it with \`git diff ${featureBranch}...${branch}\`; do not check anything out and do not edit anything.
${brief}
Task ${task.id}: ${task.title}
${task.spec}
${skillLine('review')}
Put only defects that must be fixed before merge in mustFix: correctness, security, a missed done criterion, an edit outside the task's files without a reason${codeStyle ? ', or a break of the code style rules below — the user set them deliberately, so a violation is a defect, not a preference' : ''}. Other style preferences go in suggestions.
${styleLine}`,
        { label: `review:${task.id}#${attempt}`, phase: 'Review', schema: REVIEWED, ...as('review') })) : Promise.resolve({ approve: true, mustFix: [] })),
    ])
    const [tested, reviewed] = checks
    const problems = [
      ...(tested ? tested.failures : ['the tester returned nothing']),
      ...(reviewed ? reviewed.mustFix : ['the reviewer returned nothing']),
    ]
    const passed = Boolean(tested && tested.pass && reviewed && (reviewed.approve || reviewed.mustFix.length === 0))
    history.push({ attempt, result: passed ? 'passed' : 'rejected', problems })
    if (passed) return { task, branch, status: 'passed', attempts: attempt, history }
    feedback = problems.map((problem) => `- ${problem}`).join('\n')
  }
  return { task, branch, status: 'failed', attempts: maxAttempts, history }
}

const results = []
const conflicts = []
for (let w = 0; w < waves.length; w++) {
  const waveResults = await Promise.all(waves[w].map(runTask))
  results.push(...waveResults)
  const passing = waveResults.filter((result) => result.status === 'passed')
  if (passing.length === 0) continue
  // Later waves start from the feature branch, so each wave lands there before the next begins.
  const integrated = await agent(`Merge finished task branches into the feature branch. You are in your own git worktree.
Run \`git checkout ${featureBranch}\`, then for each branch below run \`git merge --no-ff <branch>\`. If a merge conflicts, run \`git merge --abort\`, list that branch under conflicts, and continue with the next. Finish with \`git checkout --detach\` so the feature branch is free. ${WHERE}
Branches: ${passing.map((result) => result.branch).join(', ')}`,
    { label: `integrate:wave${w + 1}`, phase: 'Deliver', schema: INTEGRATED, isolation: 'worktree', effort: 'low' }).then(track)
  conflicts.push(...(integrated ? integrated.conflicts : passing.map((result) => result.branch)))
}

const failed = results.filter((result) => result.status === 'failed')
const taskReport = results.map((result) => ({
  id: result.task.id,
  title: result.task.title,
  status: conflicts.includes(result.branch) ? 'merge-conflict' : result.status,
  attempts: result.attempts,
  branch: result.branch,
  lastProblems: (result.history[result.history.length - 1] || {}).problems || [],
}))

// ---------------------------------------------------------------------------
// Deliver — final verification on the merged branch, record evidence, open the PR/MR
// ---------------------------------------------------------------------------
phase('Deliver')
const blocked = failed.length > 0 || conflicts.length > 0
let finalReview = null
if (!blocked && on('review')) {
  finalReview = await agent(`Review the whole feature before it goes to a pull request: read \`git diff ${target}...${featureBranch}\`. Do not edit anything.
${brief}
Done criteria:
${plan.doneCriteria.map((criterion) => `- ${criterion}`).join('\n')}
${skillLine('review')}
Each task was reviewed alone; look for what only shows up together — duplicated logic, mismatched interfaces, a done criterion no task covered.${codeStyle ? ' A break of the code style rules is mustFix.' : ''}
${styleLine}`,
    { label: 'review:feature', phase: 'Review', schema: REVIEWED, ...as('review') })
}
const shipBlocked = blocked || Boolean(finalReview && !finalReview.approve && finalReview.mustFix.length)

const hostStep = {
  github: `push ${featureBranch} and open a pull request into ${target} with \`gh pr create --base ${target} --head ${featureBranch}\``,
  gitlab: `push ${featureBranch} and open a merge request into ${target} with \`glab mr create --target-branch ${target} --source-branch ${featureBranch}\``,
  none: `do not push or open anything — the user delivers ${featureBranch} themselves`,
}[config.delivery.host]

const delivered = await agent(`Deliver one feature. You are in your own git worktree; run \`git checkout ${featureBranch}\` first.
${brief}
1. Run ${verification} on the merged branch and record the outcome honestly.
2. Record the result in the harness state files. This repo's harness layout is "${harness.layout || 'solo'}", and this is where each concept lives (use the real files under "sources", matching their existing format${local ? `; the harness is local-only, so these paths are relative to ${repoRoot} — edit them there, and never commit or stage them` : ''}):
${JSON.stringify(harness.resolution || {}, null, 2)}
   ${shipBlocked ? `Mark the feature blocked, not done: ${[
    failed.length ? `tasks that never passed: ${failed.map((result) => result.task.id).join(', ')}` : '',
    conflicts.length ? `branches that conflicted on merge: ${conflicts.join(', ')}` : '',
    finalReview && finalReview.mustFix.length ? `whole-feature review must-fix: ${finalReview.mustFix.join('; ')}` : '',
  ].filter(Boolean).join('; ')}.` : 'Mark the feature done only if step 1 passed, with the verification output as evidence.'}
   ${plan.assumptions.length ? `List these decisions made without asking the user in the pull request description and the handoff note, under "Assumptions":\n${plan.assumptions.map((item) => `   - ${item}`).join('\n')}\n   ` : ''}Write a handoff note for the next session in the harness's session handoff or progress file. ${local ? `Commit only code on ${featureBranch}; the harness files stay uncommitted in ${repoRoot}.` : `Commit on ${featureBranch}.`}
3. ${shipBlocked ? `Do not open a pull request. Push ${featureBranch} only if the remote exists, so the work is not lost.` : `If verification passed, ${hostStep}. If the CLI is missing or not signed in, push the branch anyway and return the web link where the user can open it by hand as manualPrLink.`}
If a hook, guardrail, or permission rule blocks a git command, do not work around it — no alternative command, no disabling the hook. Report pushed=false and name the blocked command in notes; the user decides.
Finish with \`git checkout --detach\`. ${WHERE}`,
  { label: 'deliver', phase: 'Deliver', schema: DELIVERED, isolation: 'worktree', ...as('deliver') }).then(track)

// ---------------------------------------------------------------------------
// Clean up — worktrees and merged task branches go; the feature branch and any unfinished
// work stay for the human
// ---------------------------------------------------------------------------
let cleanup = null
if (on('cleanup')) {
  phase('Clean up')
  const keep = [featureBranch, ...failed.map((result) => result.branch), ...conflicts]
  cleanup = await agent(`Clean up after a feature run without touching the user's current checkout or uncommitted work.
- Remove exactly these worktrees, which this run created, and no others: ${[...worktrees].join(', ') || '(none reported)'}. For each one: if \`git -C <path> status --porcelain\` prints anything, keep it and list it under kept; otherwise run \`git worktree remove <path>\`, then delete the branch the runtime created for it (usually \`worktree-<directory name>\`) with \`git branch -d\` — if git refuses because the branch holds unmerged work, keep it and list it. Never use \`git branch -D\` or \`--force\`. Finish with \`git worktree prune\`.
- Delete these task branches, but only if \`git branch --merged ${featureBranch}\` lists them: ${results.filter((result) => !keep.includes(result.branch)).map((result) => result.branch).join(', ') || '(none)'}
- Never delete these — they hold the delivered or unfinished work: ${keep.join(', ')}
- Remove temporary files or folders this run created outside git (build scratch, logs) if you can identify them with certainty; leave anything you are unsure about and list it under kept.
- If a hook or permission rule blocks a command, do not work around it; list what it blocked under kept.`,
    { label: 'cleanup', phase: 'Clean up', schema: CLEANED, effort: 'low', ...as('cleanup') })
}

const status = shipBlocked || !delivered || !delivered.verificationPassed ? 'blocked' : 'delivered'
return {
  status,
  featureId: feature.id,
  featureBranch,
  targetBranch: target,
  prUrl: delivered ? delivered.prUrl || null : null,
  manualPrLink: delivered ? delivered.manualPrLink || null : null,
  plan: { summary: plan.summary, doneCriteria: plan.doneCriteria, assumptions: plan.assumptions },
  tasks: taskReport,
  finalReview,
  delivery: delivered,
  cleanup,
}
