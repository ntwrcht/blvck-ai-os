export const meta = {
  name: 'blvck-pm-work',
  description: 'Run one piece of PM work in parallel: research or analyze each source, draft, review through blind lenses, revise, check completeness, and deliver the document to the vault',
  whenToUse: 'Launched by /blvck-pm:run in dynamic mode, after the main session has grilled the user and picked the roadmap outcome the work serves',
  phases: [
    { title: 'Research' },
    { title: 'Draft' },
    { title: 'Review' },
    { title: 'Revise' },
    { title: 'Completeness' },
    { title: 'Deliver' },
  ],
}

// Lives outside the plugin's workflows/ directory on purpose: anything there becomes its own
// slash command, and the plugin's menu is exactly setup, run, check. /blvck-pm:run launches this
// by path and passes everything it needs through `args`, because a workflow script has no
// filesystem access of its own.
//
// args = {
//   config,     // the validated "workflow" key of pm-os.config.json (mode must be "dynamic")
//   pipeline,   // prd | research-synthesis | competitor-teardown | prd-review
//   brief,      // { title, slug, summary, sources: [], competitors: [], document }
//   grilling,   // the answers the user gave in the main session, as plain text
//   outcome,    // the roadmap item this serves: { id, outcome, metric }, or null
//   vault,      // { root, paths, language, productName } from validate-vault --json
//   checklist,  // the resolved completeness checklist for this document type (prd only)
//   codebases,  // registered codebases, each pinned by run: [{ name, path, scope, commit }]
//   date,       // YYYY-MM-DD, used in the output file name
// }
//
// No stage writes to the vault except Deliver. Workers return their results, so parallel agents
// never share a file, the vault is untouched when a run stops for input, and no git worktree is
// needed.

const PIPELINES = ['prd', 'research-synthesis', 'competitor-teardown', 'prd-review']
// `pipeline` is a global in the workflow runtime, so the local name is `work`.
const { config, pipeline: work, brief = {}, grilling = '', outcome = null, vault = {}, checklist = [], codebases = [], date = '' } = args || {}
if (!config || config.mode !== 'dynamic') throw new Error('blvck-pm-work needs a dynamic-mode workflow config in args.config — run it through /blvck-pm:run')
if (!PIPELINES.includes(work)) throw new Error(`args.pipeline must be one of ${PIPELINES.join(', ')}`)
const pipe = config.pipelines[work]
if (!pipe || !pipe.enabled) throw new Error(`The ${work} pipeline is off in this vault — turn it on with /blvck-pm:setup`)
if (!vault.root || !vault.paths) throw new Error('blvck-pm-work needs args.vault with root and paths')
if (!brief.slug || !/^[a-z0-9][a-z0-9-]*$/.test(brief.slug)) throw new Error('args.brief.slug must be lowercase-hyphen: it becomes the file name')
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('args.date must be YYYY-MM-DD')
const sources = brief.sources || []
const competitors = brief.competitors || []
if (work === 'research-synthesis' && sources.length === 0) throw new Error('research-synthesis needs at least one source in args.brief.sources')
if (work === 'competitor-teardown' && competitors.length === 0) throw new Error('competitor-teardown needs at least one competitor in args.brief.competitors')
if (work === 'prd-review' && !brief.document) throw new Error('prd-review needs the document to review in args.brief.document')

const stages = pipe.stages
const on = (name) => Boolean(stages[name] && stages[name].enabled)
const paths = vault.paths
const language = vault.language || 'en'

const skillLine = (name) => {
  const skills = (stages[name] && stages[name].skills) || []
  return skills.length ? `Use these skills when they are available to you: ${skills.join(', ')}. Skip any that are not installed.` : ''
}
// The persona a stage runs as — a subagent from .claude/agents/ — or the default workflow agent.
const as = (name, agent) => {
  const chosen = agent !== undefined ? agent : stages[name] && stages[name].agent
  return chosen ? { agentType: chosen } : {}
}

