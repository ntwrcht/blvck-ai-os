---
description: Score this repo's harness across the five subsystems
---
Score the harness in the current repository.

1. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and parse it. Exit 2 means the command or `.harness-map.json` is misconfigured and nothing was scored — report that, not a number.
2. If `unscored` is true, do not lead with the score. No harness artifacts were found, and the number shown is a floor artifact of the scale, not a measurement — an empty directory reports 20/100. Say which of the two this is: a repo with no harness, or a harness this tool cannot see. Offer `/blvck-harness:migrate` to map an existing one in place.
3. Present: overall score /100, a five-row table (instructions, state, verification, scope, lifecycle) with score /5 and the failed checks named, and — in team layout — the hygiene findings (dangling dependencies, duplicate slugs, stale claims).
4. When `layout` is `adapted`, show the **Resolution** table from `resolution` alongside the score: concept, canonical name, and the real file behind it. An adapted score is only worth reading if the reader can see what was read. Name the base layout and the map path too (`adapted (base: solo, map: .harness-map.json)`).
5. Disclose synonym matches. A check with `matchedVia: "synonym"` was earned by the repo's own wording rather than the built-in phrase — worth stating, so the user can judge whether their word really carries that meaning. It is not a lesser pass: a mapped harness can legitimately reach 100/100.
6. Name the weakest subsystem and give the top 2–3 improvements as exact file edits, highest impact first. Cite check ids (`lifecycle.restartMarkers`) — they are stable. Where a failed check has `sharedWith`, one edit clears both, which usually makes it the highest-impact fix available.
7. Treat the lowest score as a candidate bottleneck, not proof — confirm against recent failures (broken sessions, rework, premature "done" claims) before claiming causality. If every subsystem is at 5/5, say the structure is sound and the next gain is behavioral: whether sessions actually follow the ritual.
