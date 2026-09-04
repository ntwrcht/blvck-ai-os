# CLAUDE.md

Plugin marketplace repo ("blvck-ai-os"): two Claude Code plugins (`blvck-harness`, `blvck-pm`). This repo runs its own solo harness — the files you edit here are templates and prompts other repos will scaffold from, so precision matters more than speed.

## Startup Workflow

Before writing code:

1. **Confirm working directory** with `pwd`
2. **Read this file** completely
3. **Run `./init.sh`** to verify environment is healthy
4. **Read `feature_list.json`** to see current feature state
5. **Review recent commits** with `git log --oneline -5`

If baseline verification is failing, repair that first before adding new scope.

## Working Rules

- **One feature at a time**: Pick exactly one unfinished feature from `feature_list.json`
- **Verification required**: Don't claim done without running `./init.sh`
- **Update artifacts**: Before ending session, update `progress.md` and `feature_list.json`
- **Stay in scope**: Don't modify files unrelated to the current feature
- **Leave clean state**: Next session must be able to run `./init.sh` immediately
- **Template discipline**: `{{PLACEHOLDER}}` tokens are machine-filled by scripts/commands; `[bracketed]` text is human-filled. Never break that convention — `create-harness.mjs` and `/blvck-pm:setup` depend on it
- **Both layouts stay in sync**: a change to harness scoring or templates must keep BOTH the solo and team scaffold paths passing in `init.sh`'s round-trip test

## Required Artifacts

- `feature_list.json` — Feature state tracker (source of truth)
- `progress.md` — Session continuity log
- `init.sh` — Standard startup and verification path

## Definition of Done

A feature is done only when ALL of the following are true:

- [ ] Target behavior is implemented
- [ ] Required verification actually ran (`./init.sh` passes: syntax, JSON, scaffold/validate round-trip)
- [ ] Evidence recorded in `feature_list.json` or `progress.md`
- [ ] Repository remains restartable from standard startup path

## End of Session

Before ending a session:

1. Update `progress.md` with current state
2. Update `feature_list.json` with new feature status
3. Record any unresolved risks or blockers
4. Commit with descriptive message once work is in safe state
5. Leave repo clean enough for next session to run `./init.sh` immediately

## Release Checklist

`version` is pinned in each `plugin.json`, so it is the cache key Claude Code compares
against. **Pushing commits without bumping it ships nothing** — installed users stay on the
old copy and `/plugin update` tells them they are already current. Never let user-visible
changes land without a bump.

For each plugin with user-visible changes:

1. Bump `version` in `plugins/<plugin>/.claude-plugin/plugin.json` (semver: MAJOR breaking,
   MINOR features, PATCH fixes)
2. Add the matching entry to `plugins/<plugin>/CHANGELOG.md`
3. Never add `version` to the marketplace entry — `plugin.json` is the single source of truth
   (both are legal and `plugin.json` wins, but two copies drift silently)
4. Run `./init.sh` and `claude plugin validate . --strict`
5. Commit, then `cd plugins/<plugin> && claude plugin tag --push`
6. Verify a real install picks up the new version: `claude plugin details <plugin>`

## Verification Commands

```bash
# Full verification (recommended)
./init.sh
```

Required checks:
- `node --check` on all six scripts (three harness, three PM vault)
- JSON parse of every manifest, template, tracker, and fixture in the repo
- Solo + team scaffold and validate round-trip in a temp directory (validate must exit 0 for solo, and team must report the seeded hygiene findings)
- Adapted layout: the foreign-shaped fixture scores (exit 0), and team layout re-expressed as a user map scores identically to native team — if those two ever diverge, the map has stopped being a generalization of the layouts and has become a parallel implementation
- Adapted layout cannot be gamed: a declared path that does not exist fails, flat prose does not pass the structured gate, an invalid or out-of-tree map exits 2, and an empty directory reports `unscored` rather than its floor score
- PM vault round-trip: a fresh `create-vault.mjs` scaffold must exit **1** (a scaffold is not a vault — an untouched skeleton passing is how the identity-file defect hid for two releases), and `tests/fixtures/pm-vault` must score 100/100 and exit 0
- PM vault cannot be gamed: a declared path that is gone fails, a `measured` outcome with no result blocks regardless of score, an unknown or out-of-tree config path exits 2, and an empty directory reports `unscored`

Three layouts, one check set. A change to scoring must keep solo, team, **and** adapted passing — and `scoreHarness` must stay layout-agnostic. If you find yourself adding a branch on layout inside it, that is the signal the change belongs in an adapter instead.

**The two plugins' scripts stay separate.** `harness-utils.mjs` scores repos, `vault-utils.mjs` scores vaults, and they share no code on purpose: they track different units with different terminal states (verification passes vs. the number moved). A helper that looks worth sharing is usually a sign one of them is drifting toward the other's job.

**Keep judgment out of `vault-utils.mjs`.** It answers only what a machine can answer — "does the PRD name a success metric", never "is it a good one". A check that needs an opinion belongs in `validate.md`, which is a prompt. Adding one here makes the score non-reproducible, which removes the reason the script exists.

Never commit a `.harness-map.json` at this repo's root — discovery is root-only, so it would flip blvck-ai-os's own validate to `adapted`. Fixtures live under `tests/`.

## Escalation

- **Upstream drift**: if walkinglabs/learn-harness-engineering changes conventions, adapt deliberately — this repo's team layout is an intentional extension, not a fork to sync
- **Scope ambiguity**: re-read `feature_list.json` for definition of done
