# Changelog

All notable changes to `blvck-harness` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [2.3.0] - 2026-11-13

### Added

- **`/blvck-harness:run --brief <path>`** starts work from a brief someone already wrote, such as
  a handoff brief from a PM tool. The brief becomes a tracker feature in the repository's own
  layout (solo, team or adapted), with its ticket as the id, and an existing entry is reused
  instead of duplicated. Its acceptance checks become the done criteria and its edge cases
  become settled answers, so grilling asks only what the brief leaves open: a check that is not
  binary, a cited path that no longer matches the code, or a contradiction. When nothing is
  open, the run starts without asking. Repeat `--brief` to run several in dynamic mode.

## [2.2.0] - 2026-11-09

### Changed

- **Tasks run in parallel in practice, not only in principle.** In 30 real runs, 110 tasks fell
  into 87 waves, so a run built almost one task at a time and a retried task held up its whole
  wave. The breakdown now agrees each task's interface up front (`provides`), and every
  implementer sees those interfaces, so a task builds against another's stated interface
  instead of waiting for its code. Each task writes its own tests, documentation tasks depend on
  nothing, and no task is made for harness state files, because Deliver records those.
- **No more waves.** A task starts as soon as the tasks it needs have passed and merged, so a
  retry delays only the tasks built on it. Merges are queued, and tasks that finish together
  merge in one batch. A task whose dependency fails is reported as skipped and blocks the PR/MR
  instead of being built on missing code.
- **The tester works in the implementer's worktree** instead of a new checkout, which skips a
  second dependency install per attempt.
- **The final verification runs alongside the whole-feature review**, and Deliver reuses its
  result instead of running verification a second time. A failed final verification blocks the
  PR/MR.
- `/workflows` now shows the longest dependency chain, and says "Mostly serial" when the
  breakdown leaves few tasks to run at once.

### Added

- **Effort and model per stage** in `.claude/harness-workflow.json` (`stages.<name>.effort`,
  `stages.<name>.model`), both optional. New configs default to plan, breakdown, and review
  `high`; audit, implement, test, and deliver `medium`; clean-up `low` on `haiku`. Creating the
  branch and merging tasks follow clean-up's settings. A config without these keys inherits the
  session, exactly as 2.1.0 did. `setup` asks in a new round.

## [2.1.0] - 2026-11-09

### Added

- **Several features from one `/blvck-harness:run`** in dynamic mode: `/blvck-harness:run feat-a feat-b feat-c`.
  It grills every feature in the main session before anything starts, then launches one
  background feature workflow per feature. Each one keeps its own branch, PR/MR, and result, and
  a feature that needs input or gets blocked does not stop the others.
- **Stacked features.** A picked feature that depends on another picked feature starts after that
  one delivers, on a branch made from the dependency's feature branch. Its PR/MR still targets your
  target branch and says the dependency merges first. If the dependency is blocked, the stacked
  feature is skipped and reported.
- **`batch.maxFeatures`** in `.claude/harness-workflow.json` (1 to 5, default 3) caps how many
  feature workflows run at once, because each one uses its own stage ceilings. It is optional: a
  2.0.0 config without it stays valid and runs with 3. `setup` asks for it in a new round.
- Features in the same batch are named to each other's planners, and Deliver re-reads the shared
  tracker and progress files right before editing them, so parallel runs do not overwrite each
  other's entries.

### Unchanged

- Classic mode still runs one feature per `run`.

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
