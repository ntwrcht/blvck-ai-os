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
3. Read the configured product context (`PROJECTS/<product>/CLAUDE.md`), the vision (`PROJECTS/<product>/vision.md`) if present, and `roadmap.json` if present — the roadmap is where "where do we stand" is answered
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
| "what are we working on / where do we stand?" | roadmap | `roadmap.json` (product context) |
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

## Scripts

Two Node scripts do the mechanical work. Reach for them instead of eyeballing a vault:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/create-vault.mjs --target /path --product "Name" [--slug s] [--language en] [--agents a,b] [--force]
node ${CLAUDE_SKILL_DIR}/scripts/validate-vault.mjs --target /path [--json] [--min-score N]
```

`create-vault.mjs` scaffolds without an interview — it is how CI builds a vault, not how a human
should. `/blvck-pm:setup` stays the human path.

`validate-vault.mjs` scores five modules (identity, product, plan, roadmap, config) over 25
mechanical checks. Exit `0` passed, `1` scored under the bar or has a blocking finding, `2` the
config is invalid or unsafe. Three things block regardless of score, because each is a broken
promise rather than a weak vault: a declared path that does not exist, an unresolved
`{{PLACEHOLDER}}`, and a roadmap error.

**The script decides only what a machine can decide.** "Does the PRD name a success metric" is
its job; "is it a good metric" is yours. A low script score plus a clean read from you is a real
answer; do not re-derive its checks by hand, and do not let it stand in for judgment.

## Roadmap

`roadmap.json` (one per product, at the configured roadmap path) holds **business outcomes bound
to numbers**, not features. Statuses run `idea → validated → planned → building → shipped →
measured`, and `measured` is terminal: an item is not finished when the work ships, it is
finished when someone checked whether the number moved. An item claiming `measured` must carry
the result, verdict included — `hit`, `missed`, or `inconclusive`. A missed outcome recorded
honestly is worth more than three shipped ones nobody checked.

Item ids are `out-YYYYMMDD-slug`: the date is the allocator, so two branches never mint the same
id. Items may link to a vision outcome, to the documents that serve them, and to blvck-harness
feature ids — that last field is the seam between the two plugins, which track different units
and link rather than share a tracker.

When a workflow writes a document, add its path to the `documents` array of the outcome it
serves. If no outcome fits, say so rather than inventing one: either the work is off-strategy or
the roadmap is stale.

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