// Archetypes carry their own output contract (several write files). In a run only Deliver
// writes, so every other stage overrides it.
const RETURN_ONLY = 'This run decides your output: return it in the requested structure and write no files, whatever your usual output contract says.'
const GROUND = `Work in the PM vault at ${vault.root}. Ground first: read ${paths.identityFile}, ${paths.antiStyle}, and ${paths.productContext}${paths.vision ? `, plus ${paths.vision} if it exists` : ''}. Follow the vault's writing rules.`
const CODE = codebases.length
  ? `Registered codebases, each pinned to the commit the PM's session refreshed. Read code only through git at that commit (\`git -C <path> show <commit>:<file>\`, \`git -C <path> grep <pattern> <commit>\`), cite path:line with the commit, and never check out, commit, or build in them:\n${codebases.map((c) => `- ${c.name} (${c.scope}): ${c.path} @ ${c.commit || 'unpinned — label every citation from it unpinned'}`).join('\n')}`
  : ''
const context = [
  `Work: ${brief.title || brief.slug}`,
  brief.summary ? `Summary: ${brief.summary}` : '',
  outcome ? `Roadmap outcome it serves: ${outcome.id} — ${outcome.outcome}${outcome.metric ? ` (metric: ${outcome.metric})` : ''}` : 'Roadmap outcome: none fits. Say so in the document; do not invent one.',
  grilling ? `Requirements the PM confirmed before this run:\n${grilling}` : '',
].filter(Boolean).join('\n')

// Without a bar, "never guess" never finishes: the harness's first live run asked two rounds of
// trivia and built nothing. Questions are for what the PM would notice or object to; the rest is
// decided and disclosed in the document, so nothing is hidden and nothing stalls.
const STOP_WHEN = work === 'prd'
  ? 'its answer changes the document in a way the PM would notice or object to: scope, a promise to customers or executives, pricing, a success metric or its target, data kept or lost, or anything hard to reverse'
  : 'you cannot do the work without it: the question the brief asks is unclear, or a source cannot be read'
const MATERIAL = `Decide versus ask:
- Put a question in openQuestions only when ${STOP_WHEN}. Any open question stops the whole run, so use it rarely.
- A decision your findings raise for the PM that this document does not need settled to be finished — where work goes on the roadmap, what to build next, whether to change a plan — goes in decisions, one line each, never in openQuestions. The document lists them under "Decisions for the PM".
- Decide everything else about the content the way a competent PM would, and record each decision in assumptions, one line each. Assumptions are about the content and its evidence, never about how this run is set up or what it told you to do.
- Never ask what the confirmed requirements already answer.`

// Per-stage ceilings. The workflow runtime has its own global cap; this one is the user's choice
// from setup, and a stage never runs more agents at once than they allowed.
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

const strings = { type: 'array', items: { type: 'string' } }
const ANALYSIS = {
  type: 'object',
  properties: { subject: { type: 'string' }, summary: { type: 'string' }, evidence: strings, contradictions: strings, confidenceNotes: strings },
  required: ['subject', 'summary', 'evidence', 'contradictions'],
}
const DRAFT = {
  type: 'object',
  properties: { title: { type: 'string' }, markdown: { type: 'string' }, assumptions: strings, decisions: strings, openQuestions: strings, declined: strings },
  required: ['title', 'markdown', 'assumptions', 'openQuestions'],
}
const REVIEW = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { severity: { type: 'string', enum: ['showstopper', 'must-fix', 'consider'] }, quote: { type: 'string' }, finding: { type: 'string' }, answer: { type: 'string' }, flagged: { type: 'boolean' } },
        required: ['severity', 'finding', 'answer', 'flagged'],
      },
    },
    preserve: { type: 'string' },
  },
  required: ['lens', 'findings', 'preserve'],
}
const CONSOLIDATED = {
  type: 'object',
  properties: { markdown: { type: 'string' }, topFix: { type: 'string' }, decided: strings, flagged: strings },
  required: ['markdown', 'topFix', 'decided', 'flagged'],
}
const COMPLETE = {
  type: 'object',
  properties: { unmet: strings, unchecked: strings },
  required: ['unmet', 'unchecked'],
}
const DELIVERED = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    written: { type: 'boolean' },
    roadmapUpdated: { type: 'boolean' },
    targets: {
      type: 'array',
      items: {
        type: 'object',
        properties: { target: { type: 'string' }, status: { type: 'string', enum: ['published', 'skipped', 'failed'] }, link: { type: 'string' }, reason: { type: 'string' } },
        required: ['target', 'status'],
      },
    },
    proposedFeatures: strings,
    notes: { type: 'string' },
  },
  required: ['path', 'written', 'roadmapUpdated', 'targets'],
}

