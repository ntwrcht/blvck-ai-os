# Role Classification

How to read a repo you did not scaffold. Used by `/blvck-harness:migrate` for both of its
outcomes — converting files to the canonical shape, and mapping them where they stand — and by
`.harness-map.json`, whose concept keys are this vocabulary made executable.

One home on purpose: when the same list lives in a command prompt and in a script, the two
drift, and the tool ends up recognising a tracker during migration that it cannot see during
validation.

## The principle

**Classify files by the role they play, never by matching a known layout.** Known origins
(upstream `learn-harness-engineering`, this plugin's own solo and team layouts) are
classification *hints, not requirements*. A file that fits no role is **unknown** — ask the
user what it is; never guess.

A harness is five concepts. Every repo that has one has all five somewhere, under whatever
names its authors chose. The names are incidental. The roles are not.

## The five roles

| Role | Map concept | Plays this part | Commonly looks like |
|---|---|---|---|
| Instruction file | `instructions` | Startup path, working rules, definition of done | `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `docs/agent-guide.md`, a contributor guide that addresses an agent |
| Feature / task tracker | `featureTracker` | What work exists, its status, its dependencies | `feature_list.json`, `features/*/status.json`, `TODO.md`, `roadmap.md`, `.harness/features.json`, task tables inside docs |
| Progress / session log | `progressLog` | What happened, with evidence | `progress.md`, `journal/*.md`, dated session notes, a changelog used as a log |
| Session handoff | `sessionHandoff` | Where the last session stopped, so the next can restart | `session-handoff.md`, the newest progress entry, a "current state" section |
| Verification entrypoint | `verification` | The command the agent must run before claiming done | `init.sh`, a `Makefile` target, a package script the team treats as "am I healthy" |

Two notes on the edges:

- **Scope has no role bucket.** It is the fifth *subsystem* but not a sixth file — scope lives
  inside tracker content (dependencies, done criteria) and instruction content (the
  one-feature rule). Nothing to classify; it is graded from what the other roles resolve to.
- **Progress log and session handoff often share files.** A `journal/` directory is usually
  both: every entry is the log, the newest entry is the handoff. Mapping the same glob to both
  concepts with `"pick": "last"` on the handoff is normal, not a mistake.

## Vocabulary is a role too

Structure is only half of it. A repo that calls its startup section "Kickoff" and its done
criteria "Acceptance criteria" has both concepts — in its own words. When classifying, record
the *words* the instruction file actually uses for:

- startup path → `instructions.startupWorkflow`
- definition of done → `instructions.definitionOfDone` **and** `scope.completionGate`
- the one-feature rule → `scope.oneFeatureAtATime`
- end-of-session routine → `lifecycle.endOfSession`
- fail-fast in verification → `verification.failsFast`

These become the map's `vocabulary`. Two constraints worth stating plainly:

1. **Synonyms add to the built-in wording, never replace it.** A repo that says both still passes.
2. **A synonym still has to appear in structure** — a heading, list item, table row, or bold
   lead-in. Recording "Kickoff" does not make a paragraph that mentions kickoff count. The
   phrase has to be load-bearing, which is the whole point of the gate.

There is no transitivity: `instructions.definitionOfDone` and `scope.completionGate` read the
same idea but have different needle sets, so a synonym for one is **not** automatically a
synonym for the other. Declare it twice when it applies twice.

## Convert or adapt

Classification is the same work whichever way it ends. The fork is what you do next:

- **Convert** — move the files into the canonical shape. Right when the user wants the
  standard layout, or when their current structure is genuinely accidental.
- **Adapt** — leave every file exactly where it is and write `.harness-map.json` so the
  scorer reads them in place. Right when the structure is deliberate, load-bearing, or
  referenced by other tooling.

Adapting is not a lesser outcome. A mapped harness scores on the same 25 checks and can reach
100/100; the report just marks the layout `adapted` and names the file behind each concept.
What a map cannot do is invent structure — declaring a path the repo does not have fails, and
declaring a synonym for a concept the doc never states in structure fails too.
