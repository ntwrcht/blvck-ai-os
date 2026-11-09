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
//   stackOn,      // feature branches of delivered dependencies this one builds on (optional)
//   siblings,     // other features from the same /blvck-harness:run: [{ id, name }] (optional)
// }
//
// One run of this script delivers one feature. /blvck-harness:run launches one run per feature
// when the user picks several, and starts a dependent feature only after its dependency
// delivers, passing that dependency's branch as stackOn.
//
// A local harness is invisible to git, so a worktree has no CLAUDE.md, tracker or init.sh.
// The run command passes `verification` as an absolute path for that case, and Deliver writes
// state straight into the user's checkout instead of committing it to the feature branch.

const { config, feature, grilling = '', harness = {}, verification = './init.sh', local = false, repoRoot = '', codeStyle = '', stackOn = [], siblings = [] } = args || {}
if (local && !repoRoot) throw new Error('A local harness needs args.repoRoot so Deliver can find the state files')
if (!config || config.mode !== 'dynamic') throw new Error('blvck-feature needs a dynamic-mode config in args.config — run it through /blvck-harness:run')
if (!feature || !feature.id) throw new Error('blvck-feature needs the picked feature in args.feature')
if (!Array.isArray(stackOn) || stackOn.some((branch) => typeof branch !== 'string' || !branch.trim())) throw new Error('args.stackOn must be an array of branch names')
if (!Array.isArray(siblings) || siblings.some((sibling) => !sibling || !sibling.id)) throw new Error('args.siblings must be an array of { id, name } entries')

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
// How a stage's agents run: the persona (a subagent from .claude/agents/, or the default workflow
// agent), and the effort and model the user set for it. Unset effort or model inherits the session.
const as = (name) => {
  const stage = stages[name] || {}
  return {
    ...(stage.agent ? { agentType: stage.agent } : {}),
    ...(stage.effort ? { effort: stage.effort } : {}),
    ...(stage.model ? { model: stage.model } : {}),
  }
}
// Creating the branch and merging tasks are git-only, like clean-up, so they run with clean-up's
// effort and model (low effort when none is set) but never as its persona.
const gitOnly = {
  effort: (stages.cleanup && stages.cleanup.effort) || 'low',
  ...(stages.cleanup && stages.cleanup.model ? { model: stages.cleanup.model } : {}),
}
const styleLine = codeStyle ? `Code style rules the user set for this repository — follow every one:\n${codeStyle}` : ''
const brief = [
  `Feature ${feature.id}: ${feature.name || ''}`,
  feature.description ? `Description: ${feature.description}` : '',
  grilling ? `Requirements the user confirmed before this run:\n${grilling}` : '',
  stackOn.length ? `This feature builds on ${stackOn.join(', ')}, which hold features already delivered in this batch but not yet merged into ${config.delivery.targetBranch}. Their code is already reviewed: use it, and do not redo or change it unless this feature needs that.` : '',
  siblings.length ? `Other features are being built at the same time on their own branches, so leave their work to them:\n${siblings.map((sibling) => `- ${sibling.id}: ${sibling.name || ''}`).join('\n')}` : '',
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
          provides: { type: 'string' },
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
const PREPARED = {
  type: 'object',
  properties: { worktree: { type: 'string' }, branch: { type: 'string' }, conflicts: { type: 'array', items: { type: 'string' } } },
  required: ['branch', 'conflicts'],
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
const VERIFIED = {
  type: 'object',
  properties: { worktree: { type: 'string' }, passed: { type: 'boolean' }, evidence: { type: 'string' } },
  required: ['passed', 'evidence'],
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
// Breakdown — tasks that own disjoint files and agree on interfaces, so most run at once
// ---------------------------------------------------------------------------
phase('Breakdown')
// A stacked feature starts from its first dependency's branch. Further dependencies are merged
// in from a worktree, because the user's checkout must never switch branches under them.
const prepared = stackOn.length
  ? await agent(`Create the feature branch for this run. If ${featureBranch} already exists, leave it as it is and return it with no conflicts.
Otherwise run \`git branch ${featureBranch} ${stackOn[0]}\`.${stackOn.length > 1 ? ` Then, in your own git worktree, run \`git checkout ${featureBranch}\` and \`git merge --no-ff\` each of ${stackOn.slice(1).join(', ')}. If a merge conflicts, run \`git merge --abort\` and list that branch under conflicts. Finish with \`git checkout --detach\`. ${WHERE}` : ' Never run git checkout or git switch in this directory — the user is working here.'}`,
    { label: 'prepare-branch', phase: 'Breakdown', ...gitOnly, schema: PREPARED, ...(stackOn.length > 1 ? { isolation: 'worktree' } : {}) }).then(track)
  : await agent(`Create the feature branch for this run without touching the current checkout. Run: git fetch --quiet origin ${target} 2>/dev/null || true; then create ${featureBranch} from origin/${target} if that ref exists, otherwise from ${target}, using \`git branch\` (never git checkout or git switch in this directory — the user is working here). If ${featureBranch} already exists, leave it as it is. Return the branch name.`,
    { label: 'prepare-branch', phase: 'Breakdown', ...gitOnly })
if (!prepared) throw new Error(`Could not create ${featureBranch}`)
if (prepared.conflicts && prepared.conflicts.length) {
  return {
    status: 'blocked',
    featureId: feature.id,
    featureBranch,
    targetBranch: target,
    stackedOn: stackOn,
    worktreesLeft: [...worktrees],
    summary: `The branches this feature builds on conflict with each other (${prepared.conflicts.join(', ')}), so nothing was built. Merge them by hand, or run this feature after they land in ${target}.`,
  }
}

let rawTasks
if (on('breakdown')) {
  const result = await agent(`Split this plan into tasks that different engineers can build at the same time in separate git worktrees.
${brief}
Plan:
${JSON.stringify(plan, null, 2)}
Each task lists every file it will create or edit in "files". Two tasks must never share a file — if they would, make them one task. Give tasks short ids like t01, t02. Make as many tasks as the work genuinely splits into, and no more.
Tasks run at the same time unless dependsOn says otherwise, and every dependency makes the run wait, so keep dependsOn for the rare task that cannot be written or tested at all until another task's code exists:
- Agree interfaces up front. In "provides", state exactly what a task exposes to the others (function signatures, types, table schema, endpoint shape). Every implementer sees every task's "provides", so a task that calls t01's code builds against t01's stated interface, in parallel, instead of depending on it.
- Each task writes the tests for its own code, in its own files. Never make a task that only adds tests for another task's code.
- Documentation tasks are written from the plan and the stated interfaces, so they depend on nothing.
- Never make a task for the harness state files (feature tracker, progress or handoff notes, status files, evidence of the run): the Deliver stage records those.`, { label: 'breakdown', phase: 'Breakdown', schema: TASKS, ...as('breakdown') })
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
      provides: group.map((task) => task.provides).filter(Boolean).join('\n'),
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

// Dependency depth, used to order tasks and to break cycles. A cycle cannot be ordered, so what
// is left joins the last layer and its tasks stop waiting on each other instead of deadlocking.
function toLayers(tasks) {
  const layers = []
  const placed = new Set()
  let remaining = [...tasks]
  while (remaining.length) {
    const ready = remaining.filter((task) => task.dependsOn.every((dep) => placed.has(dep)))
    const layer = ready.length ? ready : remaining
    layers.push(layer)
    layer.forEach((task) => placed.add(task.id))
    remaining = remaining.filter((task) => !placed.has(task.id))
  }
  return layers
}

const tasks = mergeOverlapping(rawTasks)
const layers = toLayers(tasks)
const layerOf = new Map()
layers.forEach((layer, i) => layer.forEach((task) => layerOf.set(task.id, i)))
// A task waits only on dependencies in an earlier layer, which drops the edges of any cycle.
for (const task of tasks) task.waitsOn = task.dependsOn.filter((dep) => layerOf.get(dep) < layerOf.get(task.id))
if (tasks.length < rawTasks.length) log(`${rawTasks.length - tasks.length} task(s) shared files with another and were merged into it`)
log(`${tasks.length} task(s), longest dependency chain ${layers.length}; up to ${ceiling('implement')} implementer(s) at once`)
// Real runs averaged 1.3 tasks per chain step, which is a serial run with extra overhead. Say so
// where the user watches, so a slow run is explained by its breakdown and not mistaken for a hang.
if (tasks.length > 2 && layers.length * 2 > tasks.length) log(`Mostly serial: ${layers.length} of ${tasks.length} tasks wait on another, so few run at once`)
const interfaces = tasks.filter((task) => task.provides).map((task) => `- ${task.id} (${task.title}): ${task.provides}`).join('\n')

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
Files this task owns: ${task.files.length ? task.files.join(', ') : 'decide from the spec'}. Do not edit files outside that list; if you must, say which and why in your summary. Write the tests for this task's code yourself.
${interfaces ? `Interfaces the tasks agreed on. Other tasks may be building theirs right now, so code against what is stated here rather than waiting for their code:\n${interfaces}` : ''}
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
      // Testing in the implementer's worktree skips a new checkout and a fresh dependency install.
      () => (on('test') ? testSlot(() => agent(`Test one task's work. ${built.worktree ? `Work in the implementer's worktree: run \`cd ${built.worktree}\` and \`git checkout --detach ${branch}\` first. If that directory no longer exists, run \`git worktree add --detach <a new directory under .claude/worktrees/> ${branch}\` and work there.` : `You are in your own git worktree; run \`git checkout --detach ${branch}\` first.`}
${brief}
Task ${task.id}: ${task.title}
${task.spec}
What the implementer says changed: ${built.summary}
${skillLine('test')}
Run ${verification} and any tests that cover this task. A done criterion with no test is a failure to report, not a test for you to add — the developer owns the task branch. Report every failure precisely enough that someone else can fix it. ${WHERE}`,
        { label: `test:${task.id}#${attempt}`, phase: 'Test', schema: TESTED, ...(built.worktree ? {} : { isolation: 'worktree' }), ...as('test') }).then(track)) : Promise.resolve({ pass: true, failures: [], ran: [] })),
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

// Merges into the feature branch one batch at a time: a task that passes while a merge is running
// joins the next batch. Two merge agents on one branch at once would race.
const conflicts = []
let pendingMerges = []
let merging = false
let mergeRound = 0
function land(branch) {
  return new Promise((resolve) => {
    pendingMerges.push({ branch, resolve })
    pumpMerges()
  })
}
async function pumpMerges() {
  if (merging || pendingMerges.length === 0) return
  merging = true
  const batch = pendingMerges
  pendingMerges = []
  mergeRound += 1
  const branches = batch.map((item) => item.branch)
  const integrated = await agent(`Merge finished task branches into the feature branch. You are in your own git worktree.
Run \`git checkout ${featureBranch}\`, then for each branch below run \`git merge --no-ff <branch>\`. If a merge conflicts, run \`git merge --abort\`, list that branch under conflicts, and continue with the next. Finish with \`git checkout --detach\` so the feature branch is free. ${WHERE}
Branches: ${branches.join(', ')}`,
    { label: `integrate:${mergeRound}`, phase: 'Deliver', schema: INTEGRATED, isolation: 'worktree', ...gitOnly }).then(track)
  const failedMerges = integrated ? integrated.conflicts : branches
  conflicts.push(...failedMerges)
  merging = false
  for (const item of batch) item.resolve(!failedMerges.includes(item.branch))
  pumpMerges()
}

// Each task starts the moment its own dependencies have passed and merged, so a task that needs
// a retry delays only the tasks built on it, never an unrelated one.
const byId = new Map(tasks.map((task) => [task.id, task]))
const scheduled = new Map()
function schedule(task) {
  if (!scheduled.has(task.id)) {
    scheduled.set(task.id, (async () => {
      const deps = await Promise.all(task.waitsOn.map((dep) => schedule(byId.get(dep))))
      const missing = deps.filter((dep) => !dep.landed).map((dep) => dep.task.id)
      if (missing.length) {
        return { task, branch: taskBranch(task), status: 'skipped', attempts: 0, landed: false, history: [{ attempt: 0, result: 'skipped', problems: [`never started: it needs ${missing.join(', ')}, which did not pass or merge`] }] }
      }
      const result = await runTask(task)
      result.landed = result.status === 'passed' ? await land(result.branch) : false
      return result
    })())
  }
  return scheduled.get(task.id)
}
const results = await Promise.all(tasks.map(schedule))

const failed = results.filter((result) => result.status === 'failed')
const skipped = results.filter((result) => result.status === 'skipped')
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
const blocked = failed.length > 0 || skipped.length > 0 || conflicts.length > 0
// A stacked branch also carries its dependencies' commits, which their own runs reviewed.
const featureDiff = stackOn.length
  ? `\`git log -p ${featureBranch} --not ${stackOn.join(' ')}\` (only this feature's commits; ${stackOn.join(', ')} were reviewed by their own runs)`
  : `\`git diff ${target}...${featureBranch}\``
let finalReview = null
let finalCheck = null
if (!blocked && on('review')) {
  // The whole-feature review only reads the diff, so the final verification runs beside it
  // instead of after it, and Deliver reuses its result.
  ;[finalReview, finalCheck] = await parallel([
    () => agent(`Review the whole feature before it goes to a pull request: read ${featureDiff}. Do not edit anything.
${brief}
Done criteria:
${plan.doneCriteria.map((criterion) => `- ${criterion}`).join('\n')}
${skillLine('review')}
Each task was reviewed alone; look for what only shows up together — duplicated logic, mismatched interfaces, a done criterion no task covered.${codeStyle ? ' A break of the code style rules is mustFix.' : ''}
${styleLine}`,
      { label: 'review:feature', phase: 'Review', schema: REVIEWED, ...as('review') }),
    () => agent(`Run the final verification of a merged feature branch. You are in your own git worktree; run \`git checkout --detach ${featureBranch}\` first. Do not edit anything.
Run ${verification} and report honestly whether it passed, with the decisive output lines as evidence. ${WHERE}`,
      { label: 'verify:feature', phase: 'Deliver', schema: VERIFIED, isolation: 'worktree', ...as('test') }).then(track),
  ])
}
const verifyFailed = Boolean(finalCheck && !finalCheck.passed)
const shipBlocked = blocked || verifyFailed || Boolean(finalReview && !finalReview.approve && finalReview.mustFix.length)

const hostStep = {
  github: `push ${featureBranch} and open a pull request into ${target} with \`gh pr create --base ${target} --head ${featureBranch}\``,
  gitlab: `push ${featureBranch} and open a merge request into ${target} with \`glab mr create --target-branch ${target} --source-branch ${featureBranch}\``,
  none: `do not push or open anything — the user delivers ${featureBranch} themselves`,
}[config.delivery.host]
const stackNote = stackOn.length
  ? ` Start the description by saying this builds on ${stackOn.join(', ')}, which must merge first, and that until they do this ${config.delivery.host === 'gitlab' ? 'merge request' : 'pull request'} also shows their commits.`
  : ''
// Several runs from one /blvck-harness:run finish around the same time and record into the same
// tracker and progress files, so each edits only its own part and re-reads before writing.
const sharedState = siblings.length
  ? `\n   Other features from the same batch record into these files too, possibly at the same moment: re-read each file immediately before you edit it, change only this feature's entry, and add your note as a new entry instead of rewriting existing text.`
  : ''

const delivered = await agent(`Deliver one feature. You are in your own git worktree; run \`git checkout ${featureBranch}\` first.
${brief}
1. ${finalCheck ? `${verification} already ran on this exact branch and ${finalCheck.passed ? 'passed' : 'failed'}. Evidence: ${finalCheck.evidence}. Use that result; run it again only if you change anything other than the harness state files.` : `Run ${verification} on the merged branch and record the outcome honestly.`}
2. Record the result in the harness state files. This repo's harness layout is "${harness.layout || 'solo'}", and this is where each concept lives (use the real files under "sources", matching their existing format${local ? `; the harness is local-only, so these paths are relative to ${repoRoot} — edit them there, and never commit or stage them` : ''}):
${JSON.stringify(harness.resolution || {}, null, 2)}${sharedState}
   ${shipBlocked ? `Mark the feature blocked, not done: ${[
    failed.length ? `tasks that never passed: ${failed.map((result) => result.task.id).join(', ')}` : '',
    skipped.length ? `tasks never started because a task they need failed: ${skipped.map((result) => result.task.id).join(', ')}` : '',
    conflicts.length ? `branches that conflicted on merge: ${conflicts.join(', ')}` : '',
    finalReview && finalReview.mustFix.length ? `whole-feature review must-fix: ${finalReview.mustFix.join('; ')}` : '',
    verifyFailed ? `final verification failed: ${finalCheck.evidence}` : '',
  ].filter(Boolean).join('; ')}.` : 'Mark the feature done only if step 1 passed, with the verification output as evidence.'}
   ${plan.assumptions.length ? `List these decisions made without asking the user in the pull request description and the handoff note, under "Assumptions":\n${plan.assumptions.map((item) => `   - ${item}`).join('\n')}\n   ` : ''}Write a handoff note for the next session in the harness's session handoff or progress file. ${local ? `Commit only code on ${featureBranch}; the harness files stay uncommitted in ${repoRoot}.` : `Commit on ${featureBranch}.`}
3. ${shipBlocked ? `Do not open a pull request. Push ${featureBranch} only if the remote exists, so the work is not lost.` : `If verification passed, ${hostStep}.${stackNote} If the CLI is missing or not signed in, push the branch anyway and return the web link where the user can open it by hand as manualPrLink.`}
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
  const keep = [featureBranch, ...stackOn, ...failed.map((result) => result.branch), ...conflicts]
  cleanup = await agent(`Clean up after a feature run without touching the user's current checkout or uncommitted work.
- Remove exactly these worktrees, which this run created, and no others: ${[...worktrees].join(', ') || '(none reported)'}. For each one: if \`git -C <path> status --porcelain\` prints anything, keep it and list it under kept; otherwise run \`git worktree remove <path>\`, then delete the branch the runtime created for it (usually \`worktree-<directory name>\`) with \`git branch -d\` — if git refuses because the branch holds unmerged work, keep it and list it. Never use \`git branch -D\` or \`--force\`. Finish with \`git worktree prune\`.
- Delete these task branches, which are merged into ${featureBranch}: ${results.filter((result) => result.landed && !keep.includes(result.branch)).map((result) => result.branch).join(', ') || '(none)'}. \`git branch -d\` only accepts a branch merged into the checked-out branch, and the user's checkout is not ${featureBranch} — so run it from a temporary one: \`git worktree add --detach <temp dir> ${featureBranch}\`, \`git -C <temp dir> checkout ${featureBranch}\`, \`git -C <temp dir> branch -d <task branches>\`, \`git -C <temp dir> checkout --detach\`, then \`git worktree remove <temp dir>\`. A branch git still refuses holds unmerged work: keep it and list it.
- Never delete these — they hold the delivered or unfinished work: ${keep.join(', ')}
- Remove temporary files or folders this run created outside git (build scratch, logs) if you can identify them with certainty; leave anything you are unsure about and list it under kept.
- If a hook or permission rule blocks a command, do not work around it; list what it blocked under kept.`,
    { label: 'cleanup', phase: 'Clean up', schema: CLEANED, ...gitOnly, ...as('cleanup') })
}

const status = shipBlocked || !delivered || !delivered.verificationPassed ? 'blocked' : 'delivered'
return {
  status,
  featureId: feature.id,
  featureBranch,
  targetBranch: target,
  stackedOn: stackOn,
  prUrl: delivered ? delivered.prUrl || null : null,
  manualPrLink: delivered ? delivered.manualPrLink || null : null,
  plan: { summary: plan.summary, doneCriteria: plan.doneCriteria, assumptions: plan.assumptions },
  tasks: taskReport,
  finalReview,
  finalCheck,
  delivery: delivered,
  cleanup,
}
