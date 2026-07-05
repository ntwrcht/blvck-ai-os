---
description: Scaffold the five harness artifacts in this repo (solo or team layout)
---
Set up an engineering harness in the current repository. Follow the harness-engineering skill's conventions.

1. **Inspect first.** Check for an existing harness (`CLAUDE.md`/`AGENTS.md`, `feature_list.json`, `features/*/status.json`, `init.sh`). If one exists, say so and switch to gap-filling — never overwrite without explicit approval.
2. **Recommend a layout.** Run `git shortlog -sn --no-merges | head -5` (if a git repo). One committer → recommend **solo**; multiple → recommend **team** and explain in one sentence why (one-writer-per-file avoids merge conflicts on shared state). Let the user decide.
3. **Scaffold.** Run:
   `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/create-harness.mjs --target . --layout <solo|team> --agent-file CLAUDE.md`
   Add `--jira-key <KEY>` if the team tracks features in Jira and the user gives a key. Show what was written vs skipped.
4. **Make it real.** Interview briefly (batch the questions in one message):
   - What are the first 2–4 concrete features? Replace the placeholder entries (solo: `feature_list.json`; team: create one `features/<id>/` directory per feature via the script's `--feature-slug`, or by copying `templates/team/status.json` conventions).
   - Confirm the verification commands in `init.sh` match how this project actually builds and tests; fix them if not.
5. **Verify the harness itself.** Run `./init.sh`. If it fails, repair the commands before finishing — a harness whose verification entrypoint fails teaches the agent to skip verification.
6. **Report.** List created files, the layout, and the one-line ritual for daily use: start sessions by following the Startup Workflow in `CLAUDE.md`; end them by following End of Session. Suggest `/harness:validate` as the periodic health check.
