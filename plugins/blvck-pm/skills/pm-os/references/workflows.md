# PM OS Workflow Catalog

Routing table for the pm-os skill. Every workflow: (1) runs the session ritual first if not already done, (2) reads `pm-os.config.json` for paths and integrations, (3) writes only to the configured outputs dir (`CLAUDE-OUTPUTS/<type>/`) with date-stamped names, (4) uses the vault's configured templates dir (`TEMPLATES/`) copy of a template if present, else the bundled one.

Paths named below are the defaults. `paths` in `pm-os.config.json` is what actually resolves them — a vault may keep any of these anywhere, and step (2) is where you find out where.

Every workflow that produces a document also (5) records its path in the `documents` array of the
roadmap outcome it serves — if no outcome fits, say so rather than inventing one — and (6) runs the completeness gate when the document
is finished or when the user asks whether it is ready — never mid-draft. The gate names what is
unmet, offers to fill it, and if the user proceeds anyway records the override inside the
document. It warns; it never blocks. Defaults and how a vault adjusts them: `references/completeness.md`.

Language comes from `pm-os.config.json`'s `language` (default `en`), never from the language
the user happened to type in. Structural writing rules hold in every language; the banned-word
list is language-specific — see `references/voice.md`.

## Vision

**vision** — "what are we actually building toward?" / "write our vision." Lives above every
other document: the plan layer (PRD, spec, one-pager) answers *what to build next*, the vision
answers *what has to become true*. Socratic before drafting — what changes in the user's life,
who exactly, what would have to be observed for this to be wrong. Push back on any vision that
would still read true with a competitor's product substituted in; that is a category
description, not a vision.

Template: `vision.md` → the configured vision path (`PROJECTS/<product>/vision.md`). This is the
one workflow that writes **outside** the outputs dir, because a vision is product context rather
than a dated artifact — say so before writing, and never overwrite an existing vision without
showing a diff first. Version by keeping the old one at `PROJECTS/<product>/_archive/vision-[date].md`.

Its "What Must Become True" table is the source of roadmap items: each row is a business
outcome bound to a number. Revisit on the review date, not continuously.

**roadmap** — "what are we working on?" / "where do we stand?" / "add this to the roadmap." Reads
and writes `roadmap.json` at the configured roadmap path. One roadmap per product: outcomes are
bound to that product's metrics and do not compare across products.

Adding an item: it is a **business outcome bound to a number**, never a feature. Push back on
"build onboarding emails" and ask what it should change — "first-month churn under 8%" is the
item, the emails are how. Id is `out-YYYYMMDD-slug`. Link it to a vision outcome where one fits.

Moving an item to `measured` requires the result: date, value, and verdict (`hit` / `missed` /
`inconclusive`). Refuse to mark it measured without one — the whole point of the lifecycle ending
at `measured` rather than `shipped` is that someone checked. A missed outcome recorded honestly
is worth more than three shipped ones nobody looked at.

Reporting status: group by status, lead with what moved since last time, and name every item that
has been `building` for more than a quarter.

## Docs & Specs

**spec-or-prd** — "should this be a ticket, spec, or PRD?" Ask the 5 questions one at a time: sprint-weeks of effort; platform-touch (auth/API/schema); needs design review; compliance/legal/security; cross-team dependencies. Recommend exactly one: TICKET (<1 sprint-week, no platform touch, no design review), LIGHTWEIGHT SPEC (1–3 sprint-weeks, single team), FULL PRD (>3 sprint-weeks OR platform OR multi-team OR compliance). Name which answers drove it. No file output unless asked.

**prd** — "draft a PRD for X." Confirm the JTBD and success metric before writing; challenge missing evidence. Name which vision outcome it serves — if the vision has none that fit, say so plainly: either the PRD is off-strategy or the vision is stale, and both are worth knowing before engineering starts. Template: `prd.md` → `CLAUDE-OUTPUTS/prds/prd-[feature]-v1-[date].md`. New version = new file (v2), old one moves to `_archive/`. Offer `/tracking-plan` next (a PRD without instrumentation is unfinished) and Jira ticket creation if enabled.

**lightweight-spec** — for 1–3 sprint-week work. Template: `lightweight-spec.md` → `prds/spec-[feature]-[date].md`.

**one-pager** — decision documents. Template: `one-pager.md` → `strategy-docs/`. The ask goes first; refuse to bury it.

