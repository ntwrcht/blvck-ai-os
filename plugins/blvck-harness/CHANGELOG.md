# Changelog

All notable changes to `blvck-harness` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [2.0.0] - 2026-10-09

### Changed — breaking

- **Four commands become three, one per moment.** Typing an old command now does nothing, so
  here is where each one went:

  | Removed | Use instead |
  |---|---|
  | `/blvck-harness:migrate` | `/blvck-harness:setup` — it detects an existing setup and runs the same convert/adapt migration |
  | `/blvck-harness:validate` | `/blvck-harness:check` |
  | `/blvck-harness:score` | `/blvck-harness:check` — one report: verdict, subsystem scores, findings, fix list |

- **The `harness-engineering` skill is hidden from the `/` menu** (`user-invocable: false`). It
  still loads on its own when a harness problem comes up, and it points to the commands, so
  nobody has to guess whether to type the skill or `setup`.

### Added

- **Dynamic workflow mode**, opt-in per repo. `/blvck-harness:run` settles unclear requirements
  with you in the main session, then a background workflow plans the feature, audits the plan,
  splits it into tasks that own separate files, builds them in parallel git worktrees, tests and
  reviews each task as soon as it finishes (sending rejected tasks back, 2 times by default,
  3 at most), merges everything into one feature branch, and opens a PR (GitHub) or MR (GitLab)
  against the branch you chose. It then removes its worktrees and merged task branches.
  Classic one-agent mode stays the default, and its scaffold is byte-identical to 1.2.0.
- **Your choices, not a fixed shape.** `.claude/harness-workflow.json` holds the stages you turned
  on, the agent ceiling for each one, the persona that runs it, and any number of skills per
  stage. Recommended, lean, and custom presets. A config the tool cannot trust exits 2 and never
  falls back to defaults.
- **Stage personas**: `product-owner` plans, `tech-lead` audits, breaks down, reviews, and
  delivers, `developer` implements, `qa-engineer` tests. Each has its own tool budget.
  `setup` tailors them with agent-smith when it is installed, or copies the four defaults.
- **Built-in grilling style** for users without the `grilling` skill.
- **Decide versus ask.** The planner only stops a run for questions you would notice or object to
  (scope, visible behavior, data, security, anything hard to reverse). It decides conventional
  edge cases itself and lists them as **assumptions** in the PR and in the final report, so you
  can object before merging. A live test run without this bar asked two rounds of trivia and
  never built anything.
- **Code style round** in `setup`, for both modes. It reads your codebase's conventions, then
  asks about comments (why, not what), references in code (no ticket ids or PR numbers — those
  belong in commits), naming, and comment language. The answers become a `## Code Style` section
  every agent reads. In dynamic mode, reviewers treat a violation as must-fix. Not scored.
- **Local-only harness**: `--visibility local` lists the harness, personas, `.claude/skills/`,
  and `.agents/` in `.git/info/exclude`. Nothing is pushed, and no `.gitignore` entry gives it away.
- **`check` scores concepts, whatever your files are called.** When the script cannot find a
  harness under the default names, `check` works out which files play each role, scores that
  reading with the same 25 checks from a scratch map, shows which file it read for each concept,
  and offers to save the map.
- Adapted harnesses work in dynamic mode too: the workflow writes evidence to the files your
  map names.

### Fixed

- **The solo handoff named the wrong instruction file.** `session-handoff.md` always said
  "Read `AGENTS.md`", even when setup wrote `CLAUDE.md` (the default), so the next session's
  first step pointed at a file that did not exist. It now names the file setup actually wrote.
  Found when a live workflow run's delivery agent had to correct it by hand.

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
