# Session Progress Log

## Current State

**Last Updated:** 2026-07-15
**Active Feature:** none — clean state, v1.2.0 ready to tag

**Released:** v1.1.0 on 2026-07-15 — tags `blvck-harness--v1.1.0`, `blvck-pm--v1.1.0`, `v1.1.0`; CI green; GitHub license detects MIT; repo topics set. https://github.com/ntwrcht/blvck-ai-os/releases/tag/v1.1.0

## Status

### What's Done

- [x] feat-001 Harness plugin — vendored + adapted, dual layout, 3 commands
- [x] feat-002 PM OS plugin — skill, 21 templates, 7 agent archetypes, 5 references, 3 commands
- [x] feat-003 Marketplace packaging — manifest, README, LICENSE + attribution
- [x] feat-004 Repo self-harness — CLAUDE.md, trackers, init.sh verification pipeline
- [x] feat-005 Install smoke test — real install + scaffold verified; surfaced the permission-wall bug
- [x] feat-006 Migration commands — /blvck-harness:migrate + /blvck-pm:migrate, generic staged flow (scan → reflect-back confirm → plan → additive apply → per-group backup → verify)
- [x] feat-007 Rebrand to blvck — marketplace blvck-ai-os, plugins blvck-harness/blvck-pm; all manifests, prefixes, docs, and the repo folder renamed
- [x] feat-008 Official-grade packaging — permission wall fixed, write commands gated, semver + CHANGELOGs + release checklist, LICENSE/NOTICE split, CI, community files
- [x] feat-009 Flexible harness scoring — `.harness-map.json`, adapted layouts, check ids, vocabulary synonyms, `unscored`, exit code 2; init.sh 3 → 5 steps
- [x] feat-010 Flexible pm vault scoring — `## Paths` honored, role fallback, migrate adapt fork; fixed the setup/validate identity drift

### What's In Progress

- [ ] Nothing — clean state at v1.2.0 (unreleased: bumped + CHANGELOGed, not yet tagged)

### What's Next

1. Exercise the paths still uncovered: `/blvck-pm:setup` in a real vault, `/blvck-pm:migrate` on legacy PM notes, and `/blvck-harness:migrate` typed as an actual slash command (its adapt *rules* were exercised in feat-009; the command dispatch was not)
2. Confirm a fresh install from the **GitHub source** (not the local directory source used so far) resolves references without a prompt — `${CLAUDE_PLUGIN_ROOT}` points at `~/.claude/plugins/cache/…` there
3. Consider guidance against reusing one phrase as the synonym for two different checks — see feat-009's evidence; defensible today but unaddressed by the prompt

## Blockers / Risks

- [ ] **blvck-pm's flexible scoring is unverifiable by CI.** It is prompt-only — no script, no exit code, no init.sh coverage. feat-009's "discover once, then score deterministically" does not transfer: blvck-pm's path resolution is best-effort model behavior every run. This is inherent (there is no pm scorer to make deterministic), not an oversight. A real pm validator script is a separate project, not a rider
- [ ] **blvck-pm's install path is still unverified.** feat-005 exercised blvck-harness end to end; blvck-pm got the `allowed-tools` fix by analogy and no template load has been observed running. feat-010 did not change this
- [ ] **Verified only against a `directory`-source install.** A GitHub-source install resolves `${CLAUDE_PLUGIN_ROOT}` to `~/.claude/plugins/cache/...` instead of the repo. The fix should hold (both are outside the workspace) but has not been observed there
- [ ] **Adapted layouts get scoring but no hygiene findings.** `teamFindings` calls `listFeatureDirs(root)` and reads disk itself rather than going through the resolution seam, and it only runs when `layout === 'team'`. Deliberate for 1.2.0 — the fix (`teamFindings(features[])`) is nearly free now that `shape` normalization exists, but it puts init.sh's seeded-fixture invariant at risk for no user-facing gain. `validate.md` is told to say so rather than imply claim hygiene is clean
- [ ] **The `Math.max(1, …)` floor still stands.** An empty directory scores 20/100, and the first check in each subsystem is worth 0 points while checks 2–5 are worth 4 each — the scale is non-linear at the bottom. `unscored: true` now carries the honest signal, but removing the floor flips pass → fail on unchanged input for a repo sitting at exactly 18 points, which is a MAJOR. Deferred to 2.0.0 rather than smuggled into a MINOR
- [ ] `claude plugin validate --strict` passes frontmatter that breaks a skill at runtime — CI catches schema errors only. Any skill change needs a real invocation; `claude -p` cannot test `allowed-tools`
- [ ] Gating's token saving is unconfirmed — `plugin details` still counts setup/migrate in always-on
- [ ] Minor: `actions/checkout@v4` / `setup-node@v4` warn about deprecated Node 20 (warning only, CI green)

## Decisions Made

- **Team feature IDs embed their allocator** (date `feat-YYYYMMDD-slug` or Jira key): removes the shared counter two branches would race on; post-merge renames (which break dependencies) can't happen
  - Alternatives considered: allocate numbers on main (ceremony), author-prefixed counters (non-global ordering)
- **Agents ship as archetypes, scaffolded per project** into `.claude/agents/`, not locked in the plugin — matches the template-instance pattern used everywhere else
- **Scoring engine reuses upstream's 25 checks for both layouts** via a normalization layer (team files synthesized into solo shapes) + separate team hygiene findings — keeps upstream's proven scoring untouched
- **Plugin skills must declare `allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)`** (feat-008): a plugin's own `references/` and `templates/` live outside the user's workspace, so without it every load is permission-denied and progressive disclosure silently never fires. Scoped to the plugin directory rather than bare `Read` (which official plugins use) so the grant can't reach the user's project or credentials
  - Discovered from a user bug report, not from validation — `claude plugin validate --strict` passes either way
