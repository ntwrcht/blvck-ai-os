# Changelog

All notable changes to `blvck-harness` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [1.1.0] - 2026-07-15

### Fixed

- Bundled `references/` are now readable without a permission prompt. The skill lives
  outside the user's workspace, so every reference load was denied and the routing table
  in "When to Read References" silently never fired. Added
  `allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)` to the skill.
- Script invocations in `SKILL.md` used bare relative paths (`node scripts/create-harness.mjs`),
  which resolve against the user's project directory and never existed there. Now
  `${CLAUDE_SKILL_DIR}/scripts/...`.

### Changed

- **Renamed from `harness` to `blvck-harness`.** Commands moved from `/harness:*` to
  `/blvck-harness:*`.
- `/blvck-harness:setup` and `/blvck-harness:migrate` are no longer model-invocable
  (`disable-model-invocation: true`). Both write files, so invocation is now user-initiated
  only. `validate` and `score` are read-only and remain available to Claude.
- `/blvck-harness:setup` accepts a `[solo|team]` argument hint.

### Added

- `/blvck-harness:migrate` — converts an existing setup of any shape into this harness
  structure. Read-only phases and an approved plan precede any write; nothing is deleted.
- Plugin metadata: `$schema`, `displayName`, `homepage`, `repository`.

## [1.0.0] - 2026-07-05

### Added

- Initial release: `harness-engineering` skill covering the five subsystems
  (instructions, state, verification, scope, session lifecycle).
- Solo layout, byte-compatible with the upstream `harness-creator` reference.
- Team layout: `features/<id>/` directories, date/Jira-keyed feature IDs, claim fields,
  and one-writer-per-file state to keep merge conflicts meaningful.
- `setup`, `validate`, and `score` commands.
