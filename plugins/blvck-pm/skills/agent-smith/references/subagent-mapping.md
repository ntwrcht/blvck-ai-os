# Deriving the Runnable Subagent

The canonical `agents/<name>.md` is written for a human reviewer. The runnable `.claude/agents/<name>.md` is written for a delegating model with a limited attention budget. This file maps one to the other.

Derive, never hand-edit. A fix belongs in the canonical file, followed by a regeneration.

## Frontmatter Mapping

| Canonical | Runnable | Transform |
|---|---|---|
| `name: Migration Archaeologist` | `name: migration-archaeologist` | lowercase, hyphenate, matches the filename |
| `description` | `description` | rewritten for delegation — see below |
| `tools` | `tools` | carried over verbatim, comma-separated |
| `model` | `model` | carried over: `opus`, `sonnet`, `haiku`, or `inherit` |
| `color`, `emoji`, `vibe`, `services` | — | dropped; presentation and provisioning metadata the runtime does not read |

Omitting `tools` grants the full tool set — which is why the budget is never left out. Omitting `model` inherits the caller's model, which is a valid choice only when it is a choice.

```yaml
---
name: migration-archaeologist
description: Reconstructs why a schema, API, or module reached its current shape and reports which parts are load-bearing. Use before altering or deleting a column, endpoint, or legacy code path, when it is unclear what still depends on it. Returns a verdict table citing file:line or commit SHA per element, and never returns a "safe to remove" verdict without a stated search scope.
tools: Read, Grep, Glob, Bash
model: opus
---
```

## The Description Drives Delegation

The description is the only part of the agent a delegating model reads before choosing. Three sentences, in this order:

1. **What it does** — the capability, with the output named.
2. **When to delegate** — the concrete situation, in the words a caller would use.
3. **What comes back** — the shape of the returned work, so the caller knows whether it is the thing they need.

The third sentence is the one usually missing, and its absence is what produces an agent that gets picked and then disappoints. A caller who cannot predict the return shape delegates once and stops.

Write the boundary into the description when two agents sit close together: "Reports on dependencies; does not perform the migration." That single clause resolves more routing ambiguity than any amount of body text, because it is read at decision time.

## Body Compression

The runnable body is a system prompt. Persona sections compress hard; operations sections carry over nearly intact.

| Canonical section | In the runnable file |
|---|---|
| Identity & Memory | One short paragraph — role, the stance it argues from, what it reads at the start of a run |
| Communication Style | Two or three lines, kept only where they change output shape |
| Critical Rules | Verbatim — these are the constraints that make the output correct |
| What You Don't Do | Verbatim — boundaries are load-bearing at runtime |
| Core Mission | Verbatim |
| Technical Deliverables | Keep one worked example; drop the rest |
| Workflow Process | Verbatim |
| Success Metrics | Kept as a self-check the agent runs before returning |
| Advanced Capabilities | Keep the techniques that fire often; drop the rare ones |

Emoji headings are decoration in the canonical file and noise in the runnable one. Plain `##` headings there.

Target roughly 60–120 lines. Past that, the agent's remit is usually two agents wearing one name.

## Keeping the Two in Sync

Open the derived file with a line naming its source, so the next reader edits the right file:

```markdown
<!-- Derived from agents/migration-archaeologist.md — edit that file, then regenerate. -->
```

Before shipping a change, confirm three things match across the pair: the tool list, the model, and the boundary section. Those are the three that cause a live agent to behave in a way its canonical file denies.
