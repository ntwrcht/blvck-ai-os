# blvck-ai-os

Two Claude Code plugins, one marketplace. Install once, use in any repo.

| Plugin | What it is | Commands |
|--------|-----------|----------|
| **blvck-harness** | Engineering harness for AI coding agents: five subsystems (instructions, state, verification, scope, session lifecycle), solo and team layouts | `/blvck-harness:setup` · `/blvck-harness:migrate` · `/blvck-harness:validate` · `/blvck-harness:score` |
| **blvck-pm** | Product-manager operating system: PM vault, 19 routed workflows (PRD, RICE, JTBD, GTM, tracking plans, weekly updates), per-product agent teams | `/blvck-pm:setup` · `/blvck-pm:migrate` · `/blvck-pm:validate` · `/blvck-pm:score` |

## Install (once)

```
/plugin marketplace add ~/blvck-ai-os
/plugin install blvck-harness@blvck-ai-os
/plugin install blvck-pm@blvck-ai-os
```

Enable per project or globally when prompted. After pushing this repo to GitHub, teammates use the same commands with the repo URL.

## Use (in any repo)

**Engineering repo** → `/blvck-harness:setup`. Answers solo (one committer) or team (parallel humans: one directory per feature under `features/`, date- or Jira-keyed IDs — no running-number merge conflicts). Daily ritual lives in the scaffolded `CLAUDE.md`: startup workflow → one feature → verify → end of session. Health checks: `/blvck-harness:validate` (pass/fail + claim hygiene), `/blvck-harness:score` (five-subsystem grades). Repo already has a hand-rolled setup, an upstream harness, or a solo layout that needs to go team? → `/blvck-harness:migrate` converts it in place: reads what exists, shows a source → destination plan, and moves nothing to backup without your per-group confirmation.

**PM vault or product repo** → `/blvck-pm:setup`. Interview builds `ABOUT-ME/`, `PROJECTS/<product>/`, `TEMPLATES/`, `CLAUDE-OUTPUTS/`, `pm-os.config.md`, and your agent team in `.claude/agents/` (archetypes: customer-voice, competitive-intel, business-analyst, board-executive, prototype-builder, blind-reviewer, research-analyst). Then just ask — "draft a PRD for X", "prioritize these", "review this PRD" — the pm-os skill routes and writes date-stamped artifacts to `CLAUDE-OUTPUTS/`. Integrations (Jira, Confluence, Drive, BigQuery) are per-project switches; nothing blocks when a tool is absent. Existing PM notes in another structure (course vault, Obsidian folder, `docs/` tree)? → `/blvck-pm:migrate` carries your content into the vault under the same plan-first, confirm-before-removal rules.

The two connect: a PRD from blvck-pm feeds the prototype-builder agent, which builds inside a `/blvck-harness:setup` repo.

## Update

Edit here (or `git pull` after pushing to a remote); reinstall/update via `/plugin`. Verify changes with `./init.sh` — it syntax-checks the scripts, JSON-validates every manifest and template, and runs a full solo + team scaffold/validate round-trip in a temp directory.

## Layout

```
.claude-plugin/marketplace.json     # this marketplace
plugins/blvck-harness/              # commands/ + skills/harness-engineering/{SKILL.md,templates,scripts,references}
plugins/blvck-pm/                   # commands/ + skills/pm-os/{SKILL.md,templates,references}
CLAUDE.md feature_list.json progress.md init.sh    # this repo runs its own harness
```

## Provenance

`plugins/blvck-harness` internals are adapted from [`harness-creator`](https://github.com/walkinglabs/learn-harness-engineering) (MIT — see LICENSE). `blvck-pm` vault patterns follow the ai-native-pm-os course structure, rebuilt as operational tooling. Course/learning content from both sources is intentionally excluded.