const needsInput = (questions, stage) => ({
  status: 'needs-input',
  pipeline: work,
  stage,
  questions,
  summary: `The ${stage} stage found questions only the PM can settle, so nothing was written to the vault.`,
})

// ---------------------------------------------------------------------------
// Research — one analyst per source or competitor, at most the stage ceiling at once
// ---------------------------------------------------------------------------
const researchStage = work === 'prd' ? 'discover' : 'analyze'
const subjects = work === 'competitor-teardown' ? competitors : sources
let analyses = []
if (work !== 'prd-review' && on(researchStage) && subjects.length) {
  phase('Research')
  const slot = limiter(stages[researchStage].agents)
  const ask = work === 'competitor-teardown'
    ? (subject) => `Analyze one competitor of ${vault.productName || 'this product'}: ${subject}. Cover positioning, target customer, pricing, the jobs they win and lose, and where they are moving. Cite every claim's source (URL, document, or "from the vault"); mark anything unsourced as inference.`
    : (subject) => `Analyze exactly one source and nothing else: ${subject}. Extract verbatim quotes worth keeping, the jobs it shows (situation → motivation → outcome), facts it states, and anything that contradicts the product's current assumptions. Never merge in other sources.`
  analyses = (await parallel(subjects.map((subject, i) => () => slot(() =>
    agent(`${GROUND}
${context}
${ask(subject)}
${skillLine(researchStage)}
${CODE}
${RETURN_ONLY}`, { label: `${researchStage}:${i + 1}`, phase: 'Research', schema: ANALYSIS, ...as(researchStage) }))))).filter(Boolean)
  if (work !== 'prd' && analyses.length === 0) throw new Error(`Every ${researchStage} agent returned nothing`)
}

// ---------------------------------------------------------------------------
// Draft — the document itself (prd-review has no draft: the document already exists)
// ---------------------------------------------------------------------------
const OUTPUT = {
  prd: { folder: 'prds', file: `prd-${brief.slug}-v1-${date}.md`, template: 'prd.md', draftStage: 'draft' },
  'research-synthesis': { folder: 'research', file: `synthesis-${brief.slug}-${date}.md`, template: 'research-synthesis.md', draftStage: 'synthesize' },
  'competitor-teardown': { folder: 'research', file: `teardown-${brief.slug}-${date}.md`, template: 'competitor-teardown.md', draftStage: 'compare' },
  'prd-review': { folder: 'prds', file: `${brief.slug}-multi-review-${date}.md`, template: null, draftStage: null },
}[work]
const outputPath = `${paths.outputs}/${OUTPUT.folder}/${OUTPUT.file}`

let doc = null
if (OUTPUT.draftStage) {
  phase('Draft')
  const job = {
    prd: 'Draft a PRD. Confirm the job-to-be-done and the success metric from the requirements; challenge any requirement with no evidence by recording it as an assumption.',
    'research-synthesis': 'Synthesize these per-source analyses into one research synthesis. An insight needs at least two independent sources; a single-source signal goes on a watch list. Report contradictions; never smooth them over. Give each insight its source count.',
    'competitor-teardown': 'Compare these competitor analyses in one teardown: one section per competitor, then a comparison table and what it means for our positioning. Keep sourced claims and inference apart.',
  }[work]
  doc = await agent(`${GROUND}
${context}
${job}
Use the template ${paths.templates}/${OUTPUT.template} if the vault has it, otherwise the plugin's ${OUTPUT.template}. Write in ${language}.
${analyses.length ? `Analyses (one per source):\n${JSON.stringify(analyses, null, 2)}` : ''}
${skillLine(OUTPUT.draftStage)}
${CODE}
${MATERIAL}
${RETURN_ONLY}`, { label: OUTPUT.draftStage, phase: 'Draft', schema: DRAFT, ...as(OUTPUT.draftStage) })
  if (!doc) throw new Error(`The ${OUTPUT.draftStage} stage returned nothing`)
  doc.assumptions = doc.assumptions || []
  doc.decisions = doc.decisions || []
  if (doc.openQuestions.length) return needsInput(doc.openQuestions, OUTPUT.draftStage)
}

