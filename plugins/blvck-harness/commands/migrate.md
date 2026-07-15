---
description: Reconcile an existing setup (any shape) with this harness — convert files to it, or map it where it stands
argument-hint: [convert|adapt]
disable-model-invocation: true
---
Reconcile the current repository's existing agent-workflow setup with the harness-engineering skill. Sources are generic — an upstream harness-creator repo, a hand-rolled CLAUDE.md with ad-hoc trackers, this plugin's solo layout moving to team, or a deliberate structure of the user's own. This is a staged, gated operation: three read-only phases before the first write, and nothing is ever deleted.

There are two ways this ends, and the scan is identical for both. **Convert** moves the user's files into the canonical shape. **Adapt** leaves every file where it is and writes `.harness-map.json` so the same checks score it in place. Do not assume convert — a structure the user built on purpose is not a mistake to be corrected.

**Phase 1 — Scan (read-only).** Inventory the repo and classify files by the role they play, never by matching a known layout. The role vocabulary, the map concept each role corresponds to, and the rules for recording the repo's own wording are in [Role Classification](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/role-classification.md) — read it before classifying.

Known origins are classification hints, not requirements. A file that fits no role is **unknown** — ask the user what it is; never guess. While scanning, note the words the instruction file actually uses for the startup path, definition of done, one-feature rule, and end-of-session routine; those become the map's `vocabulary` if this ends in adapt.

**Phase 2 — Reflect back, then fork (read-only).** Present your reading of the existing setup: what it is, what each classified file does, and which of the five concepts each one plays. The user corrects or confirms this reading before you plan anything.

Then ask the fork, with a recommendation and the reason for it:

- **Convert** — recommend when the current shape is accidental (files that accreted, a half-abandoned tracker) or when the user wants the standard layout. Also recommend it for solo → team, which is a real restructure, not a naming difference.
- **Adapt** — recommend when the structure is deliberate, load-bearing, or referenced by other tooling (CI, scripts, a docs site). Renaming a repo's files to satisfy a scorer is the tail wagging the dog.

If `$ARGUMENTS` names a fork, still present the reading first — but skip the question and say which you are doing.

For **convert**, recommend a target layout the same way `/blvck-harness:setup` does (`git shortlog -sn --no-merges | head -5`; one committer → solo, several → team).

---

## Convert path

**Phase 3a — Plan (read-only).** One table, `source → action → destination`, action ∈ **keep** / **convert** / **relocate** / **superseded**, followed by the net-new files that come from templates. Rules:

- Existing content is **converted into** the new structure — real feature names, real progress history, real verification commands. Never replace with placeholder template text what the repo already states.
- Solo → team: explode `feature_list.json` into `features/<id>/` directories, re-key IDs to `feat-YYYYMMDD-slug` (or `--jira-key` form), split `progress.md` history into per-feature `progress/` entries, and record each old ID in its converted `status.json` so existing references stay traceable.

Get explicit approval of the plan before touching anything.

**Phase 4a — Apply (additive only).** Checkpoint first: commit the current state (`git commit` — the phase 3a approval covers this commit); outside git, copy every file the plan touches into `.migration-backup/<YYYY-MM-DD>/`. Then execute the plan's create and convert steps — scaffold template files with `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/create-harness.mjs --target . --layout <solo|team>` where the plan calls for them, then merge the converted content in. Remove nothing in this phase.

**Phase 5a — Clean up (per-group confirm).** Group superseded originals by role ("these 3 tracker files are superseded by `feature_list.json`") and ask about each group separately. Default is **keep**. On confirmation, **move** the group to `.migration-backup/<YYYY-MM-DD>/` preserving relative paths — never `rm`. Add `.migration-backup/` to `.gitignore`, and tell the user the backup directory is theirs to delete once confident.

---

## Adapt path

**Phase 3b — Propose the map (read-only).** Show `.harness-map.json` in full, as a diff against nothing, and explain each entry in one line: which concept, which real file, why that file plays that role. Rules:

- **Map only what differs.** The map is an overlay: any concept you leave out falls back to the built-in names. A repo whose only oddity is `docs/agent-guide.md` gets a one-entry map, not five.
- **A path you declare is an assertion.** Declaring a file that is not there fails the run — it does not fall back. Verify each path exists before you write it.
- **Record the repo's own wording under `vocabulary`**, keyed by check id. Declare a synonym separately for `instructions.definitionOfDone` and `scope.completionGate` when it applies to both — they are not linked.
- **Never declare vocabulary for an existence check** (`instructions.exists`, `state.trackerExists`, `state.progressExists`, `verification.entrypointExists`, `lifecycle.startupScript`, `lifecycle.handoffExists`). Those take paths, not words, and the validator rejects the map if you try.
- If the tracker's JSON uses its own field names, map them under `featureTracker.shape` (`collection` for the array's key, `fields` for canonical → their name). Only JSON trackers are supported; a YAML or Markdown-table tracker is a **convert** case, not an adapt case — say so rather than writing a map that cannot work.

Get explicit approval of the map before writing it.

**Phase 4b — Write the map.** Write `.harness-map.json` at the repo root. That is the only file this path creates: no file moves, no backup directory, nothing to clean up. Note for the user that the map's own filename is fixed — it is how the validator finds everything else.

---

**Phase 6 — Verify (both paths).** Run `./init.sh` if the repo has one; for a convert, if converted verification commands fail, repair them before finishing. Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json` and report the score.

- Exit 2 means the map itself is wrong — fix it before reporting anything else; the message names the problem.
- Any `mapErrors` mean a declared path is broken. That fails the run on its own, whatever the score says.
- Show before → after. For an adapt, the "before" is usually `unscored` or a floor score, and the delta is the point: nothing about the repo changed except that the scorer can now see it.

Close with the summary: for a convert, what was created, converted, and moved to backup, and where; for an adapt, which concept resolves to which file, and which checks are now earned by the repo's own wording rather than the built-in phrases.
