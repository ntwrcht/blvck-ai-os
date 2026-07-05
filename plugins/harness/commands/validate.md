---
description: Structural pass/fail check of this repo's harness, with a fix list
---
Validate the harness in the current repository.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and parse the result (layout, per-subsystem checks, team findings if present).
2. In **team** layout, add the git-aware checks the script cannot do:
   - For each claimed feature (`owner` set, status `in-progress`), check its `branch` exists: `git branch -a --list '*<branch>*'`. A claim whose branch is gone is stale — flag it.
   - Check for feature directories added on the current branch but never pushed (`git log @{u}.. --name-only -- features/ 2>/dev/null`); unpushed claims are invisible to teammates.
3. Report as a pass/fail table per subsystem check, then a **Fix list**: each failed check with the exact file and edit that fixes it, ordered by impact. Placeholder content (template text never replaced) counts as a failure — call it out specifically.
4. Keep judgment separate from evidence: the script's findings are facts; your git checks and placeholder detection are review findings. Do not fix anything unless the user asks.