// ---------------------------------------------------------------------------
// Review — one blind agent per lens; none sees another's review
// ---------------------------------------------------------------------------
let reviews = []
if (on('review')) {
  phase('Review')
  const slot = limiter(stages.review.agents)
  const target = doc
    ? `The document under review (not yet in the vault):\n<document>\n${doc.markdown}\n</document>`
    : `The document under review is ${brief.document} in the vault. Read only that file — never another review of it.`
  reviews = (await parallel(stages.review.lenses.map((lens) => () => slot(() =>
    agent(`${GROUND}
Review one document through a single lens: ${lens.name}. You review blind: you have not seen and must not look for any other review of it; independence is your value.
${context}
${target}
${skillLine('review')}
${CODE}
Anchor every finding to a quoted line and rank it showstopper, must-fix, or consider. Give the answer a competent ${lens.name} would give, and set flagged true when it changes cost, timeline, or scope, is hard to reverse, or you are not confident. Name one thing the document does well under preserve.
${RETURN_ONLY}`, { label: `review:${lens.name}`, phase: 'Review', schema: REVIEW, ...as('review', lens.agent !== undefined && lens.agent !== null ? lens.agent : undefined) }))))).filter(Boolean)
}
const serious = reviews.flatMap((review) => review.findings.filter((f) => f.severity !== 'consider').map((f) => ({ lens: review.lens, ...f })))
const flaggedFindings = reviews.flatMap((review) => review.findings.filter((f) => f.flagged).map((f) => `${review.lens}: ${f.finding} — ${f.answer}`))

// ---------------------------------------------------------------------------
// Revise (prd) or Consolidate (prd-review)
// ---------------------------------------------------------------------------
let consolidated = null
if (work === 'prd-review') {
  phase('Revise')
  consolidated = await agent(`${GROUND}
Consolidate these blind reviews of ${brief.document} into one review document. Lead with the single highest-priority fix (one that appears in two or more reviews, or any showstopper). Then the changes to make before engineering handoff, then one thing to preserve. Split every answer into Decided (any competent reviewer would call it the same way) and Flagged (needs a person to confirm, and who). Write in ${language}.
${context}
Reviews:
${JSON.stringify(reviews, null, 2)}
${skillLine('consolidate')}
${RETURN_ONLY}`, { label: 'consolidate', phase: 'Revise', schema: CONSOLIDATED, ...as('consolidate') })
  if (!consolidated) throw new Error('The consolidate stage returned nothing')
} else if (on('revise') && serious.length && doc) {
  phase('Revise')
  const revised = await agent(`${GROUND}
Revise this document to resolve the review findings. Address every showstopper and must-fix finding; list any you decline, with the reason, in declined. Keep what the reviewers said to preserve. Do not ask questions: record each new decision about the content as an assumption, and keep every existing assumption. Write in ${language}.
${MATERIAL.split('\n').slice(2, 4).join('\n')}
${context}
<document>
${doc.markdown}
</document>
Existing assumptions:
${doc.assumptions.map((item) => `- ${item}`).join('\n') || '(none)'}
Findings to address:
${serious.map((f) => `- [${f.lens}, ${f.severity}] ${f.quote ? `"${f.quote}": ` : ''}${f.finding} — suggested: ${f.answer}`).join('\n')}
To preserve:
${reviews.map((review) => `- ${review.lens}: ${review.preserve}`).join('\n')}
${skillLine('revise')}
${RETURN_ONLY}`, { label: 'revise', phase: 'Revise', schema: DRAFT, ...as('revise') })
  if (revised) {
    doc = {
      ...revised,
      assumptions: [...new Set([...doc.assumptions, ...(revised.assumptions || [])])],
      decisions: [...new Set([...doc.decisions, ...(revised.decisions || [])])],
    }
  }
}

// ---------------------------------------------------------------------------
// Completeness — names what is unmet; never fills a gap, never blocks
// ---------------------------------------------------------------------------
let completeness = null
if (work === 'prd' && on('completeness') && checklist.length) {
  phase('Completeness')
  completeness = await agent(`Check this document against its completeness checklist. For each item, decide whether the document meets it. Put unmet items in unmet, each with the section it belongs to; put items you cannot judge from the text in unchecked. Do not rewrite or suggest wording: the gate names gaps, it never fills them.
Checklist:
${checklist.map((item) => `- ${item}`).join('\n')}
<document>
${doc.markdown}
</document>
${RETURN_ONLY}`, { label: 'completeness', phase: 'Completeness', schema: COMPLETE, effort: 'low', ...as('completeness') })
}

