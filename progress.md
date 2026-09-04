# Session Progress Log

## Current State

**Last Updated:** 2026-09-04
**Active Feature:** none — feat-011…014 planned, not started. v1.2.0 still bumped-but-untagged.

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

- [ ] Nothing in flight. feat-011 through feat-014 are planned (see below), none started.

### What's Next — blvck-pm direction change (2026-09-04)

A grilling session redirected blvck-pm from "PM at a company writes documents" to **"a solo
entrepreneur or a small team runs their product using their own process, with an agent team
standing in for the colleagues they do not have."** The product thesis is the one blvck-harness
already proved, applied to the whole plugin: **give the concepts and the options, let the user
configure them.** Six things become user-configurable — paths, framework per process step,
source of truth, decision-flag threshold, completeness checklists, agent roster.

Release sequence (feature_list.json carries the detail):

| Version | Feature | Content |
|---|---|---|
| 1.3 | feat-011 | `vision.md` + completeness checklists + output language setting |
| 1.4 | feat-012 | `roadmap.json` + `create-vault.mjs` + `validate-vault.mjs` + fixture + CI |
| 1.5 | feat-013 | Interviewed agent roster + agent-smith bundled + lead-engineer archetype |
| 2.0.0 | feat-014 | config → JSON, escalation rule rewritten |

Still open from before this session, unchanged:

1. Exercise the paths still uncovered: `/blvck-pm:setup` in a real vault, `/blvck-pm:migrate` on legacy PM notes, and `/blvck-harness:migrate` typed as an actual slash command (its adapt *rules* were exercised in feat-009; the command dispatch was not)
2. Confirm a fresh install from the **GitHub source** (not the local directory source used so far) resolves references without a prompt — `${CLAUDE_PLUGIN_ROOT}` points at `~/.claude/plugins/cache/…` there
3. Consider guidance against reusing one phrase as the synonym for two different checks — see feat-009's evidence; defensible today but unaddressed by the prompt
4. **v1.2.0 is bumped and CHANGELOGed but never tagged** — per the Release Checklist, that means installed users are still on 1.1.0 and have received none of feat-009/010

## Blockers / Risks

- [ ] **feat-011…014 is a 3–4× scope increase on a plugin with 0 lines of code.** Mitigated by shipping in four releases rather than one branch, not eliminated. This is the top risk of the new direction
- [ ] **The config-format change is breaking but the scripts need it one release early.** feat-012 needs machine-readable config; `pm-os.config.md` is documented as the one fixed name, so replacing it is a MAJOR. Resolution: feat-012 adds `pm-os.config.json` *alongside* (additive), feat-014 retires the `.md`. Do not shortcut this into a MINOR
- [ ] **feat-014's escalation rewrite contradicts a rule shipped today.** `references/agent-design.md` rule 4 ("escalate judgment, don't exercise it") is the opposite of agents closing gaps in a plan, and is meaningless for a solo founder with nobody to escalate to. It must change in a MAJOR, not quietly
- [ ] **agent-smith cannot ship yet.** `.agents/` and `skills-lock.json` are untracked — it exists on one machine only. feat-013 is blocked until that is committed or vendored
- [ ] **Serving both solo founders and employed PMs doubles the surface to maintain.** Good defaults and a ~5-minute interview reduce the felt cost to the user; they do not reduce the cost to the maintainer
- [ ] **blvck-pm's flexible scoring is unverifiable by CI.** It is prompt-only — no script, no exit code, no init.sh coverage. feat-009's "discover once, then score deterministically" does not transfer: blvck-pm's path resolution is best-effort model behavior every run. This is inherent (there is no pm scorer to make deterministic), not an oversight. A real pm validator script is a separate project, not a rider
- [ ] **blvck-pm's install path is still unverified.** feat-005 exercised blvck-harness end to end; blvck-pm got the `allowed-tools` fix by analogy and no template load has been observed running. feat-010 did not change this
- [ ] **Verified only against a `directory`-source install.** A GitHub-source install resolves `${CLAUDE_PLUGIN_ROOT}` to `~/.claude/plugins/cache/...` instead of the repo. The fix should hold (both are outside the workspace) but has not been observed there
- [ ] **Adapted layouts get scoring but no hygiene findings.** `teamFindings` calls `listFeatureDirs(root)` and reads disk itself rather than going through the resolution seam, and it only runs when `layout === 'team'`. Deliberate for 1.2.0 — the fix (`teamFindings(features[])`) is nearly free now that `shape` normalization exists, but it puts init.sh's seeded-fixture invariant at risk for no user-facing gain. `validate.md` is told to say so rather than imply claim hygiene is clean
- [ ] **The `Math.max(1, …)` floor still stands.** An empty directory scores 20/100, and the first check in each subsystem is worth 0 points while checks 2–5 are worth 4 each — the scale is non-linear at the bottom. `unscored: true` now carries the honest signal, but removing the floor flips pass → fail on unchanged input for a repo sitting at exactly 18 points, which is a MAJOR. Deferred to 2.0.0 rather than smuggled into a MINOR
- [ ] `claude plugin validate --strict` passes frontmatter that breaks a skill at runtime — CI catches schema errors only. Any skill change needs a real invocation; `claude -p` cannot test `allowed-tools`
- [ ] Gating's token saving is unconfirmed — `plugin details` still counts setup/migrate in always-on
- [ ] Minor: `actions/checkout@v4` / `setup-node@v4` warn about deprecated Node 20 (warning only, CI green)

