# Changelog

All notable changes to `blvck-pm` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [1.2.0] - 2026-07-15

### Fixed

- **Every vault `/blvck-pm:setup` scaffolded failed its own validate.** Setup wrote the
  identity file as `ABOUT-ME/about-me.md`, while all eleven other places — `validate`, the
  session ritual, `agent-design.md`, and all seven agent archetypes — read
  `ABOUT-ME/CLAUDE.md`. It went unnoticed because setup's last step says "run the validate
  checks on what you just built; fix anything failing", so the model quietly papered over it
  at runtime, every time. Setup now writes `about-me.md → ABOUT-ME/CLAUDE.md` explicitly.

  **If your vault predates 1.2.0** it has `ABOUT-ME/about-me.md`. `/blvck-pm:validate` now
  reports this as a rename with the one-line fix rather than as missing identity:
  `git mv ABOUT-ME/about-me.md ABOUT-ME/CLAUDE.md`.

### Added

- **`pm-os.config.md`'s `## Paths` is now honoured.** It has always described itself as
  "machine-read by every pm-os workflow", but `validate` and `score` ignored it and checked
  literal folder names — so a vault keeping identity in `00-me/` and outputs in
  `90-artifacts/` scored as a broken vault instead of a different one. `validate`, `score`,
  the session ritual, and the workflow catalog now resolve every role through it: configured
  path → default → classify by role → report unresolved and offer `migrate`.
- `## Paths` covers the full role set. It previously omitted the identity dir entirely and
  hardcoded two of its three entries — which is precisely why the drift above had nowhere to
  be caught. `pm-os.config.md`'s own filename stays fixed: it is how everything else is found.

### Changed

- **`/blvck-pm:migrate` now forks.** Same scan, two outcomes: **relocate** moves material into
  the default folders, **adapt** declares it where it stands. An Obsidian vault with its own
  conventions is not a mess to be tidied. New plan action: **declare**.

### Known limits

- blvck-pm has no validator script, so its adaptation is best-effort model behaviour — unlike
  blvck-harness, where the map is read by code and the whole path is covered by `init.sh`.
  There is no exit code and no CI here. Stated rather than glossed.

## [1.1.0] - 2026-07-15

### Fixed

- Bundled `templates/` and `references/` are now readable without a permission prompt.
  The skill lives outside the user's vault, so every template load was denied — workflows
  fell back to improvising instead of using the bundled template. Added
  `allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)` to the skill.

### Changed

- **Renamed from `pm-os` to `blvck-pm`.** Commands moved from `/pm-os:*` to `/blvck-pm:*`.
- `/blvck-pm:setup` and `/blvck-pm:migrate` are no longer model-invocable
  (`disable-model-invocation: true`). Both write files, so invocation is now user-initiated
  only. `validate` and `score` are read-only and remain available to Claude.

### Added

- `/blvck-pm:migrate` — converts existing PM material of any structure (course vault,
  Obsidian folder, `docs/` tree, loose markdown) into the vault layout. Read-only phases
  and an approved plan precede any write; nothing is deleted.
- Plugin metadata: `$schema`, `displayName`, `homepage`, `repository`.

## [1.0.0] - 2026-07-05

### Added

- Initial release: `pm-os` skill with session ritual, vault rules, and a 19-workflow router.
- PM vault layout: `ABOUT-ME/`, `PROJECTS/`, `TEMPLATES/`, `CLAUDE-OUTPUTS/`.
- 21 document and context templates (PRD, one-pager, PR/FAQ, RICE, metrics tree, JTBD
  interview, research synthesis, competitor teardown, weekly update, launch checklist,
  decision log, GTM brief, tracking plan, funnel analysis, and more).
- 7 agent archetype templates for per-product agent teams.
- `setup`, `validate`, and `score` commands.