// ---------------------------------------------------------------------------
// Deliver — the only stage that writes. Vault first; outside targets never block it.
// ---------------------------------------------------------------------------
phase('Deliver')
const targets = stages.deliver.targets || []
const destinations = config.destinations || {}
const mine = codebases.filter((c) => c.scope === 'mine')
const body = consolidated ? consolidated.markdown : doc.markdown
const assumptions = doc ? doc.assumptions : []
const decisions = doc ? doc.decisions : []
// Without a revise stage nobody acted on a serious finding, so the document carries it openly.
const unresolved = consolidated || on('revise') ? [] : serious
const howTo = {
  confluence: `publish it as a page in Confluence at ${destinations.confluence}, then add the page URL to the document's header`,
  drive: `upload it to Google Drive at ${destinations.drive}, then add the file link to the document's header`,
  jira: `create one Jira ticket per Must requirement in project ${destinations.jira}, each linking back to the document, then list the ticket keys in the document's header`,
}
const delivered = await agent(`Deliver one finished document into the PM vault at ${vault.root}. You are the only agent in this run that writes.
1. Write the document below to ${outputPath}, creating the folder if needed. If the folder already holds an earlier version of the same document, name this one with the next version number instead and move the earlier one into an _archive/ folder beside it — never delete it.
2. Append these sections at the end, in this order, skipping any with nothing to list and merging into a section of the same name the document already has:
${decisions.length ? `   "## Decisions for the PM": choices the findings raise, which the PM makes:\n${decisions.map((item) => `   - ${item}`).join('\n')}` : ''}
${assumptions.length ? `   "## Assumptions": decisions the run made without asking the PM, one bullet each:\n${assumptions.map((item) => `   - ${item}`).join('\n')}` : ''}
${flaggedFindings.length && !consolidated ? `   "## Flagged by review": these items for a person to confirm:\n${flaggedFindings.map((item) => `   - ${item}`).join('\n')}` : ''}
${unresolved.length ? `   "## Open review findings": these, because no revise stage addressed them:\n${unresolved.map((f) => `   - [${f.lens}, ${f.severity}] ${f.finding}`).join('\n')}` : ''}
${work === 'prd' && mine.length ? `3. Append a section "## Proposed harness features" with one entry per piece of work in these codebases (${mine.map((c) => c.name).join(', ')}): codebase, id feat-${date.replaceAll('-', '')}-<slug>, name, one-line description, and checkable done criteria. These are proposals for the PM to apply inside that repository; write nothing into any codebase.` : '3. No harness features to propose.'}
4. ${outcome ? `Add "${outputPath}" to the documents array of item ${outcome.id} in ${paths.roadmap}, keeping the file's formatting and every other field as it is. Change nothing else in the roadmap.` : 'No roadmap outcome was picked; do not touch the roadmap.'}
5. Do not add a "## Completeness" section: only the PM can accept a gap, and they decide after this run.
6. ${targets.length ? `Then, for each outside target, ${targets.map((t) => howTo[t]).join('; ')}. Use the matching connected tool. If the tool is not connected or the call fails, report that target as skipped or failed with the reason and carry on — a missing integration never blocks delivery.` : 'There are no outside targets: the vault is the only destination.'}
7. Do not commit, stage, or push anything.
If a hook or permission rule blocks a step, do not work around it; report it in notes.
<document>
${body}
</document>`, { label: 'deliver', phase: 'Deliver', schema: DELIVERED, ...as('deliver') })

const status = delivered && delivered.written ? 'delivered' : 'blocked'
return {
  status,
  pipeline: work,
  path: delivered ? delivered.path : outputPath,
  outcome: outcome ? outcome.id : null,
  roadmapUpdated: Boolean(delivered && delivered.roadmapUpdated),
  assumptions,
  decisions,
  declined: doc && doc.declined ? doc.declined : [],
  flagged: consolidated ? consolidated.flagged : flaggedFindings,
  topFix: consolidated ? consolidated.topFix : null,
  reviews: reviews.map((review) => ({ lens: review.lens, showstoppers: review.findings.filter((f) => f.severity === 'showstopper').length, mustFix: review.findings.filter((f) => f.severity === 'must-fix').length })),
  completeness: completeness ? { unmet: completeness.unmet, unchecked: completeness.unchecked } : null,
  targets: delivered ? delivered.targets : [],
  proposedFeatures: delivered ? delivered.proposedFeatures || [] : [],
  notes: delivered ? delivered.notes || '' : 'The deliver stage returned nothing.',
}
