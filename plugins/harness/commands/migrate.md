---
description: Convert an existing setup (any shape) to this harness structure — plan shown first, removal only with per-group confirmation
---
Migrate the current repository's existing agent-workflow setup into the harness-engineering skill's conventions. Sources are generic — an upstream harness-creator repo, a hand-rolled CLAUDE.md with ad-hoc trackers, or this plugin's solo layout moving to team. This is a staged, gated operation: three read-only phases before the first write, and nothing is ever deleted.

**Phase 1 — Scan (read-only).** Inventory the repo and classify files by the role they play, never by matching a known layout:

- *Instruction files*: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, contributor guides that address an agent
- *Feature/task trackers*: `feature_list.json`, `features/*/status.json`, `TODO.md`, `roadmap.md`, task tables inside docs
- *Verification entrypoints*: `init.sh`, Makefile targets, package scripts the team treats as "am I healthy"
- *Session/progress logs*: `progress.md`, `session-handoff.md`, changelogs used as handoffs

Known origins (upstream learn-harness-engineering, this plugin's own solo layout) are classification hints, not requirements. A file that fits no role is **unknown** — ask the user what it is; never guess.

**Phase 2 — Reflect back and confirm (read-only).** Present your reading of the existing setup: what it is, what each classified file does, and what maps where. Recommend a target layout the same way `/harness:setup` does (`git shortlog -sn --no-merges | head -5`; one committer → solo, several → team). The user corrects or confirms this reading before you plan anything.

**Phase 3 — Plan (read-only).** One table, `source → action → destination`, action ∈ **keep** / **convert** / **relocate** / **superseded**, followed by the net-new files that come from templates. Rules:

- Existing content is **converted into** the new structure — real feature names, real progress history, real verification commands. Never replace with placeholder template text what the repo already states.
- Solo → team: explode `feature_list.json` into `features/<id>/` directories, re-key IDs to `feat-YYYYMMDD-slug` (or `--jira-key` form), split `progress.md` history into per-feature `progress/` entries, and record each old ID in its converted `status.json` so existing references stay traceable.

Get explicit approval of the plan before touching anything.

**Phase 4 — Apply (additive only).** Checkpoint first: commit the current state (`git commit` — the phase 3 approval covers this commit); outside git, copy every file the plan touches into `.migration-backup/<YYYY-MM-DD>/`. Then execute the plan's create and convert steps — scaffold template files with `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/create-harness.mjs --target . --layout <solo|team>` where the plan calls for them, then merge the converted content in. Remove nothing in this phase.

**Phase 5 — Clean up (per-group confirm).** Group superseded originals by role ("these 3 tracker files are superseded by `feature_list.json`") and ask about each group separately. Default is **keep**. On confirmation, **move** the group to `.migration-backup/<YYYY-MM-DD>/` preserving relative paths — never `rm`. Add `.migration-backup/` to `.gitignore`, and tell the user the backup directory is theirs to delete once confident.

**Phase 6 — Verify.** Run `./init.sh`; if converted verification commands fail, repair them before finishing. Run the `/harness:validate` logic and report. Close with the migration summary: what was created, what was converted, what moved to backup and where.
