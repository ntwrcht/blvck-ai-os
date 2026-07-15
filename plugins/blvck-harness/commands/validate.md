---
description: Structural pass/fail check of this repo's harness, with a fix list
---
Validate the harness in the current repository.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and parse the result (layout, resolution, per-subsystem checks, map errors, team findings if present).
2. Read the exit code before the score — they mean different things:
   - **2** — the command or `.harness-map.json` is misconfigured, and nothing was scored. The error names the problem. Fix that and stop; do not report a score.
   - **1** — the harness scored below the bar, or has blocking findings, or `mapErrors` is non-empty, or `unscored` is true.
   - **0** — passed.
3. If `unscored` is true, say so plainly instead of reporting the number: no harness artifacts were found, and the score shown is a floor artifact, not a measurement. Offer `/blvck-harness:migrate` — if the repo does have a harness under its own file names, mapping it is the fix, not scaffolding a second one on top.
4. Report the **Resolution** first when `layout` is `adapted` or any concept is unresolved: which real file satisfied each concept, from the `resolution` object. A score against a mapped harness is only trustworthy if the reader can see what was actually read.
5. Any `mapErrors` are the top of the fix list. A declared path that does not exist is a broken assertion in the user's own map — it fails the run whatever the score is, and it never silently falls back to a built-in name.
6. In **team** layout, add the git-aware checks the script cannot do:
   - For each claimed feature (`owner` set, status `in-progress`), check its `branch` exists: `git branch -a --list '*<branch>*'`. A claim whose branch is gone is stale — flag it.
   - Check for feature directories added on the current branch but never pushed (`git log @{u}.. --name-only -- features/ 2>/dev/null`); unpushed claims are invisible to teammates.
   - Adapted layouts get scoring but no hygiene findings — the findings read `features/*/status.json` directly. Say so rather than implying the claim hygiene is clean.
7. Report as a pass/fail table per subsystem check, then a **Fix list**: each failed check with the exact file and edit that fixes it, ordered by impact. Cite check ids (`state.trackerSchema`), not just messages — they are stable and the user can act on them. Where a check has `sharedWith`, say that one edit clears both. Placeholder content (template text never replaced) counts as a failure — call it out specifically.
8. Keep judgment separate from evidence: the script's findings are facts; your git checks and placeholder detection are review findings. Do not fix anything unless the user asks.
