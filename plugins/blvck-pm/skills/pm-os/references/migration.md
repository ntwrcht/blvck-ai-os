# Migration — PM Material in Another Shape

`/blvck-pm:setup` follows this when the directory already holds PM material in a structure other than a blvck-pm vault. Templates live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`.

Sources are generic — a course-built vault, an Obsidian folder, a `docs/` tree, loose markdown. This is a staged, gated operation: three read-only phases before the first write, and nothing is ever deleted.

There are two ways this ends, and the scan is identical for both. **Relocate** moves material into the default vault folders. **Adapt** leaves it where it is and records the real locations in `pm-os.config.json`'s `paths`, which every workflow reads the vault through. Do not assume relocate — a structure the user built on purpose is not a mess to be tidied.

**Phase 1 — Scan (read-only).** Inventory the directory and classify files by the role they play, never by matching a known layout:

- *Identity material*: who the PM is, principles, writing rules, current priorities → `ABOUT-ME/`
- *Product context*: product one-liners, personas, metrics, stakeholder notes, terminology → `PROJECTS/<product>/`
- *Vision material*: long-horizon direction, strategy narratives, "where we're going" decks and notes → `PROJECTS/<product>/vision.md`. Distinguish from a roadmap (dated commitments) and from a pitch deck (written for investors, not for the team) — both get classified elsewhere
- *Doc templates*: reusable PRD/spec/update skeletons → `TEMPLATES/`
- *Produced artifacts*: finished PRDs, research, analyses, updates → `CLAUDE-OUTPUTS/<type>/`
- *Config and integration notes* → `pm-os.config.json`; *agent definitions* → `.claude/agents/`
- *Learning content* (course lessons, exercises, worked examples): its own group — flag it for the user, never silently drop it
- *Codebases*: any folder with its own `.git` inside the directory, plus repo paths the existing instructions and agent files name (`~/work/…`, `repositories/…`). Inventory them; **never read a repo's files as PM material** — a repo's `README.md` or `CLAUDE.md` is not product context

Known origins (ai-native-pm-os course vaults) are classification hints, not requirements. A file that fits no role is **unknown** — ask the user what it is; never guess.

**Phase 2 — Reflect back, then fork (read-only).** Present your reading: what the existing setup is, what each group contains, and what maps where. Existing filled content counts as pre-answered interview sections — plan to interview only for what is genuinely missing, exactly like setup's gap mode. The user corrects or confirms this reading before you plan anything.

Then ask how it should end, with a recommendation:

- **Relocate** — move their material into the default vault folders. Right when the current structure is accidental (loose files, a half-organised `docs/` tree).
- **Adapt** — leave the folders where they are and record them in `pm-os.config.json`'s `paths`, which every workflow and `/blvck-pm:check` read the vault through. Right when the structure is deliberate — an Obsidian vault with its own conventions, a numbered folder scheme, anything other tooling or teammates depend on. Only `pm-os.config.json` has a fixed name; everything else is free to stay put.

Either way the content work is identical — the fork is only whether files move.

**Phase 3 — Plan (read-only).** One table, `source → action → destination`, action ∈ **keep** / **convert** / **relocate** / **declare** / **superseded**, followed by the net-new files that come from templates. Rules:

- Existing content is **converted into** the vault — the user's own words, metrics, and stakeholder framing carry over. Never replace with placeholder template text what their material already states.
- Relocated artifacts keep their filenames; the `[artifact-type]-[description]-[YYYY-MM-DD].md` convention applies to new artifacts only.
- **declare** = the file stays exactly where it is and `paths` points at it. Nothing to back up, nothing to clean up. Verify each declared path exists before writing it — a path declared but absent is worse than one never declared, because it reads as configured.
- The identity file's destination is `CLAUDE.md` inside whatever the identity dir is (`ABOUT-ME/CLAUDE.md` by default), never `about-me.md` — that is the name every workflow and agent reads. If the source is already called `about-me.md`, this is a rename, not a copy.

Get explicit approval of the plan before touching anything.

**Phase 4 — Apply (additive only).** Checkpoint first: commit the current state if this is a git repo (`git commit` — the phase 3 approval covers this commit); otherwise copy every file the plan touches into `.migration-backup/<YYYY-MM-DD>/`. Then execute the plan's create, convert, and relocate steps, write `pm-os.config.json` with a `paths` object recording where every role actually lives, and run the gap interview for missing sections. Remove nothing in this phase.

**Phase 5 — Clean up (per-group confirm).** Only for material the plan marked **superseded** — nothing that was merely *declared* is touched. Group superseded originals by role ("these 4 identity notes are superseded by the identity dir") and ask about each group separately — learning content is always its own question. Default is **keep**. On confirmation, **move** the group to `.migration-backup/<YYYY-MM-DD>/` preserving relative paths — never `rm`. Add `.migration-backup/` to `.gitignore` if a git repo, and tell the user the backup directory is theirs to delete once confident.

**Codebases — a helper, never a gate.** Show how the vault's code maps onto the registry (`references/config.md`) and recommend, but change nothing without a yes; every step is skippable, and a vault that declines all of it stays valid with the same score. Per repo:

- **Already inside** (e.g. `repositories/<repo>`) → **register** it where it stands. No move is needed: a codebase path may point anywhere.
- **Elsewhere on disk** → offer the default, a move into `CODE/<repo>/`, or registering it where it stands. Name what a move costs before asking: Claude Code keys past sessions and memory by path, so they stop following the repo; anything pointing at the old path (editor workspaces, aliases, scripts) breaks; and a repo another vault also uses cannot move into this one. A move on the same disk is a plain rename. Across disks it is copy-then-delete: ask first, and delete the original only once `git status` is clean in the copy and `HEAD` matches.
- **Root `CLAUDE.md` over a nested repo** → say it loads in every coding session there, and quote any rule in it that would fight coding work (a "repositories are read-only" rule is the common one). Offer to scope that rule to vault-root sessions; do not move or edit the file unasked. If the user keeps the inheritance on purpose, record it with `"rootClaudeMd": "accepted"` on each affected entry, so the validator stops warning about a decision already made.
- **Agents that read code** → this is a required line in the Phase 2 reflect-back, not a footnote to the agent count: name each agent file that mentions a repo path, `git`, or a codebase by name, quote the line, and suggest pointing it at the registry and the freshness rule. **Never rewrite an agent** — the roster is the user's, usually hand-built.

Ask each repo's `scope` (`mine` / `dependency`) and `branch`; do not infer them. Repos are moved by the user's yes, not by the plan's approval as a whole.

**Phase 6 — Verify.** Run `validate-vault.mjs` on the migrated vault; repair failures the migration caused before finishing, and report each repair. Confirm every path declared in `paths` resolves to something that exists. Then return to setup's next round (writing style, then mode) — the migration summary (created / converted / declared in place / moved to backup and where) goes in setup's final report.
