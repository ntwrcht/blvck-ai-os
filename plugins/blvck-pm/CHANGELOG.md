# Changelog

All notable changes to `blvck-pm` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Because `version` is pinned in `plugin.json`, users only receive changes when it is
bumped here and there. Pushing commits alone ships nothing.

## [1.5.0] - 2026-09-04

The agent team stops being a roster you are handed and becomes one you are interviewed for.

### Added

- **`lead-engineer` archetype.** The roster had no engineering lens at all — seven archetypes and
  not one that reads a plan the way the person who has to build it will. It was also the first
  perspective named when this direction was set. It answers rather than only asking: each gap gets
  the decision a competent engineer would make, marked **Decided** (any engineer would call it the
  same way) or **Flagged** (touches cost, timeline or scope; hard to reverse; or low confidence).
  The flagged items are the agenda for the real conversation.
- **`agent-smith` ships inside the plugin.** A user who installs blvck-pm now gets the agent
  builder too — without it the setup interview produces a roster it cannot build. Vendored from
  `ntwrcht/blvck-skills`; edits here do not flow upstream.
- **Every archetype declares `tools` and `model`.** Previously all seven carried only a name and a
  description, so the cost discipline documented in `agent-design.md` was advice with nothing
  behind it. `research-analyst` runs on haiku — it fans out one worker per source above three
  sources, making it the only place in the roster where a cheaper model shows up on a bill.
  `board-executive` runs on opus: one invocation, entirely judgment. Read-only agents get
  `Read, Grep, Glob` and nothing else; `prototype-builder` alone has write and shell access.
- **`config.agentBudgets`** — a 26th check in `validate-vault.mjs`. A budget nobody verifies is
  advice, so an agent file without `tools` and `model` now fails, and the vault validator says
  which file and which field.

### Changed

- **`/blvck-pm:setup` asks one question instead of recommending a roster:** *"when you are planning
  something, who do you normally have to go ask?"* Nobody can answer "which agents do you want"
  before using the thing. Answers map onto the catalog out loud, and **"nobody, I work alone" is
  the most informative answer in the set** — it means the agents are replacing a team that does not
  exist, so `lead-engineer` and `blind-reviewer` are recommended as the floor with the reason given.
- Archetypes are documented as structures, not a default team. Anything the interview surfaces with
  no archetype is built with `agent-smith` rather than improvised.

### Honest limit

- A tool allowlist cannot express "read this file and no other", so `blind-reviewer`'s independence
  is still carried by its instructions. Denying write access makes it structurally unable to
  contaminate the document under review; it does not make it unable to read a sibling review. The
  budget is an improvement, not the guarantee — and `agent-design.md` now says so rather than
  implying otherwise.

## [1.4.0] - 2026-09-04

blvck-pm gets executable surface. Until now the plugin was entirely prompts: no script, no exit
code, no CI. That is why a defect in `/blvck-pm:setup` survived two releases without a symptom.

### Added

- **`roadmap.json` — one per product, holding business outcomes bound to numbers.** Statuses run
  `idea → validated → planned → building → shipped → measured`, and **`measured` is terminal**:
  an outcome is not finished when the work ships, it is finished when someone checked whether the
  number moved. An item claiming `measured` must carry the result and a verdict (`hit` / `missed`
  / `inconclusive`) or validation fails. That single difference is what makes this a product
  tracker rather than an engineering one — blvck-harness finishes when verification passes.
  Deliberately not named `feature_list.json`: same name, different unit, would imply the two
  plugins are interchangeable. Item ids are `out-YYYYMMDD-slug` so parallel branches never mint
  the same id, and a `harnessFeatures` field links an outcome to the code work implementing it.
- **`scripts/create-vault.mjs`** — scaffolds a vault with no interview. It exists so a vault can
  be *tested*: `/blvck-pm:setup` is a conversation, so until now no vault could be produced
  without a person, and nothing could ever be checked automatically. The interview remains the
  way humans should create a vault.
- **`scripts/validate-vault.mjs`** — 25 mechanical checks across five modules (identity, product,
  plan, roadmap, config), with `--json` and three-valued exit codes: `0` passed, `1` under the bar
  or blocked, `2` the config is invalid or unsafe. Three findings block regardless of score,
  because each is a broken promise rather than a weak vault: a declared path that does not exist,
  an unresolved `{{PLACEHOLDER}}`, and a roadmap error.
