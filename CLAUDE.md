# CLAUDE.md

Plugin marketplace repo: two Claude Code plugins (`harness`, `pm-os`). This repo runs its own solo harness — the files you edit here are templates and prompts other repos will scaffold from, so precision matters more than speed.

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
- **Template discipline**: `{{PLACEHOLDER}}` tokens are machine-filled by scripts/commands; `[bracketed]` text is human-filled. Never break that convention — `create-harness.mjs` and `/pm-os:setup` depend on it
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

## Verification Commands

```bash
# Full verification (recommended)
./init.sh
```

Required checks:
- `node --check` on all three harness scripts
- JSON parse of every manifest, template, and tracker in the repo
- Solo + team scaffold and validate round-trip in a temp directory (validate must exit 0 for solo, and team must report the seeded hygiene findings)

## Escalation

- **Upstream drift**: if walkinglabs/learn-harness-engineering changes conventions, adapt deliberately — this repo's team layout is an intentional extension, not a fork to sync
- **Scope ambiguity**: re-read `feature_list.json` for definition of done