**prfaq** — working-backwards docs. Template: `prfaq.md` → `strategy-docs/`. Press release stays one page.

**prd-review** — "review this PRD." Target: latest version in `prds/` unless named. If `.claude/agents/blind-reviewer.md` exists: spawn it 3× in parallel (engineer / designer / executive lens), each blind; then synthesize — the highest-priority fix (appears in ≥2 reviews or is a showstopper), 3 changes before engineering handoff, 1 thing to preserve. Fallback without agents: run the three lenses sequentially inline, then synthesize. Output: `prds/[feature]-multi-review-[date].md`. Ask which perspective to address first.

## Prioritization & Metrics

**rice** — "prioritize these." Inputs: a list, a file, or Jira issues (if enabled, pull by filter/JQL the user confirms). State scoring rules before scoring; effort comes from engineering, not invented. Confidence <50% → route to discovery instead. Template: `rice.md` → `strategy-docs/rice-[scope]-[date].md`. Log the resulting decision in the decision log.

**metrics-tree** — "define our metrics / NSM tree." Socratic first: what value does the product deliver, which behavior shows it, what correlates with revenue. Build NSM → L1 → L2 with formulas and sources; include counter-metrics. If BigQuery enabled, verify each metric's source table exists. Template: `metrics-tree.md` → `strategy-docs/`.

## Discovery & Research

**jtbd-interview** — "prep interviews for X." Template: `jtbd-interview.md` → `research/guide-[segment]-[date].md`. Past behavior only; no "would you" questions.

**research-synthesis** — "synthesize these interviews/tickets." Sources from named files or Drive (if enabled). >3 sources AND `.claude/agents/research-analyst.md` exists → spawn one per source in parallel, synthesize over their structured summaries; ≤3 sources → read directly. Insight rule: ≥2 independent sources; contradictions reported. Template: `research-synthesis.md` → `research/synthesis-[topic]-[date].md`.

**competitor-teardown** — "tear down competitor X." Delegate to `.claude/agents/competitive-intel.md` when present, else inline. Template: `competitor-teardown.md` → `research/teardown-[competitor]-[date].md`.

## Comms & Rituals

**weekly-update** — "write my weekly update." Compare with the most recent update in `stakeholder-comms/`; pull metrics from BigQuery when enabled, else mark `[manual]` and ask. Flag ±15% moves with cause or "investigating". 200–300 words, Slack-ready. Template: `weekly-update.md` → `stakeholder-comms/update-[date].md`. Nudge `current-focus.md` update while at it.

**launch-checklist** — "prep the launch of X." Template: `launch-checklist.md` → `stakeholder-comms/launch-[feature]-[date].md`. Every unchecked gate gets an owner.

**decision-log** — "log this decision." Append to the vault's decision log (create from `decision-log.md` template at `strategy-docs/decision-log.md` if missing). Newest first; capture alternatives and revisit-when.

**onboard** — "brief a new PM / brief me on this product." Read `ABOUT-ME/` (theirs, not yours), product CLAUDE.md, roadmap, latest weekly update, decision log. Deliver: company/product in 3 bullets, NSM and why, stakeholder map with framing, top 3 process rules, data caveats, the open question of the quarter, files and commands they'll use most.

## GTM & Analytics

**gtm-brief** — "GTM plan for X." Positioning first — refuse channel talk until the positioning statement stands. Template: `gtm-brief.md` → `strategy-docs/gtm-[feature]-[date].md`.

**tracking-plan** — "instrument feature X." Read the PRD first; every event answers a stated question. Template: `tracking-plan.md` → `data-analysis/tracking-[feature]-[date].md`. If BigQuery enabled, note the destination tables.

**funnel-analysis** — "why do users drop at X?" BigQuery enabled: write the query, save SQL alongside the doc. Else: ask for an export. Check Data Caveats before any claim. Template: `funnel-analysis.md` → `data-analysis/funnel-[name]-[date].md`.

## Meta

**agent-builder** — "I need an agent that does X." Load the bundled **`agent-smith`** skill; it covers the tool and model budget, the roster boundary, and the delegation test. Bring what it cannot know: the vault's grounding ritual (identity file, `anti-style.md`, product context), product placeholders, the single output folder, and registration in `pm-os.config.json`'s roster. Refuse agents whose job overlaps an existing one — two agents with the same lens produce two answers and no way to choose. See `references/agent-design.md`.
