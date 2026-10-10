---
description: Set up, migrate, or reconfigure this PM vault — a guided walkthrough
disable-model-invocation: true
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Walk the user through setting up a PM vault in the current directory (a dedicated vault repo or a product repo — both work). Follow the pm-os skill's conventions. You guide; the user decides. Offer a recommended answer in every round with a one-sentence reason, batch each round's questions in ONE message, and never write a file before the user approves what will be written.

Scripts live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/`, templates in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`, references in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/`.

## 1. Inspect, then pick the path

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/validate-vault.mjs --target . --json` and look at the directory. Say which situation this is, then follow it:

| Situation | Path |
|---|---|
| Nothing here (`unscored`, no PM material) | **New** — continue at step 2 |
| PM material in another structure (an Obsidian folder, a course vault, a `docs/` tree, loose markdown) | **Migrate** — follow [migration.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/migration.md): relocate it into the vault folders, or adapt to it where it stands. Then continue at step 3 |
| A vault without a `workflow` key, or one missing what a later release added | **Upgrade or fill gaps** — interview only for what is missing (step 2 in gap mode), then step 3 |
| A vault with a `workflow` key | **Reconfigure** — show the current setup as a table (identity, language, writing style, mode, visibility, pipelines), ask what to change, and run only those rounds |

Exit 2 means the config is invalid or unsafe: show the error and fix it with the user before anything else. A vault that still has only `pm-os.config.md` converts with `create-vault.mjs --upgrade-config --target .`; tell the user what the conversion could not carry over (integrations and the roster).

**Gap mode** is the upgrade path, and it adds only what is missing:
- before 1.3.0: no `vision.md`, `language`, or `completeness`
- before 1.4.0: no `roadmap.json`
- before 2.2.0: no `codebases` (offer the code question, never add a registry unasked)
- before 3.0.0: no writing-style block in `anti-style.md`, and no `workflow` key (offer dynamic mode in step 4; classic stays the default)

List what you added. Never overwrite existing content without explicit approval.

## 2. Interview

One section at a time, but batch each section's questions in one message, and confirm before moving on. **Target 5 minutes.** Every section has a working default: take it and move on rather than pressing for an answer the user does not have yet. A vault they can try today beats a complete vault they abandoned at question 14, and a later setup run fills gaps without overwriting. Skip anything `~/.claude/CLAUDE.md` already answers: present it as pre-filled and ask only for confirmation.

1. **You as PM**: name; focus area; how you decide (a framework or instinct); top priority this week.
2. **Your product**: name; one-liner; customers (type, size); stage plus ARR, growth, or customer count if shareable; the **North Star Metric** and why. Solo founders often have no traction numbers yet. Record `unmeasured` and move on.
3. **Users & buyers**: the 2–4 people who use it daily (role, biggest pain, goal each); who signs vs who uses.
4. **Stakeholders**: names, roles, what each cares about, how to frame for each.
5. **Terminology**: the exact terms the team uses, and the banned synonyms for each.
6. **Integrations for THIS project**: Jira / Confluence / Google Drive / BigQuery. Enable only what this project actually uses. If an enabled tool's MCP isn't connected in this session, note it but still record the choice.
7. **Code**: one question — **"do you write or read code for this product?"** No → skip; the vault works without code. Yes → for each repo, ask where it is, whether work there is yours (`mine`) or another owner's (`dependency`), and which branch planning should read. Suggest `CODE/<repo>/` as its home (clone it there if they want), but a repo they already keep elsewhere, or share with another vault, is registered where it stands. Offer `/blvck-harness:setup` for each `mine` repo that has no `CLAUDE.md` + `init.sh`.
8. **Agent team**: ask one question — **"when you are planning something, who do you normally have to go ask?"** Do not ask which agents they want; nobody can answer that before using the thing. Map their answer onto the catalog, name the mapping out loud, and offer to build anything unmatched:

   | They said | Archetype |
   |---|---|
   | "our engineering lead", "the architect", "whoever tells me it's harder than I think" | `lead-engineer` |
   | "customers", "support", "the interviews" | `customer-voice` |
   | "what competitors do" | `competitive-intel` |
   | "the numbers", "our analyst" | `business-analyst` |
   | "my CEO", "the board", "investors" | `board-executive` |
   | "someone to poke holes in it" | `blind-reviewer` |
   | "reading a pile of research" | `research-analyst` |
   | "I need to see it working first" | `prototype-builder` |

   "Nobody, I work alone" is the most important answer in the set, not an empty one. It means the agents are replacing a team that does not exist, so recommend `lead-engineer` + `blind-reviewer` as the floor and explain why those two. Anything with no archetype is real and gets built with agent-smith (step 4's personas round says which copy to use).

## 3. Writing style

Read [writing-style.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/writing-style.md) and run its round in both modes: banned words, tone, output language, and whether internal references (ticket ids, codenames) may appear in documents going to customers or executives. On reconfigure, show the current block and ask only what to change.

## 4. Mode, visibility, and the dynamic rounds

Read [workflow-setup.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/workflow-setup.md) and run its rounds in order: mode → visibility → (dynamic only) preset → pipelines and stages → agents per stage → review lenses → personas → skills per stage → grilling → deliver targets → confirm. Skip a round whose answer is already settled.

## 5. Confirm

Show everything that will be written in one place: the files and folders, the agent roster, the writing-style block, and for dynamic mode the per-pipeline stage tables and deliver targets. Write nothing until the user says yes.

## 6. Write

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/create-vault.mjs --target . --product "<name>" [--slug <slug>] \
  --language <code> --agents <roster> [--mode dynamic --preset <recommended|lean|custom>] [--visibility local]
```

- It creates what is missing and never overwrites, unless the user approved `--force` for a named file. On an existing vault, `--mode dynamic` adds the `workflow` key once and adds only the missing personas to the roster.
- Then fill every `{{PLACEHOLDER}}` from the interview. Pay particular attention to the identity file, `ABOUT-ME/CLAUDE.md` (never `about-me.md`), the product `CLAUDE.md`, and each agent's product details.
- Personas tailored with agent-smith are written to `.claude/agents/<default name>.md` before this step, so the script skips them.
- Edit the `workflow` key wherever the user's choices differ from the preset. Write the banned words into `anti-style.md` and the writing-style block between its markers.
- `vision.md` stays a skeleton on purpose: the vision needs a Socratic conversation, so tell the user to run the `vision` workflow when ready. `roadmap.json` starts empty, because the vision's "What Must Become True" rows fill it.
- `CODE/` exists only when a repo lives there. If the vault is a git repo, add each nested repo to `.gitignore` so the vault never tracks code. Do not create a root `CLAUDE.md`, because Claude Code loads it in every coding session under the vault.
- Field meanings: [config.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/config.md).

## 7. Verify

Run `validate-vault.mjs` again, then **report every repair you made**: the file, what was wrong, and what you did. Do not fix silently. Setup wrote the identity file under the wrong name for two releases and nobody noticed, because a silent repair hid it on every run. Exit 2 means the config you wrote is wrong; fix it before reporting.

## 8. Report

Write it in plain language that stands on its own. Cover what was created or changed, the vault tree, the agent roster, the language and writing-style rules, the mode and visibility, and, in dynamic mode, the stage table per pipeline, so the user sees who does what. Close with the day-to-day entry points:
- ask for any document and the pm-os skill routes it
- `/blvck-pm:run` for a piece of work that should go through its pipeline
- `/blvck-pm:check` for a health check