## Decisions Made

### blvck-pm direction (2026-09-04, grilling session)

- **Serve both solo entrepreneurs and employed PMs, one plugin, no modes** — the shared core is a living plan with state; the segments differ in defaults, not in structure. Rejected: reframing to solo-only (loses the PM segment), two explicit modes (doubles every template and rule)
- **The plugin supplies concepts and options; the user configures the process** — the same move as "score the concept, not the folder names", applied to frameworks, storage, thresholds, checklists, and the agent roster. Ships opinionated defaults so a user with no opinion still gets RICE
- **blvck-pm gets its own tracker, `roadmap.json`, never `feature_list.json`** — the plugins track different units. harness tracks code work that is done when verification passes; blvck-pm tracks business outcomes that are done when the metric moves. The lifecycle therefore ends at **measured**, not shipped. A link field points a roadmap item at harness feature IDs so they compose without duplicating
- **Agents decide and flag, rather than escalate** — closing the gaps a real team would close is the point, and a solo founder has nobody to escalate to. The flag makes AI assumptions distinguishable from the user's own, and the flagged list becomes the agenda for the real meeting. "Minor" is defined by three testable conditions (touches cost/timeline/scope, hard to reverse, low confidence), user-tunable — not by feel
- **The completeness gate warns, it does not block** — "do the tests pass" is not arguable; "is this plan complete" always is. A tool that blocks here gets abandoned. The override is recorded with a date instead
- **The scaffolder script comes before the validator** — nothing can be tested until a vault can be produced without a human. This is the direct cause of the `about-me.md` bug surviving two releases, and it is why `progress.md` still carries "blvck-pm's install path is unverified"
- **`setup` handles upgrades; no fifth command** — it already has a gap-filling mode, and README promises exactly four commands. Condition: it must **report** what it filled. Silent self-repair is what hid the identity-file defect
- **All 19 workflows stay, and every output links to a roadmap item** — the link is what turns 19 disconnected document generators into one system, which is what "manage" means. Pruning now would be guessing at what nobody uses
- **Vision gets its own file; "plan" reuses PRD/spec/one-pager** — vision changes yearly, product context changes constantly, so co-locating them means vision gets edited away by accident. Adding a `plan.md` on top of three existing plan-layer documents would just make users guess which one to write
- **Writing rules split into structural and lexical** — conclusion-first and numbers-over-adjectives hold in any language; the banned-word list does not. English ships first, other languages on request

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
- feat-011…014 planning session (2026-09-04): `feature_list.json` (4 new entries, no code yet), `progress.md` (direction, decisions, risks). No plugin files touched — this session decided, it did not build
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