- **`pm-os.config.json`** — the machine-readable config, added *alongside* `pm-os.config.md` and
  breaking nothing. The markdown copy is still read as a fallback for older vaults. Retiring it
  is a MAJOR and waits for 2.0.0.
- **`tests/fixtures/pm-vault/`** and two new `init.sh` steps (now 7). The round trip is the real
  test: a fresh scaffold must exit **1**, because a scaffold is not a vault, and the filled
  fixture must score 100/100 and exit 0. Plus four anti-gaming assertions — a declared path that
  is gone, a `measured` outcome with no result, an unknown or out-of-tree config path, and an
  empty directory reporting `unscored`.

### Changed

- `/blvck-pm:validate` and `/blvck-pm:score` now run the script first and report its number and
  exit code verbatim, then do the part it cannot: judge whether the content is any good. The line
  is explicit — "does the PRD name a success metric" is the script's job, "is it a good one" is
  the model's.
- Every workflow that writes a document records that path against the roadmap outcome it serves.
  That link is what turns 20 disconnected document generators into one system.
- `/blvck-pm:setup` scaffolds `roadmap.json` and `pm-os.config.json`, and is the upgrade path for
  vaults built before 1.4.0.

### Fixed

- The freshness check never matched a real `current-focus.md`. It looked for `Updated:` followed
  by a date, but the template bolds the label as `**Updated:**`, so every vault ever built
  reported "carries no Updated line". Found by the fixture on its first run, not by review.

## [1.3.0] - 2026-09-04

First release of the direction change: blvck-pm is aimed at solo entrepreneurs and small
teams as much as at PMs inside a company, and the plugin's job is to supply concepts and
options that the user configures to their own process.

### Added

- **`vision.md` — the layer above the plan.** The vault could describe *what to build next*
  (PRD, spec, one-pager) but had nothing saying *what has to become true*. Vision gets its own
  file rather than a section of product context, because it changes once or twice a year while
  everything around it changes weekly — co-located, it gets edited away by accident. Its "What
  Must Become True" table holds business outcomes bound to numbers, which is where roadmap
  items will come from in 1.4. The `vision` workflow is Socratic before it drafts, and it is
  the one workflow that writes outside the outputs dir.
- **Completeness gates.** Per-document checklists (`references/completeness.md`) that say what
  a document needs before someone else can act on it. **The gate warns; it never blocks** —
  "do the tests pass" is not arguable but "is this plan complete" always is, and a tool that
  refuses to let a founder ship a deliberate experiment is a tool they stop opening. When a
  document ships with items unmet, the override is appended to the document with the date and
  the user's reason. Adjust per vault in `pm-os.config.md`'s `## Completeness` with three
  verbs: `drop`, `add`, `skip`.
- **`## Language`.** Output language is configured, not inferred from whatever language the
  user typed in — an inferred language changes between documents in one vault and makes
  `anti-style.md` unenforceable. English ships as the only bundled banned-word list.

### Changed

- **Writing rules split into structural and lexical.** Conclusion-first, active voice, and
  numbers-over-adjectives hold in any language. A banned-word list does not: applying an
  English list to a Thai PRD produces the illusion of a style check rather than a style check.
  Non-English vaults take their list from `anti-style.md`.
- **`/blvck-pm:setup` now reports every repair it makes.** Its final step has always said "run
  validate and fix anything failing", and that silent self-repair is exactly how the identity
  file shipped under the wrong name for two releases without a symptom. A repair you do not
  report is a defect you have hidden.
- **`/blvck-pm:setup` targets a 5-minute interview.** Every section has a working default; a
  vault the user can try today beats a complete vault they abandoned at question 14. Traction
  numbers a solo founder does not have are recorded as `unmeasured` instead of stalling.
- **`/blvck-pm:setup` is the upgrade path.** A vault built before 1.3.0 gains `vision.md`,
  `## Language`, and `## Completeness` through the existing gap-filling mode, and is told what
  was added. No fifth command — the plugin promises four.
- `/blvck-pm:migrate` classifies *vision material* as its own role, distinguished from a
  roadmap (dated commitments) and a pitch deck (written for investors, not the team).
- `/blvck-pm:validate` and `/blvck-pm:score` check the vision, the new config sections, and
  completeness debt — one override is a decision, the same gap in every document is a process
  problem.

### Known limits

- Still no validator script: everything above is model behaviour, with no exit code and no CI.
  That is what 1.4 (`feat-012`) exists to fix, and the scaffolder lands before the validator
  because nothing can be tested until a vault can be produced without a human.

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