- **`version` lives only in `plugin.json`, never in the marketplace entry** (feat-008): both are legal and `plugin.json` wins, but two copies drift silently. CI fails if an entry pins one
- **Migration is generic and staged, not shape-matching** (feat-006): scan classifies files by role (instructions / trackers / verification / logs), known origins are hints only; three read-only phases (scan, reflect-back confirm, plan) precede the first write; removal = move to `.migration-backup/<date>/` after per-group confirmation, never delete
- **The user map is a third adapter, not a new subsystem** (feat-009): `loadHarnessFilesAuto` already mapped team layout onto canonical virtual files so one check set could grade two structures. User styling slots into that same seam. The test of the abstraction is that `stateRoutingNeedles` — the one place layout leaked into the scorer — **dissolved** into a per-concept property rather than growing a third branch, and `scoreHarness` stopped knowing what a layout is. Proven by re-expressing team layout as a user map: identical score
  - Alternatives rejected: script-side heuristics (silent guesses, no way to correct them), prompt-only judgment (non-deterministic score, untestable by init.sh), widening the alias lists (same predict-the-name wall, one step further out)
- **Discovery forks inside `migrate`, no fifth command** (feat-009): migrate already scans, classifies by role, reflects back, writes, and is gated. Adapting is the same scan with the opposite conclusion — leave the files and teach the scorer to read them. A separate `adapt` command would have broken README's "exactly four commands" for one prompt's worth of shared work
- **A declared path is an assertion, and a broken one fails the run** (feat-009): mapErrors block independently of the score. Proven necessary — the missing-tracker fixture still scored 84/100, comfortably over the 70 bar. Silent fallback to a built-in name would make a typo read as a passing harness, which is the exact failure this feature exists to remove
- **Vocabulary changes which word counts, never whether structure carries it** (feat-009): synonyms add to built-in needles and still route through `structuredText`. Verified adversarially — flat prose containing every right word scores instructions 1/5. Flexibility must not decay into "sprinkle the right keywords"
- **`unscored` is a boolean; `overall` stays a number** (feat-009): `overall: null` would widen a documented field and rely on `null < 70` coercing to `0 < 70` — the kind of accident someone "simplifies" into a bug two years later
- **Only `lifecycle.startupScript` ↔ `verification.entrypointExists` are linked** (feat-009): they are the identical predicate. `scope.completionGate`'s needles are a strict *subset* of `instructions.definitionOfDone`'s, not a duplicate — a doc saying only "done only when" passes one and fails the other. Linking them would have made vocabulary wrongly transitive
- **`pm-os.config.md` and `.harness-map.json` are the only fixed names** (feat-010): every config system needs one fixed point — the file that says where everything else is cannot itself be relocatable. Documented in both plugins so nobody "fixes" it later

## Files Modified This Session

- Initial build: entire repository (see `git log`)
- feat-006 session (2026-07-05): `plugins/blvck-harness/commands/migrate.md` + `plugins/blvck-pm/commands/migrate.md` (new), README command tables/usage, pm-os `SKILL.md` no-vault line, trackers
- feat-007 session (2026-07-05): plugin dirs renamed via git mv; every name reference updated (manifests, command prefixes, README, CLAUDE.md, templates, trackers); repo folder → `~/blvck-ai-os`
- feat-009/010 session (2026-07-15): `lib/harness-utils.mjs` (map layer, three adapters, check ids, vocabulary), `validate-harness.mjs` (rewritten: `--map`, exit 2, try/catch), `init.sh` (3 → 5 steps), `tests/fixtures/foreign-harness/` (new), `references/role-classification.md` (new), both plugins' `migrate`/`validate`/`score`/`SKILL.md`, `pm-config.md`, `setup.md`, CHANGELOGs, both `plugin.json` → 1.2.0

## Evidence of Completion

- [x] `./init.sh` passes all 5 steps: script syntax, all-JSON parse (now including the fixture), solo + team round-trip (the 3 original invariants, untouched), adapted scoring + team-as-map equivalence, and the four anti-gaming assertions
- [x] Pre/post refactor diff on 4 fixtures: byte-identical scores, proving steps 1–2 of feat-009 were a pure refactor
- [x] `tests/fixtures/foreign-harness`: 100/100 exit 0 with nothing canonical at its root; 6 points earned by declared synonyms
- [x] All 3 manifests pass `claude plugin validate --strict`

## Notes for Next Session

The adapt fork's **rules** were exercised before release (feat-009 evidence): an untuned foreign repo went 20/100 unscored → 100/100 adapted by following `migrate.md` literally, and the three honesty properties re-proved on that repo rather than only on the tuned fixture. What remains unexercised is the **command dispatch** — `/blvck-harness:migrate` has never been typed, because it is `disable-model-invocation` and cannot be self-invoked. Low risk, but not zero, and not the same claim.

**blvck-pm's whole path** remains model-behavior only — no script, no exit code, no CI.

Do not ship an example `.harness-map.json` at this repo's root — map discovery is root-only, so it would flip blvck-ai-os's own validate to `adapted`. The fixture lives under `tests/` for exactly this reason.
