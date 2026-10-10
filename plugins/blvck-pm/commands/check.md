---
description: Health check of this PM vault — score, findings, readiness, and a fix list, whatever the folders are called
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Check the PM vault in the current directory. Report; do not fix anything unless the user asks.

## 1. Run the script

`node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/validate-vault.mjs --target . --json`

Read the exit code before the score:
- **2**: `pm-os.config.json` (its `workflow` key included) is invalid or unsafe, and nothing was scored. That is not a weak vault. Report the error and how to fix it, and stop.
- **1**: below the bar (70), `unscored`, or a blocking finding. Four things block regardless of score: a declared path that does not exist (`missingDeclaredPaths`, a registered codebase that is gone or is not a repo included), an unresolved `{{PLACEHOLDER}}`, a roadmap error, and an unparseable completeness override.
- **0**: passed.

Report the score and exit code verbatim. Never soften the result.

## 2. Score roles, not folder names

The checks grade roles: identity, product context, vision, roadmap, templates, outputs, config, agents. Folder names only decide where to look. When the result is `unscored`, or the vault plainly keeps its material under its own names and the config declares no `paths`, the script may simply be looking in the wrong place. A floor score is not a verdict, so discover instead:

1. Classify the directory's files by the role they play, following Phase 1 of [migration.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/migration.md). A file that fits no role is unknown; leave it out rather than guess. Never read a codebase's files as PM material.
2. Write that reading as a config with a `paths` object to a scratch file **outside the vault**. If the vault has a config, start from a copy of it. Score it: `validate-vault.mjs --target . --config <scratch file> --json`. The checks stay deterministic; only where they look came from judgment.
3. Report it as a **discovered** reading, with the before and after scores, and the resolution (role → the real path), so the user can see what you read.
4. Offer to save the `paths` into `pm-os.config.json`, so every later check and CI get the same number. Write it only on a yes.

If nothing plays a role anywhere, that role is genuinely missing. Say so.

## 3. Judge what the script cannot

Read [review-rubric.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/review-rubric.md) and apply it: the content rules, the hygiene findings, and the readiness grade per module. The script's results are facts; your grades are review findings. Keep them apart, and never add one number to the other.

## 4. Report

Lead with the verdict in one sentence: passed or not, the score, and the main reason. Then:

- **Modules**: a table of identity, product, plan, roadmap, and config with the score per module and each failed check named by id (`plan.completeness`).
- **Blocking findings**, each with the file it is in.
- **Resolution**: role → path, marked declared, default, or discovered.
- **Codebases**: each registered repo's state, and the warnings (an undeclared nested repo, a root `CLAUDE.md` that leaks into a nested repo). Warnings change neither the score nor the exit code; say so.
- **Completeness overrides**: every document that recorded one, with the date and what was unmet. Report the pattern, not just the rows.
- **Mode and visibility**, from `workflow` and `visibility`. In dynamic mode, also check what the script does not: every persona a stage or lens names exists in `.claude/agents/` or `~/.claude/agents/`; every deliver target's MCP tools are connected in this session; and which configured skills are not installed. With `visibility: local`, confirm `git status` lists none of the vault's files.
- **Writing style**: if `anti-style.md` has no writing-style block, say so and offer `/blvck-pm:setup` to add one. It is not scored.
- **Readiness**: the grade per module with one line of evidence, the weakest module, and what's working, in one line.

## 5. Fix list

List each failed check or finding with the exact file and edit that fixes it, highest impact first. Blocking findings come first, then a missing NSM, then the rest. Make each fix a concrete action ("run research-synthesis on the 5 interview files in research/"), not advice ("do more discovery"). Offer to apply the fixes, and touch the identity dir and product context only with explicit approval per file.
