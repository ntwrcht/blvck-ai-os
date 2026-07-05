---
description: Score this repo's harness across the five subsystems
---
Score the harness in the current repository.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and parse it.
2. Present: overall score /100, a five-row table (instructions, state, verification, scope, lifecycle) with score /5 and the failed checks named, and — in team layout — the hygiene findings (dangling dependencies, duplicate slugs, stale claims).
3. Name the weakest subsystem and give the top 2–3 improvements as exact file edits, highest impact first.
4. Treat the lowest score as a candidate bottleneck, not proof — confirm against recent failures (broken sessions, rework, premature "done" claims) before claiming causality. If every subsystem is at 5/5, say the structure is sound and the next gain is behavioral: whether sessions actually follow the ritual.
