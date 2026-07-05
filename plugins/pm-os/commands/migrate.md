---
description: Convert existing PM material (any structure) into the PM OS vault — plan shown first, removal only with per-group confirmation
---
Migrate existing PM material in the current directory into the pm-os vault structure. Sources are generic — a course-built vault, an Obsidian folder, a `docs/` tree, loose markdown. Templates live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`. This is a staged, gated operation: three read-only phases before the first write, and nothing is ever deleted.

**Phase 1 — Scan (read-only).** Inventory the directory and classify files by the role they play, never by matching a known layout:

- *Identity material*: who the PM is, principles, writing rules, current priorities → `ABOUT-ME/`
- *Product context*: product one-liners, personas, metrics, stakeholder notes, terminology → `PROJECTS/<product>/`
- *Doc templates*: reusable PRD/spec/update skeletons → `TEMPLATES/`
- *Produced artifacts*: finished PRDs, research, analyses, updates → `CLAUDE-OUTPUTS/<type>/`
- *Config and integration notes* → `pm-os.config.md`; *agent definitions* → `.claude/agents/`
- *Learning content* (course lessons, exercises, worked examples): its own group — flag it for the user, never silently drop it

Known origins (ai-native-pm-os course vaults) are classification hints, not requirements. A file that fits no role is **unknown** — ask the user what it is; never guess.

**Phase 2 — Reflect back and confirm (read-only).** Present your reading: what the existing setup is, what each group contains, and what maps where. Existing filled content counts as pre-answered interview sections — plan to interview only for what is genuinely missing, exactly like `/pm-os:setup`'s gap mode. The user corrects or confirms this reading before you plan anything.

**Phase 3 — Plan (read-only).** One table, `source → action → destination`, action ∈ **keep** / **convert** / **relocate** / **superseded**, followed by the net-new files that come from templates. Rules:

- Existing content is **converted into** the vault — the user's own words, metrics, and stakeholder framing carry over. Never replace with placeholder template text what their material already states.
- Relocated artifacts keep their filenames; the `[artifact-type]-[description]-[YYYY-MM-DD].md` convention applies to new artifacts only.

Get explicit approval of the plan before touching anything.

**Phase 4 — Apply (additive only).** Checkpoint first: commit the current state if this is a git repo (`git commit` — the phase 3 approval covers this commit); otherwise copy every file the plan touches into `.migration-backup/<YYYY-MM-DD>/`. Then execute the plan's create, convert, and relocate steps, and run the gap interview for missing sections. Remove nothing in this phase.

**Phase 5 — Clean up (per-group confirm).** Group superseded originals by role ("these 4 identity notes are superseded by `ABOUT-ME/`") and ask about each group separately — learning content is always its own question. Default is **keep**. On confirmation, **move** the group to `.migration-backup/<YYYY-MM-DD>/` preserving relative paths — never `rm`. Add `.migration-backup/` to `.gitignore` if a git repo, and tell the user the backup directory is theirs to delete once confident.

**Phase 6 — Verify.** Run the `/pm-os:validate` checks on the migrated vault; repair failures the migration caused before finishing. Close with the vault tree, the migration summary (created / converted / moved to backup and where), and the daily entry points: just ask for any artifact, `/pm-os:validate` monthly, `/pm-os:score` when the vault feels messy.
