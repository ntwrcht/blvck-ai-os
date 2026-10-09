---
description: Set up, migrate, or reconfigure this repo's harness — a guided walkthrough
argument-hint: [solo|team]
disable-model-invocation: true
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Walk the user through setting up an engineering harness in the current repository. Follow the harness-engineering skill's conventions. You guide; the user decides. Offer a recommended answer in every round with a one-sentence reason, batch the questions in each round, and never write a file before the user approves what will be written.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/`; references in `${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/`.

## 1. Inspect, then pick the path

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and look for agent setup files (`CLAUDE.md`, `AGENTS.md`, trackers, `init.sh`, `.harness-map.json`, `.claude/harness-workflow.json`). Say which situation this is, then follow it:

| Situation | Path |
|---|---|
| No harness (`unscored`, no agent files) | **New** — continue at step 2 |
| An agent setup in some other shape | **Migrate** — follow [migration.md](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/migration.md) (convert, or adapt in place with `.harness-map.json`), then continue at step 3 |
| A blvck harness with no `.claude/harness-workflow.json` (classic, or 1.x) | **Upgrade or fill gaps** — offer dynamic mode; continue at step 3 |
| A blvck harness with a workflow config | **Reconfigure** — show the current config as a table, ask what to change, continue at step 3 with only those rounds |

Exit 2 from the validator means an existing map or workflow config is broken: show the error and fix it with the user before anything else.

## 2. New harness: layout and scaffold

1. **Layout.** Run `git shortlog -sn --no-merges | head -5`. One committer → recommend **solo**; several → recommend **team** (one-writer-per-file avoids merge conflicts on shared state). `$ARGUMENTS` may already name it.
2. **Features.** Ask for the first 2–4 concrete features.
3. **Verification.** Confirm how this project actually builds and tests.

## 3. Code style

Read [code-style.md](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/code-style.md) and run its round in both modes: read the codebase's own conventions first, then ask about comments, references in code, naming, and language, with a recommendation for each. On reconfigure, show the current `## Code Style` section and ask only what to change.

## 4. Mode, visibility, and the dynamic rounds

Read [workflow-setup.md](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/workflow-setup.md) and run its rounds in order: mode → visibility → (dynamic only) preset → stages → agents per stage → personas → skills per stage → grilling → delivery → confirm. Skip a round whose answer is already settled.

## 5. Write

After the user confirms:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/create-harness.mjs --target . \
  --layout <solo|team> --agent-file CLAUDE.md \
  [--mode dynamic --preset <recommended|lean|custom> --host <github|gitlab|none> --target-branch <branch>] \
  [--visibility local] [--no-agents] [--jira-key KEY]
```

- Existing files are skipped, never overwritten, unless the user approved `--force` for a named file.
- Then apply the user's choices that differ from the preset by editing `.claude/harness-workflow.json`, and re-run the same command (add `--no-agents`) so the instruction file's **Workflow Mode** section is re-rendered from the config.
- Personas tailored with agent-smith are written before this step, under the default names, with `--no-agents` on the scaffold.
- Write the `## Code Style` section between its markers, as code-style.md shows (replace an existing block, never add a second).
- Replace the placeholder features with the user's real ones, and fix `init.sh` so its commands match how the project builds and tests.

## 6. Verify

Run `./init.sh` — repair it until it passes; a harness whose verification fails teaches the agent to skip verification. Then run the validator again: exit 2 means the config or map you wrote is wrong.

## 7. Report

In plain language that stands on its own: what was created or changed, the layout, mode, visibility, and code style rules, and how to use it day to day — `/blvck-harness:run` to start a feature, `/blvck-harness:check` for a health check. For dynamic mode, include the stage table so the user sees who does what.
