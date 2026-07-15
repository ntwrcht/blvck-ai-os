---
name: harness-engineering
description: >-
  Build, audit, and improve harnesses that make AI coding agents reliable: CLAUDE.md/AGENTS.md
  instruction files, feature/state tracking (solo feature_list.json or team features/<id>/
  directories), verification gates, scope boundaries, session handoff, memory persistence,
  context budgets, and multi-agent coordination. Use whenever a coding agent is unreliable
  across sessions — forgets context, drifts out of scope, claims "done" before tests pass,
  or starts each session inconsistently — or when creating or assessing CLAUDE.md, AGENTS.md,
  feature_list.json, features/*/status.json, init.sh, or progress files. Reach for it even
  if the user never says the word "harness."
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
license: MIT
---

# Harness Engineering

Use this skill to make a repository easier for coding agents to start, stay in scope, verify work, and resume across sessions. Keep the harness small enough that agents actually follow it.

Not for model selection, prompt tuning in isolation, chat UI design, or general app architecture.

Adapted from `harness-creator` in [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering) (MIT), with an added team layout for repos where multiple humans work in parallel branches.

## Core Model

Every useful coding-agent harness has five subsystems:

| Subsystem | Solo artifact | Team artifact | Purpose |
|---|---|---|---|
| Instructions | `CLAUDE.md` / `AGENTS.md` | same, plus Team Rules | Startup path, working rules, definition of done |
| State | `feature_list.json`, `progress.md` | `features/<id>/status.json`, `features/<id>/progress/` | Current feature, status, evidence, next step |
| Verification | `init.sh` or documented commands | same | Checks the agent must run before claiming done |
| Scope | Feature dependencies and done criteria | same, plus claim (`owner` + `branch`) | Prevents overreach and half-finished work |
| Lifecycle | `session-handoff.md`, end-of-session routine | handoff section inside each session's progress file | Makes the next session restartable |

## Choosing a Layout

- **Solo** (default): one human/agent stream. Single shared state files — simplest, matches the upstream reference.
- **Team**: multiple humans on parallel branches. State files follow one-writer-per-file: each feature is a directory, each session is a new progress file. Merge conflicts then only happen when two people genuinely collided on the same feature — a signal, not noise.
- Team feature IDs never use bare running numbers (two branches would both mint `feat-005`, and the post-merge rename breaks every `dependencies` reference). The allocator is embedded in the ID: `feat-20260705-approval-routing` (date) or `feat-KEY-123-approval-routing` (ticket key). Task IDs inside a claimed feature directory (`t01`…) may use running numbers — that namespace has one owner.

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

Options: `--agent-file AGENTS.md`, `--package-manager npm|pnpm|yarn|bun`, `--commands "cmd one,cmd two"`, `--feature-slug first-feature`, `--jira-key KEY-123`, `--owner name`, `--force` (only after confirming overwrites are acceptable).

Then replace placeholder feature entries with the project's real first features.

### Audit an existing harness

```bash
node ${CLAUDE_SKILL_DIR}/scripts/validate-harness.mjs --target /path/to/project [--json]
```

Reports five subsystem scores plus, in team layout, hygiene findings: dangling dependency IDs, duplicate slugs, stale claims, in-progress features with no owner. Treat the lowest score as a candidate bottleneck; confirm with failures, logs, or task outcomes before claiming causality.

## When to Read References

Load only the reference needed for the user's problem:

- Memory across sessions: [Memory Persistence](references/memory-persistence-pattern.md)
- Reusable workflows as skills: [Skill Runtime](references/skill-runtime-pattern.md)
- Permissions, tools, concurrency: [Tool Registry & Safety](references/tool-registry-pattern.md)
- Context budget and progressive disclosure: [Context Engineering](references/context-engineering-pattern.md)
- Delegation and parallel agents: [Multi-Agent Coordination](references/multi-agent-pattern.md)
- Hooks, startup, long-running work: [Lifecycle & Bootstrap](references/lifecycle-bootstrap-pattern.md)
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

If you cannot create files, provide exact file contents and commands instead.
