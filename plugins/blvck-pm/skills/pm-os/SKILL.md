---
name: pm-os
description: >-
  Product-manager operating system. Use for any PM artifact or decision: PRDs, lightweight
  specs, one-pagers, PR/FAQs, RICE prioritization, NSM/metrics trees, JTBD interview guides,
  research synthesis, competitor teardowns, weekly stakeholder updates, launch checklists,
  decision logs, GTM briefs, tracking plans, funnel analysis, PRD multi-perspective review,
  onboarding briefs, product vision, and minting new PM agents. Loads the PM vault (ABOUT-ME/, PROJECTS/)
  before working and writes only to CLAUDE-OUTPUTS/. Trigger on "PRD", "spec", "prioritize",
  "roadmap", "north star", "interview", "synthesis", "competitor", "weekly update", "launch",
  "GTM", "tracking plan", "funnel", "vision", or any product-management request — even if the user
  never says "pm-os".
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---

# PM OS

You operate inside a PM vault. The vault is the source of truth; conversation memory is not.

## Session Ritual (always first, once per session)

1. Read `pm-os.config.md` — paths, enabled integrations, agent roster. Its `## Paths` section is the map: every path below is the configured one, and the defaults in parentheses only apply when the config is silent. `pm-os.config.md` is the one fixed name; everything else is free to move.
2. Read the identity file, anti-style, and current focus from the configured identity path (`ABOUT-ME/CLAUDE.md`, `ABOUT-ME/anti-style.md`, `ABOUT-ME/current-focus.md`)
3. Read the configured product context (`PROJECTS/<product>/CLAUDE.md`), the vision (`PROJECTS/<product>/vision.md`) if present, and `roadmap.md` if present
4. Note the configured output language (`## Language`, default `en`). Do not infer it from the language the user typed in
5. Confirm in ≤6 lines: product + one-liner, vision horizon and review date, current focus, active OKR, writing rules status, output target, missing files. Then work.

If the identity file is named `about-me.md`, read it and mention the rename once — vaults scaffolded before 1.2.0 got that name from setup while everything reads `CLAUDE.md`. `/blvck-pm:validate` gives the one-line fix. Don't block on it.

No vault found (no identity dir and no `pm-os.config.md`): say so, offer `/blvck-pm:setup` — or `/blvck-pm:migrate` if the directory already holds PM material in another structure — and fall back to the bundled defaults in `references/voice.md` and `references/frameworks.md` for one-off work.

## Vault Rules

- Write ONLY to the configured outputs dir (`CLAUDE-OUTPUTS/<type>/`) — never to the identity, product-context, or templates paths (`ABOUT-ME/`, `PROJECTS/`, `TEMPLATES/`) unless the user explicitly asks. The write zone is wherever `## Paths` says it is; a vault that moved it did not thereby make its identity files writable
- Exception: appending to the decision log and the weekly `current-focus.md` refresh, both on user request
- File naming: `[artifact-type]-[description]-[YYYY-MM-DD].md`; PRDs versioned `-v1`, `-v2`
- Supersede to `_archive/` subfolders; never delete
- Prefer the vault's `TEMPLATES/` copy of a template (user may have customized it); fall back to this skill's `templates/`
- Reference vault files by path; don't paste their content back unless asked

## Workflow Routing

Full catalog with per-workflow steps: `references/workflows.md`. Summary:

| User intent | Workflow | Output folder |
|---|---|---|
| "what are we building toward?" / write the vision | vision | product context (not outputs) |
| "ticket, spec, or PRD?" | spec-or-prd (5-question router) | — |
| Draft PRD / spec / one-pager / PR-FAQ | prd, lightweight-spec, one-pager, prfaq | prds/, strategy-docs/ |
| "Review this PRD" | prd-review — 3 blind lenses via `blind-reviewer` agent, else inline | prds/ |
| Prioritize / score backlog | rice (+ Jira pull when enabled) | strategy-docs/ |
| NSM / metrics tree | metrics-tree (+ BigQuery verify when enabled) | strategy-docs/ |
| Interview prep / synthesis / competitor | jtbd-interview, research-synthesis (fan-out >3 sources via `research-analyst`), competitor-teardown | research/ |
| Weekly update / launch / decision | weekly-update, launch-checklist, decision-log | stakeholder-comms/, strategy-docs/ |
| GTM / tracking / funnel | gtm-brief, tracking-plan, funnel-analysis | strategy-docs/, data-analysis/ |
| Brief a new PM | onboard | — |
| "I need an agent that does X" | agent-builder → `references/agent-design.md` | .claude/agents/ |

## Voice & Frameworks

Apply `references/voice.md` (hard writing rules) and `references/frameworks.md` (RICE, JTBD, NSM tree, pyramid principle) to every output. The vault's `anti-style.md` extends these.

Voice rules split in two: **structural** rules (conclusion first, active voice, numbers over adjectives) hold in every language; the **banned-word list is English-only**. A vault set to another language takes its list from `anti-style.md`, never from the plugin.

## Completeness

When a document is finished — or when the user asks whether it is ready — run the completeness gate from `references/completeness.md`. Name what is unmet, offer to fill it, and if the user proceeds anyway append the override to the document with the date and their reason.

The gate **warns, it never blocks**, and it never silently fills a gap to make a document pass. `pm-os.config.md`'s `## Completeness` section overrides the defaults with three verbs: `drop`, `add`, `skip`. Do not run the gate mid-draft, where every document is legitimately incomplete.

## Agents

The vault's `.claude/agents/` roster is scaffolded per product from `templates/agents/`. Spawn rules and the agent contract: `references/agent-design.md`. Everything works without agents — fallbacks are single-session.

## Integrations

Per-project switches in `pm-os.config.md`; rules per tool in `references/integrations.md`. A missing tool never blocks a workflow.
