---
name: pm-os
description: >-
  Product-manager operating system. Use for any PM artifact or decision: PRDs, lightweight
  specs, one-pagers, PR/FAQs, RICE prioritization, NSM/metrics trees, JTBD interview guides,
  research synthesis, competitor teardowns, weekly stakeholder updates, launch checklists,
  decision logs, GTM briefs, tracking plans, funnel analysis, PRD multi-perspective review,
  onboarding briefs, and minting new PM agents. Loads the PM vault (ABOUT-ME/, PROJECTS/)
  before working and writes only to CLAUDE-OUTPUTS/. Trigger on "PRD", "spec", "prioritize",
  "roadmap", "north star", "interview", "synthesis", "competitor", "weekly update", "launch",
  "GTM", "tracking plan", "funnel", or any product-management request — even if the user
  never says "pm-os".
---

# PM OS

You operate inside a PM vault. The vault is the source of truth; conversation memory is not.

## Session Ritual (always first, once per session)

1. Read `ABOUT-ME/CLAUDE.md`, `ABOUT-ME/anti-style.md`, `ABOUT-ME/current-focus.md`
2. Read `PROJECTS/<product>/CLAUDE.md` and `roadmap.md` if present
3. Read `pm-os.config.md` — paths, enabled integrations, agent roster
4. Confirm in ≤6 lines: product + one-liner, current focus, active OKR, writing rules status, output target, missing files. Then work.

No vault found (no `ABOUT-ME/` and no `pm-os.config.md`): say so, offer `/pm-os:setup` — or `/pm-os:migrate` if the directory already holds PM material in another structure — and fall back to the bundled defaults in `references/voice.md` and `references/frameworks.md` for one-off work.

## Vault Rules

- Write ONLY to `CLAUDE-OUTPUTS/<type>/` — never to `ABOUT-ME/`, `PROJECTS/`, or `TEMPLATES/` unless the user explicitly asks
- Exception: appending to the decision log and the weekly `current-focus.md` refresh, both on user request
- File naming: `[artifact-type]-[description]-[YYYY-MM-DD].md`; PRDs versioned `-v1`, `-v2`
- Supersede to `_archive/` subfolders; never delete
- Prefer the vault's `TEMPLATES/` copy of a template (user may have customized it); fall back to this skill's `templates/`
- Reference vault files by path; don't paste their content back unless asked

## Workflow Routing

Full catalog with per-workflow steps: `references/workflows.md`. Summary:

| User intent | Workflow | Output folder |
|---|---|---|
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

## Agents

The vault's `.claude/agents/` roster is scaffolded per product from `templates/agents/`. Spawn rules and the agent contract: `references/agent-design.md`. Everything works without agents — fallbacks are single-session.

## Integrations

Per-project switches in `pm-os.config.md`; rules per tool in `references/integrations.md`. A missing tool never blocks a workflow.
