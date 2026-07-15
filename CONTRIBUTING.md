# Contributing

Thanks for helping improve blvck-ai-os. This repo is a Claude Code plugin marketplace, and
it runs its own harness — the same discipline the plugins teach.

## Before you start

```bash
git clone git@github.com:ntwrcht/blvck-ai-os.git
cd blvck-ai-os
./init.sh          # must pass before you change anything
```

If `./init.sh` fails on a clean checkout, that's a bug — please open an issue rather than
working around it.

## What `./init.sh` checks

1. `node --check` on the three harness scripts
2. JSON parse of every manifest, template, tracker, and fixture
3. Solo **and** team scaffold/validate round-trip in a temp directory, including the
   negative path: a seeded broken feature must make the validator exit 1
4. Adapted layout scores `tests/fixtures/foreign-harness` (a harness using none of the
   canonical names), and team layout re-expressed as a user map scores identically to
   native team
5. Adapted layout can't be gamed: a declared-but-missing path fails, flat prose doesn't
   pass the structured gate, invalid and out-of-tree maps exit 2, and an empty directory
   reports `unscored` instead of its floor score

Step 5 is the one to be most careful with. The value of flexible scoring is entirely in what
it still refuses to pass — if you loosen a check, make sure you have not turned "the concept
is present" into "the keyword is present."

## House rules

- **One feature at a time.** Pick a single unfinished entry from `feature_list.json`.
- **All three layouts stay green.** A change to harness scoring or templates must keep solo,
  team, *and* adapted passing in `init.sh`. They are not interchangeable.
- **`scoreHarness` stays layout-agnostic.** It reads canonical virtual files plus the routing
  needles the loader resolved, and does not know whether the repo is solo, team, or mapped.
  Needing a branch on layout inside it means the change belongs in an adapter
  (`loadSoloHarnessFiles` / `loadTeamHarnessFiles` / `loadMappedHarnessFiles`) instead.
- **Check ids are permanent.** `state.trackerSchema` and friends appear in `--json`, in fix
  lists, and in users' `.harness-map.json` vocabulary keys. Never rename, reorder, or reuse
  one for different logic. Adding a check is fine; changing what an id means is not.
- **Never add a `.harness-map.json` at the repo root.** Map discovery is root-only, so it
  would flip this repo's own validate to `adapted`. Fixtures belong under `tests/`.
- **Placeholder convention.** `{{PLACEHOLDER}}` tokens are machine-filled by scripts and
  commands; `[bracketed]` text is human-filled. `create-harness.mjs` and `/blvck-pm:setup`
  depend on this distinction — don't blur it.
- **Nothing is deleted.** `migrate` commands move files to a backup with per-group
  confirmation. Keep it that way.
- **Evidence before done.** Record what you actually ran in `feature_list.json` or
  `progress.md`. "Should work" is not evidence.

## Testing plugin changes

Schema validation is necessary but **not sufficient** — `claude plugin validate --strict`
passes frontmatter that can break a skill at runtime. Always invoke the thing you changed:

```bash
claude plugin validate . --strict
claude plugin validate ./plugins/blvck-harness --strict
```

Then install locally and run it for real:

```bash
/plugin marketplace add ~/blvck-ai-os
/plugin install blvck-harness@blvck-ai-os
/reload-plugins
```

Note: `claude -p` (headless) **cannot** test a skill that declares `allowed-tools` — the
Skill tool errors regardless of permission mode. Test those interactively.

## Releasing

`version` is pinned in each `plugin.json`, which makes it the cache key. Pushing commits
without bumping it ships nothing to installed users. See the Release Checklist in
`CLAUDE.md`.

## Licensing

Contributions are accepted under the MIT License (see `LICENSE`). If you adapt third-party
material, add it to `NOTICE`.
