<div align="center">

# blvck-ai-os

**A Claude Code plugin marketplace for AI-native work.**

Two plugins, one install: an engineering harness that keeps AI coding agents reliable across sessions, and a product-management operating system that turns your PM context into routed workflows and agent teams.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.0-black.svg)](plugins/blvck-harness/CHANGELOG.md)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-black.svg)](https://claude.com/claude-code)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](#contributing)

</div>

---

## Introduction

AI agents drift. A coding agent forgets project rules between sessions, claims work is done without verifying it, and steps on teammates' branches. A PM's AI assistant rewrites the same context every conversation and produces documents in nobody's voice.

**blvck-ai-os** treats both problems as the same problem: agents need an *operating system* — durable instructions, explicit state, verification rituals, and clear write zones — not longer prompts. It ships that operating system as two [Claude Code](https://claude.com/claude-code) plugins:

- **blvck-harness** gives engineering repos a harness: five subsystems that make agent sessions restartable, verifiable, and safe to run in parallel across a team.
- **blvck-pm** gives product managers a vault: identity, product context, and terminology captured once, then reused by 19 routed workflows and a scaffolded agent team.

Both follow the same design principle: **very few commands, capability in scaffolded files.** Each plugin exposes exactly four commands (`setup`, `migrate`, `validate`, `score`); everything else lives in templates and skills that become *your* files, editable and versioned in *your* repos.

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Engineering repos: blvck-harness](#engineering-repos-blvck-harness)
  - [PM vaults: blvck-pm](#pm-vaults-blvck-pm)
  - [Migrating an existing setup](#migrating-an-existing-setup)
- [Contributing](#contributing)
- [License](#license)

## Key Features

- **Five-subsystem engineering harness** — instructions, state, verification, scope, and session lifecycle, scored by 25 automated checks (`/blvck-harness:score`).
- **Scores your structure, not just ours** — already have a harness under your own file names and your own wording? Declare where the five concepts live in `.harness-map.json` and the same 25 checks grade it, up to 100/100, naming the file behind each concept. Declaring a path never passes a check on its own: the file still has to exist and still has to carry its meaning in real structure.
- **Team layout built for parallel work** — one directory per feature under `features/`, with date- or Jira-keyed IDs (`feat-YYYYMMDD-slug`) so parallel branches never race a shared counter or collide in merges.
- **PM vault with routed workflows** — capture who you are, what you build, and how you speak once; 19 workflows (PRD, RICE, JTBD, GTM, tracking plans, weekly updates, PRD review) reuse it automatically.
- **Per-product agent teams** — seven agent archetypes (customer-voice, competitive-intel, business-analyst, board-executive, prototype-builder, blind-reviewer, research-analyst) scaffolded into your repo's `.claude/agents/`, pre-filled with your product context.
- **Safe, generic migration — that can decide not to migrate** — `migrate` scans any existing setup (hand-rolled, upstream, or legacy vault) and classifies it by role, then forks: **convert** it to the standard shape, or **adapt** to it, leaving every file where it is. A structure you built on purpose is not a mistake to be corrected. Converting stays conservative: read-only scan, confirmed plan, additive apply, per-group cleanup that moves files to backup — never deletes.
- **Self-verifying repository** — this repo runs its own harness; `./init.sh` syntax-checks every script, JSON-validates every manifest and template, and round-trips a full solo + team scaffold in a temp directory.

## Architecture Overview

```
blvck-ai-os/
├── .claude-plugin/marketplace.json        # marketplace manifest (both plugins)
├── plugins/
│   ├── blvck-harness/
│   │   ├── commands/                      # setup · migrate · validate · score
│   │   └── skills/harness-engineering/
│   │       ├── SKILL.md                   # conventions the commands follow
│   │       ├── scripts/                   # create-harness.mjs, validate-harness.mjs (Node)
│   │       ├── templates/                 # solo/ and team/ scaffolds
│   │       └── references/                # harness design patterns + role classification
│   └── blvck-pm/
│       ├── commands/                      # setup · migrate · validate · score
│       └── skills/pm-os/
│           ├── SKILL.md                   # session ritual, vault rules, workflow router
│           ├── templates/                 # 21 doc/context templates + 7 agent archetypes
│           └── references/                # frameworks, voice, integrations
├── tests/fixtures/foreign-harness/         # a harness using none of the names above
└── CLAUDE.md · feature_list.json · progress.md · init.sh    # this repo's own harness
```

Four ideas hold the system together:

1. **Template–instance pattern.** Plugins hold templates; your repos hold instances. `setup` copies and fills templates into your project, where they become plain files you own. Nothing stays locked inside the plugin.
2. **Machine-filled vs. human-filled placeholders.** `{{TOKEN}}` placeholders are resolved by scripts and commands; `[bracketed]` text is yours to edit. Scripts depend on this contract, so it never breaks.
3. **Thin commands, thick skills.** Command files stay short and procedural; judgment and conventions live in each plugin's skill, which Claude loads on demand.
4. **Concepts, not filenames.** A harness is five concepts (instructions, tracker, progress log, handoff, verification); `CLAUDE.md` and `feature_list.json` are just their default names. Solo, team, and adapted layouts are three ways of resolving the same concepts, so one set of checks grades all three — `/blvck-harness:score` on a team repo and on a mapped foreign repo run identical code.

The two plugins also compose: a PRD written in a **blvck-pm** vault feeds the prototype-builder agent, which builds inside a **blvck-harness** repo.

## Getting Started

### Prerequisites

- **[Claude Code](https://claude.com/claude-code)** — CLI, desktop, or IDE extension
- **Node.js 18+** — the harness scaffold and validation scripts run on Node
- **Git** — required for the harness team layout and recommended everywhere

### Installation

Add the marketplace, then install one or both plugins from inside Claude Code:

```text
/plugin marketplace add ntwrcht/blvck-ai-os
/plugin install blvck-harness@blvck-ai-os
/plugin install blvck-pm@blvck-ai-os
```

Working from a local clone instead? Point at the path:

```text
/plugin marketplace add ~/blvck-ai-os
```

Enable each plugin per project or globally when prompted. To update later, `git pull` and refresh via `/plugin`.

## Usage

### Engineering repos: blvck-harness

Scaffold a harness in any repository — the command inspects what exists first and recommends a layout (solo for one committer, team for parallel humans):

```text
/blvck-harness:setup
```

Then work the daily ritual the scaffolded `CLAUDE.md` defines: **startup workflow → one feature → verify → end of session.** Health checks when you need them:

```text
/blvck-harness:validate   # structural pass/fail + claim hygiene, with a fix list
/blvck-harness:score      # five-subsystem grades from 25 automated checks
```

### PM vaults: blvck-pm

Run the setup interview in a dedicated vault repo or directly in a product repo:

```text
/blvck-pm:setup
```

It builds `ABOUT-ME/`, `PROJECTS/<product>/`, `TEMPLATES/`, `CLAUDE-OUTPUTS/`, `pm-os.config.md`, and your agent team in `.claude/agents/`. After that, just ask — the skill routes your request to the right workflow and writes date-stamped artifacts to `CLAUDE-OUTPUTS/`:

```text
draft a PRD for the onboarding revamp
prioritize these five ideas with RICE
review this PRD like a skeptical board member
```

Integrations (Jira, Confluence, Google Drive, BigQuery) are per-project switches in `pm-os.config.md`; nothing blocks when a tool is absent.

### Reconciling an existing setup

Already have a hand-rolled `CLAUDE.md` with ad-hoc trackers, an upstream harness, a solo layout that needs to go team, or PM notes in another structure? Both plugins share a staged, confirm-at-every-gate reconciliation:

```text
/blvck-harness:migrate    # engineering repos
/blvck-pm:migrate         # PM material
```

A read-only scan classifies your files **by the role they play, never by matching a known layout** — then you pick how it ends:

- **Convert** — move things into the standard shape. You approve a `source → destination` plan before the first write, and cleanup moves superseded files to `.migration-backup/<date>/` — group by group, with your confirmation, never a delete.
- **Adapt** — change nothing. `/blvck-harness:migrate` writes a `.harness-map.json` describing what you already have; `/blvck-pm:migrate` records your real folders in `pm-os.config.md`. Your files stay exactly where they are and the tools read them there.

Adapting is not the lesser option. A mapped harness is scored by the same 25 checks and can reach 100/100 — the report just marks the layout `adapted` and shows which file satisfied which concept:

```text
Layout: adapted (base: solo, map: .harness-map.json)

Resolution:
  instructions    AGENTS.md           <- docs/agent-guide.md        (map)
  featureTracker  feature_list.json   <- .harness/features.json     (map)
  verification    init.sh             <- Makefile                   (map)

  PASS [instructions.startupWorkflow] Startup workflow documented (matched map synonym "Kickoff")
```

What a map cannot do is invent structure. A path you declare that isn't there fails the run rather than quietly falling back, and a synonym still has to appear in a real heading, list, or table — so it changes *which word* earns a point, never *whether* the concept has to be there.

## Contributing

Contributions are welcome — this repo eats its own cooking, so the workflow will feel familiar:

1. **Open an issue first** for anything beyond a typo fix, so scope is agreed before code.
2. **Fork and branch**, then make your change. This repo runs its own harness: pick one item, keep the change in scope, and follow the working rules in [`CLAUDE.md`](CLAUDE.md).
3. **Verify before you push.** `./init.sh` must pass — it checks script syntax, validates every JSON file, and round-trips both scaffold layouts:

   ```bash
   ./init.sh
   ```

4. **Respect the placeholder contract.** `{{TOKEN}}` is machine-filled, `[bracketed]` is human-filled; scripts depend on the distinction.
5. **Open a pull request** describing what changed and why, with the `./init.sh` result in the description.

Full details, including how to test plugin changes and the release process, are in
[CONTRIBUTING.md](CONTRIBUTING.md). Security issues go to [SECURITY.md](SECURITY.md) — please
don't file those as public issues.

Bug reports and workflow ideas are as valuable as code — file them as issues with reproduction steps or a concrete use case.

## License

Released under the **MIT License** — see [LICENSE](LICENSE) for the full text.

Portions of `blvck-harness` are adapted from `harness-creator` in
[walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)
(MIT). Third-party attributions are recorded in [NOTICE](NOTICE).
