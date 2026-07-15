# Changelog

All notable changes to `blvck-pm` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

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
