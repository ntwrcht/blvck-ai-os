---
name: harness-engineering
description: >-
  Background knowledge for harnesses that make AI coding agents reliable across sessions:
  instruction files, feature tracking, verification gates, scope, session handoff, and the
  dynamic multi-agent workflow. Use when a coding agent forgets context, drifts out of scope,
  claims "done" before tests pass, or when CLAUDE.md, AGENTS.md, feature_list.json,
  features/*/status.json, init.sh, .harness-map.json, or .claude/harness-workflow.json come up —
  even if the user never says "harness." Points the user to /blvck-harness:setup, :run, and :check.
user-invocable: false
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
license: MIT
---

# Harness Engineering

Use this skill to make a repository easier for coding agents to start, stay in scope, verify work, and resume across sessions. Keep the harness small enough that agents actually follow it.

Not for model selection, prompt tuning in isolation, chat UI design, or general app architecture.

Adapted from `harness-creator` in [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) (MIT), with an added team layout for repos where multiple humans work in parallel branches.

## The Three Commands

This skill is knowledge, not an entry point — it is hidden from the `/` menu on purpose, so users never wonder whether to type it or a command. When the user needs to act, send them to the command:

| The user wants to… | Command |
|---|---|
| Create a harness, migrate an existing setup, switch mode, or change stages, personas, skills, delivery, or visibility | `/blvck-harness:setup` |
| Start the next feature (grilling, then the dynamic workflow or the classic ritual) | `/blvck-harness:run` |
| Know how healthy the harness is, and what to fix first | `/blvck-harness:check` |

`setup` and `run` write files, so only the user can start them. `check` only reads and may be used directly.

## Core Model

Every useful coding-agent harness has five subsystems. The artifact columns are the *default*
names — the subsystem is the concept, and a repo that expresses it under its own names still
has it:

| Subsystem | Solo artifact | Team artifact | Adapted | Purpose |
|---|---|---|---|---|
| Instructions | `CLAUDE.md` / `AGENTS.md` | same, plus Team Rules | `instructions` | Startup path, working rules, definition of done |
| State | `feature_list.json`, `progress.md` | `features/<id>/status.json`, `features/<id>/progress/` | `featureTracker`, `progressLog` | Current feature, status, evidence, next step |
| Verification | `init.sh` or documented commands | same | `verification` | Checks the agent must run before claiming done |
| Scope | Feature dependencies and done criteria | same, plus claim (`owner` + `branch`) | (tracker content) | Prevents overreach and half-finished work |
| Lifecycle | `session-handoff.md`, end-of-session routine | handoff section inside each session's progress file | `sessionHandoff` | Makes the next session restartable |

## Choosing a Layout

- **Solo** (default): one human/agent stream. Single shared state files — simplest, matches the upstream reference.
- **Team**: multiple humans on parallel branches. State files follow one-writer-per-file: each feature is a directory, each session is a new progress file. Merge conflicts then only happen when two people genuinely collided on the same feature — a signal, not noise.
- **Adapted**: not a layout you scaffold — it is what solo or team becomes when the repo keeps its own file names. Declared in `.harness-map.json`, which maps each concept to the files that already play it (`verification` → a `Makefile` target is the common case: "`init.sh` **or** documented commands", finally true in code and not just in this table). The same 25 checks score it, and it can reach 100/100; the report marks the layout `adapted` and names the file behind each concept. Reach for it via `/blvck-harness:setup`, which runs the migration, or let `/blvck-harness:check` discover one — see [Role Classification](references/role-classification.md).
- Team feature IDs never use bare running numbers (two branches would both mint `feat-005`, and the post-merge rename breaks every `dependencies` reference). The allocator is embedded in the ID: `feat-20260705-approval-routing` (date) or `feat-KEY-123-approval-routing` (ticket key). Task IDs inside a claimed feature directory (`t01`…) may use running numbers — that namespace has one owner.

## Two Modes

- **Classic**: one agent follows the instruction file's startup ritual, one feature at a time. No config file — its absence *is* classic, so a 1.x harness keeps working unchanged.
- **Dynamic**: `.claude/harness-workflow.json` configures a background workflow per feature — plan, audit, breakdown, implementation in parallel git worktrees, per-task test and review, delivery to one feature branch with a PR/MR, clean-up. Each stage runs as a persona from `.claude/agents/` with the skills the user wired to it. Every value is the user's choice in `setup`; see [Workflow Setup](references/workflow-setup.md).

Mode never changes the score: the same files score the same in either mode. The harness can also be **local only** — listed in `.git/info/exclude`, never pushed.

## First Move

1. Inspect what already exists: instruction files, feature/state files, verification commands, docs, package manifests.
2. Detect the layout (`features/*/status.json` ⇒ team) and, for new setups, check `git shortlog -sn` — multiple committers suggests team.
3. Ask only for missing context that cannot be inferred safely: layout, agent file name, tolerance for structure, whether overwriting is allowed.
4. Prefer a minimal harness first. Add memory, tool safety, multi-agent, or extra structure only when the user's problem calls for them.

## Common Tasks

### Create a harness

```bash
node ${CLAUDE_SKILL_DIR}/scripts/create-harness.mjs --target /path/to/project                # solo (default)
node ${CLAUDE_SKILL_DIR}/scripts/create-harness.mjs --target /path/to/project --layout team  # team
```

Options: `--mode dynamic`, `--preset recommended|lean|custom`, `--host github|gitlab|none`, `--target-branch BRANCH`, `--visibility local`, `--no-agents`, `--agent-file AGENTS.md`, `--package-manager npm|pnpm|yarn|bun`, `--commands "cmd one,cmd two"`, `--feature-slug first-feature`, `--jira-key KEY-123`, `--owner name`, `--force` (only after confirming overwrites are acceptable).

Then replace placeholder feature entries with the project's real first features.

### Audit an existing harness

```bash
node ${CLAUDE_SKILL_DIR}/scripts/validate-harness.mjs --target /path/to/project [--json] [--map FILE]
```

Reports five subsystem scores plus, in team layout, hygiene findings: dangling dependency IDs, duplicate slugs, stale claims, in-progress features with no owner. Treat the lowest score as a candidate bottleneck; confirm with failures, logs, or task outcomes before claiming causality.

Exit codes are three-valued: `0` passed, `1` scored below `--min-score` (default 70) or has blocking findings or nothing scoreable, `2` the command or map is misconfigured. Keep the last one distinct — a broken map is not a weak harness.

A low score on a repo that clearly *has* a harness usually means the tool cannot see it, not that it is bad. Check `unscored` and the `resolution` object before believing the number: an empty directory reports 20/100 because the per-subsystem score floors at 1, so a floor score is a non-answer, not a verdict. Run `/blvck-harness:check`, which discovers the map and scores it, instead of scaffolding a second harness over the top of the first.

### Adapt an existing harness instead of converting it

When a repo's structure is deliberate, write `.harness-map.json` rather than renaming its files:

```json
{
  "version": 1,
  "concepts": {
    "instructions": { "paths": ["docs/agent-guide.md"] },
    "verification": { "paths": ["Makefile"] }
  },
  "vocabulary": { "instructions.startupWorkflow": ["Kickoff"] }
}
```

It is an **overlay**: unmapped concepts keep their built-in names, so map only what differs. `vocabulary` adds the repo's own wording to a check's built-in phrases (keyed by check id, never replacing, never on an existence check) — but a synonym still has to appear in a heading, list, or table, so this loosens *which word* counts, never *whether structure has to carry it*. A declared path that does not exist is a broken assertion: it fails the run and never falls back to a built-in name.

## When to Read References

Load only the reference needed for the user's problem:

- Memory across sessions: [Memory Persistence](references/memory-persistence-pattern.md)
- Reusable workflows as skills: [Skill Runtime](references/skill-runtime-pattern.md)
- Permissions, tools, concurrency: [Tool Registry & Safety](references/tool-registry-pattern.md)
- Context budget and progressive disclosure: [Context Engineering](references/context-engineering-pattern.md)
- Delegation and parallel agents: [Multi-Agent Coordination](references/multi-agent-pattern.md)
- Hooks, startup, long-running work: [Lifecycle & Bootstrap](references/lifecycle-bootstrap-pattern.md)
- Reading a repo you did not scaffold; writing `.harness-map.json`: [Role Classification](references/role-classification.md)
- Migrating an existing setup (convert or adapt): [Migration](references/migration.md)
- The setup rounds for mode, visibility, stages, personas, skills, delivery: [Workflow Setup](references/workflow-setup.md)
- Comment, naming, and reference rules for agent-written code: [Code Style](references/code-style.md)
- Settling requirements before a dynamic run: [Built-in Grilling Style](references/grilling-default.md)
- Non-obvious failure modes: [Gotchas](references/gotchas.md)

## Design Rules

- Keep the root instruction file short: routing and invariants, not a full manual.
- Put project facts in project docs, not in the skill.
- Make verification commands explicit and runnable.
- Require evidence before marking a feature done.
- One active feature per owner; in team layout, claim before work and never edit another owner's in-progress feature directory.
- Prefer append/update state files over relying on chat history; in team layout, prefer new files over edits to shared ones.
- Never hide destructive behavior in scripts; overwrites require explicit user approval.

## Deliverable Checklist

For a usable minimal harness, leave the target project with:

- [ ] `CLAUDE.md` or `AGENTS.md`
- [ ] State: `feature_list.json` + `progress.md` (solo) or `features/<id>/status.json` + `progress/` (team)
- [ ] `init.sh`
- [ ] Solo only: `session-handoff.md` for multi-session work
- [ ] Documented verification evidence or next action

Read this as the five concepts, not five filenames: an adapted repo satisfies the same list under its own names plus a `.harness-map.json` that says which file is which. What it must never satisfy is a map declaring files that are not there.

If you cannot create files, provide exact file contents and commands instead.
