# Session Progress Log

## Current State

**Last Updated:** 2026-07-05
**Active Feature:** feat-005 - Install smoke test (next up)

## Status

### What's Done

- [x] feat-001 Harness plugin — vendored + adapted, dual layout, 3 commands
- [x] feat-002 PM OS plugin — skill, 21 templates, 7 agent archetypes, 5 references, 3 commands
- [x] feat-003 Marketplace packaging — manifest, README, LICENSE + attribution
- [x] feat-004 Repo self-harness — CLAUDE.md, trackers, init.sh verification pipeline
- [x] feat-006 Migration commands — /blvck-harness:migrate + /blvck-pm:migrate, generic staged flow (scan → reflect-back confirm → plan → additive apply → per-group backup → verify)
- [x] feat-007 Rebrand to blvck — marketplace blvck-ai-os, plugins blvck-harness/blvck-pm; all manifests, prefixes, docs, and the repo folder renamed

### What's In Progress

- [ ] Nothing — clean state after initial build

### What's Next

1. feat-005: install both plugins (`/plugin marketplace add ~/blvck-ai-os`), run `/blvck-harness:setup` in a real code repo and `/blvck-pm:setup` in a vault; fix friction found — also exercise `/blvck-harness:migrate` on a repo with an existing setup and `/blvck-pm:migrate` on legacy PM notes
2. ~~Optional: push to GitHub~~ — done 2026-07-05: private repo at https://github.com/ntwrcht/blvck-ai-os (flip to public or invite teammates before they can install from the URL)

## Blockers / Risks

- [ ] Plugin-layer behavior (commands, skill routing, ${CLAUDE_PLUGIN_ROOT} resolution) is verified only by inspection until feat-005 runs inside Claude Code
- [ ] pm-os validate/score are prompt-driven (no script backing) — grading consistency depends on the rule tables in the command files

## Decisions Made

- **Team feature IDs embed their allocator** (date `feat-YYYYMMDD-slug` or Jira key): removes the shared counter two branches would race on; post-merge renames (which break dependencies) can't happen
  - Alternatives considered: allocate numbers on main (ceremony), author-prefixed counters (non-global ordering)
- **Agents ship as archetypes, scaffolded per project** into `.claude/agents/`, not locked in the plugin — matches the template-instance pattern used everywhere else
- **Scoring engine reuses upstream's 25 checks for both layouts** via a normalization layer (team files synthesized into solo shapes) + separate team hygiene findings — keeps upstream's proven scoring untouched
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
