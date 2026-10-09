---
description: Health check of this repo's harness — score, findings, and a fix list, whatever the files are called
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Check the harness in the current repository. Report; do not fix anything unless the user asks.

## 1. Run the script

`node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json`

Read the exit code before the score:
- **2** — the command, `.harness-map.json`, or `.claude/harness-workflow.json` is misconfigured, and nothing was scored. Report the error and how to fix it, and stop.
- **1** — below the bar (70), blocking findings, `mapErrors`, or `unscored`.
- **0** — passed.

## 2. Score concepts, not file names

The 25 checks grade five concepts — instructions, tracker, progress log, handoff, verification — and file names only decide where to look. When the result is `unscored`, or some concepts are unresolved and the repo has no `.harness-map.json`, the script may simply not be looking in the right place. Do not report a floor score as a verdict. Discover instead:

1. Read [Role Classification](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/role-classification.md) and classify the repo's files by the role they play. A file that fits no role is unknown — leave it out rather than guess.
2. Write the reading as a map to a scratch file **outside the repo**, and score it: `validate-harness.mjs --target . --map <scratch file> --json`. The checks stay deterministic; only where they look came from judgment.
3. Report it as a **discovered** reading, with the before → after, and the Resolution table so the user can see which file you read for each concept.
4. Offer to save it as `.harness-map.json`, so every later check and CI get the same number. Write it only on a yes.

If nothing plays a concept anywhere, that concept is genuinely missing — say so.

## 3. Report

Lead with the verdict in one sentence: passed or not, the score, and the main reason. Then:

- **Subsystems**: a table of instructions, state, verification, scope, lifecycle with score /5 and each failed check named by id (`state.trackerSchema`).
- **Resolution**, when the layout is `adapted` or discovered: concept → the real file behind it.
- **Synonym matches** (`matchedVia: "synonym"`): earned by the repo's own wording — worth stating, not a lesser pass.
- **Map errors**: a declared path that does not exist fails the run whatever the score.
- **Team layout**: the script's findings (dangling dependencies, duplicate slugs, stale claims, unowned in-progress features), plus git checks it cannot do — a claim whose `branch` no longer exists (`git branch -a --list '*<branch>*'`), and claims never pushed (`git log @{u}.. --name-only -- features/`). Adapted layouts get no hygiene findings; say so rather than implying they are clean.
- **Mode and visibility**: from `workflow` and `visibility`. In dynamic mode, also check what the script does not: each stage's `agent` exists in `.claude/agents/` or `~/.claude/agents/`; the instruction file's Workflow Mode section matches the config (if not, `/blvck-harness:setup` re-renders it); and which configured skills are not installed. With `visibility: local`, confirm `git status` does not list harness files.
- **Code style**: if the instruction file has no `## Code Style` section, say so and offer `/blvck-harness:setup` to add one. It is not scored — conventions are the user's choice — but without it agents fall back to their own habits.
- **Placeholder content** — template text never replaced — counts as a failure; name it.

## 4. Fix list

Each failed check or finding, with the exact file and edit that fixes it, highest impact first. Where a check has `sharedWith`, one edit clears both — that usually makes it the top fix. Treat the weakest subsystem as a candidate bottleneck, not proof; if everything is 5/5, say the structure is sound and the next gain is behavioral — whether sessions actually follow it.

Keep evidence and judgment apart: the script's results are facts; your git checks, discovery, and placeholder calls are review findings.
