# Changelog

All notable changes to `blvck-harness` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [1.2.0] - 2026-07-15

### Added

- **Adapted layouts — score a harness that keeps its own file names.** A repo whose harness
  lives in `docs/agent-guide.md` and `.harness/features.json` used to load zero files, fail
  every check, and report 20/100: the tool said "no harness" about a harness that existed.
  Declare where the five concepts live in `.harness-map.json` (or `--map FILE`) and the same
  25 checks score it. The report marks the layout `adapted` and names the file behind each
  concept. An adapted harness can reach 100/100 — the concept is what is graded.
- **`vocabulary`** — a map may declare the repo's own wording for a check (`"Kickoff"` for the
  startup section) keyed by check id. Synonyms **add** to the built-in phrases, never replace
  them, and a synonym still has to appear in a heading, list, or table. This loosens *which
  word* earns a point, never *whether structure has to carry it*. Matches are disclosed in the
  report rather than hidden.
- **Stable check ids** (`state.trackerSchema`, `lifecycle.restartMarkers`, …) on every check,
  in the report and in `--json`. Previously the only way to name a check was to string-match
  its English message.
- **`unscored`** — an empty directory reports 20/100 because the per-subsystem score floors at
  1. That floor cannot tell "we found nothing" from "you have nothing", so the flag does, and
  the report says the number is an artifact rather than a measurement.
- `resolution` in the report and `--json`: which real file satisfied each concept, always
  present, mapped or not.
- `references/role-classification.md` — how to read a repo you did not scaffold. One home for
  the role vocabulary that `migrate` and `.harness-map.json` both use, so they cannot drift.
- `sharedWith` on `lifecycle.startupScript`: it and `verification.entrypointExists` are the
  same predicate, so one file clears both. (`scope.completionGate` is *not* linked to
  `instructions.definitionOfDone` — its needle set is a strict subset, not a duplicate.)

### Changed

- **`/blvck-harness:migrate` now forks.** Same scan, two honest outcomes: **convert** moves
  files into the canonical shape, **adapt** leaves them where they are and writes a map. A
  structure built on purpose is not a mistake to be corrected. Still four commands.
- **Exit code 2** for a misconfigured command or map, distinct from 1 (weak harness). CI could
  not tell "your map is broken" from "your repo is failing" when both returned 1. Bad flags
  now report a usage error instead of a stack trace.
- A **declared path that does not exist fails the run**, even when the score clears the bar.
  A declaration is an assertion; a broken one never falls back to a built-in name, because a
  typo that reads as a passing harness is the exact failure this feature exists to remove.
- `scoreHarness` no longer takes a `layout`. Routing needles are a property of the resolution,
  so the one place layout leaked into scoring dissolved rather than growing a third branch.
  (Internal: the only caller is `validate-harness.mjs`.)
- `SKILL.md`'s "`init.sh` **or documented commands**" is finally true in code — `verification`
  can map to a `Makefile` target.

### Security

- Map paths are contained to the target directory, checked with `realpath` rather than
  `resolve` because reads follow symlinks. The map is a repo file naming what the validator
  reads, and `--json` prints it back — without this, a pull request could add a map pointing
  at `~/.ssh` and exfiltrate it through CI.

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
