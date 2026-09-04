---
description: Reconcile existing PM material (any structure) with the PM OS vault — relocate it, or declare it where it stands
argument-hint: [relocate|adapt]
disable-model-invocation: true
---
Reconcile existing PM material in the current directory with the pm-os vault. Sources are generic — a course-built vault, an Obsidian folder, a `docs/` tree, loose markdown. Templates live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`. This is a staged, gated operation: three read-only phases before the first write, and nothing is ever deleted.

There are two ways this ends, and the scan is identical for both. **Relocate** moves material into the default vault folders. **Adapt** leaves it where it is and records the real locations in `pm-os.config.md`'s `## Paths`, which every workflow reads the vault through. Do not assume relocate — a structure the user built on purpose is not a mess to be tidied.

**Phase 1 — Scan (read-only).** Inventory the directory and classify files by the role they play, never by matching a known layout:

- *Identity material*: who the PM is, principles, writing rules, current priorities → `ABOUT-ME/`
- *Product context*: product one-liners, personas, metrics, stakeholder notes, terminology → `PROJECTS/<product>/`
- *Vision material*: long-horizon direction, strategy narratives, "where we're going" decks and notes → `PROJECTS/<product>/vision.md`. Distinguish from a roadmap (dated commitments) and from a pitch deck (written for investors, not for the team) — both get classified elsewhere
- *Doc templates*: reusable PRD/spec/update skeletons → `TEMPLATES/`
- *Produced artifacts*: finished PRDs, research, analyses, updates → `CLAUDE-OUTPUTS/<type>/`
- *Config and integration notes* → `pm-os.config.md`; *agent definitions* → `.claude/agents/`
- *Learning content* (course lessons, exercises, worked examples): its own group — flag it for the user, never silently drop it

Known origins (ai-native-pm-os course vaults) are classification hints, not requirements. A file that fits no role is **unknown** — ask the user what it is; never guess.

**Phase 2 — Reflect back, then fork (read-only).** Present your reading: what the existing setup is, what each group contains, and what maps where. Existing filled content counts as pre-answered interview sections — plan to interview only for what is genuinely missing, exactly like `/blvck-pm:setup`'s gap mode. The user corrects or confirms this reading before you plan anything.

Then ask how it should end, with a recommendation:

- **Relocate** — move their material into the default vault folders. Right when the current structure is accidental (loose files, a half-organised `docs/` tree).
- **Adapt** — leave the folders where they are and record them in `pm-os.config.md`'s `## Paths`, which every workflow, `/blvck-pm:validate` and `/blvck-pm:score` read the vault through. Right when the structure is deliberate — an Obsidian vault with its own conventions, a numbered folder scheme, anything other tooling or teammates depend on. Only `pm-os.config.md` has a fixed name; everything else is free to stay put.

Either way the content work is identical — the fork is only whether files move.

**Phase 3 — Plan (read-only).** One table, `source → action → destination`, action ∈ **keep** / **convert** / **relocate** / **declare** / **superseded**, followed by the net-new files that come from templates. Rules:

- Existing content is **converted into** the vault — the user's own words, metrics, and stakeholder framing carry over. Never replace with placeholder template text what their material already states.
- Relocated artifacts keep their filenames; the `[artifact-type]-[description]-[YYYY-MM-DD].md` convention applies to new artifacts only.
- **declare** = the file stays exactly where it is and `## Paths` points at it. Nothing to back up, nothing to clean up. Verify each declared path exists before writing it — a path declared but absent is worse than one never declared, because it reads as configured.
- The identity file's destination is `CLAUDE.md` inside whatever the identity dir is (`ABOUT-ME/CLAUDE.md` by default), never `about-me.md` — that is the name every workflow and agent reads. If the source is already called `about-me.md`, this is a rename, not a copy.

Get explicit approval of the plan before touching anything.

**Phase 4 — Apply (additive only).** Checkpoint first: commit the current state if this is a git repo (`git commit` — the phase 3 approval covers this commit); otherwise copy every file the plan touches into `.migration-backup/<YYYY-MM-DD>/`. Then execute the plan's create, convert, and relocate steps, write `pm-os.config.md` with a `## Paths` section recording where every role actually lives, and run the gap interview for missing sections. Remove nothing in this phase.

**Phase 5 — Clean up (per-group confirm).** Only for material the plan marked **superseded** — nothing that was merely *declared* is touched. Group superseded originals by role ("these 4 identity notes are superseded by the identity dir") and ask about each group separately — learning content is always its own question. Default is **keep**. On confirmation, **move** the group to `.migration-backup/<YYYY-MM-DD>/` preserving relative paths — never `rm`. Add `.migration-backup/` to `.gitignore` if a git repo, and tell the user the backup directory is theirs to delete once confident.

**Phase 6 — Verify.** Run the `/blvck-pm:validate` checks on the migrated vault; repair failures the migration caused before finishing. Confirm every path declared in `## Paths` resolves to something that exists. Close with the vault tree, the migration summary (created / converted / declared in place / moved to backup and where), and the daily entry points: just ask for any artifact, `/blvck-pm:validate` monthly, `/blvck-pm:score` when the vault feels messy.
