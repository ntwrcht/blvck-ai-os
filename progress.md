# Session Progress Log

## Current State

**Last Updated:** 2026-07-15
**Active Feature:** none — clean state at v1.1.0

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

### What's In Progress

- [ ] Nothing — clean state at v1.1.0

### What's Next

1. Exercise the two paths feat-005 did **not** cover: `/blvck-pm:setup` in a real vault, `/blvck-harness:migrate` on a repo with an existing setup, and `/blvck-pm:migrate` on legacy PM notes
2. Cut the GitHub release for v1.1.0 and confirm a fresh install from the GitHub source (not a local directory source) resolves references without a prompt

## Blockers / Risks

- [ ] **blvck-pm's install path is still unverified.** feat-005 exercised blvck-harness end to end; blvck-pm got the same `allowed-tools` fix by analogy but no template load has been observed running
- [ ] **Verified only against a `directory`-source install.** A GitHub-source install resolves `${CLAUDE_PLUGIN_ROOT}` to `~/.claude/plugins/cache/...` instead of the repo. The fix should hold (both are outside the workspace) but has not been observed there
- [ ] `claude plugin validate --strict` passes frontmatter that breaks a skill at runtime — CI catches schema errors only. Any skill change needs a real invocation; `claude -p` cannot test `allowed-tools`
- [ ] Gating's token saving is unconfirmed — `plugin details` still counts setup/migrate in always-on
- [ ] pm-os validate/score are prompt-driven (no script backing) — grading consistency depends on the rule tables in the command files

## Decisions Made

- **Team feature IDs embed their allocator** (date `feat-YYYYMMDD-slug` or Jira key): removes the shared counter two branches would race on; post-merge renames (which break dependencies) can't happen
  - Alternatives considered: allocate numbers on main (ceremony), author-prefixed counters (non-global ordering)
- **Agents ship as archetypes, scaffolded per project** into `.claude/agents/`, not locked in the plugin — matches the template-instance pattern used everywhere else
- **Scoring engine reuses upstream's 25 checks for both layouts** via a normalization layer (team files synthesized into solo shapes) + separate team hygiene findings — keeps upstream's proven scoring untouched
- **Plugin skills must declare `allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)`** (feat-008): a plugin's own `references/` and `templates/` live outside the user's workspace, so without it every load is permission-denied and progressive disclosure silently never fires. Scoped to the plugin directory rather than bare `Read` (which official plugins use) so the grant can't reach the user's project or credentials
  - Discovered from a user bug report, not from validation — `claude plugin validate --strict` passes either way
- **`version` lives only in `plugin.json`, never in the marketplace entry** (feat-008): both are legal and `plugin.json` wins, but two copies drift silently. CI fails if an entry pins one
- **Migration is generic and staged, not shape-matching** (feat-006): scan classifies files by role (instructions / trackers / verification / logs), known origins are hints only; three read-only phases (scan, reflect-back confirm, plan) precede the first write; removal = move to `.migration-backup/<date>/` after per-group confirmation, never delete. Prompt-driven commands, no scripts — so init.sh coverage is unchanged and real validation lands in feat-005

## Files Modified This Session

- Initial build: entire repository (see `git log`)
- feat-006 session (2026-07-05): `plugins/blvck-harness/commands/migrate.md` + `plugins/blvck-pm/commands/migrate.md` (new), README command tables/usage, pm-os `SKILL.md` no-vault line, trackers
- feat-007 session (2026-07-05): plugin dirs renamed via git mv; every name reference updated (manifests, command prefixes, README, CLAUDE.md, templates, trackers); repo folder → `~/blvck-ai-os`

## Evidence of Completion

- [x] `./init.sh` passes: script syntax, all-JSON parse, solo round-trip (exit 0), team clean round-trip (exit 0), team seeded-findings rejection (exit 1 as required)
- [x] Manual scratch tests: solo 100/100; team 100/100 with session entry; all three hygiene finding types fired on seeded fixtures

## Notes for Next Session

Run feat-005 before editing anything else — real installation is the only untested layer. If `/blvck-pm:setup` interview feels long, batching per section (as specced in the command) is the intended mitigation; resist splitting into more commands.
