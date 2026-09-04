---
description: Interview + scaffold the PM vault (identity, product context, integrations, agent team)
disable-model-invocation: true
---
Set up a PM OS vault in the current directory (a dedicated vault repo or a product repo — both work). Follow the pm-os skill's conventions; templates live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`.

**Detect mode first.** If `ABOUT-ME/CLAUDE.md` or `pm-os.config.md` exists: say "Found an existing PM OS — I'll validate it and fill gaps", run the `/blvck-pm:validate` logic, and only interview for the missing sections. Never overwrite existing content without explicit approval.

This is also the **upgrade path**: a vault built before 1.3.0 has no `vision.md`, no `## Language`, and no `## Completeness`. Add what is missing, leave everything else untouched, and list what you added. There is no separate upgrade command by design — this one already knows how to fill gaps.

**Interview** — one section at a time, batch each section's questions in ONE message, confirm before moving on. **Target 5 minutes.** Every section below has a working default; take the default and move on rather than pressing for an answer the user does not have yet. A vault they can try today beats a complete vault they abandoned at question 14 — `/blvck-pm:setup` re-run later fills gaps without overwriting. Skip anything already answered by `~/.claude/CLAUDE.md` (global config) — present those as pre-filled and ask only for confirmation:

1. **You as PM**: name; focus area; how you decide (framework or instinct); words you never want used (seed with the global banned list); top priority this week.
2. **Your product**: name; one-liner; customers (type, size); stage + ARR/growth/customer count if shareable; **North Star Metric** and why. Solo founders often have none of the traction numbers yet — record `unmeasured` and move on rather than stalling the interview.
3. **Users & buyers**: the 2–4 people who use it daily (role, biggest pain, goal each); who signs vs. who uses.
4. **Stakeholders**: names, roles, what each cares about, how to frame for each.
5. **Terminology**: exact terms the team uses, and the banned synonyms for each.
6. **Integrations for THIS project**: Jira / Confluence / Google Drive / BigQuery — enable only what this project actually uses. Probe: if an enabled tool's MCP isn't connected in this session, note it but still record the choice.
7. **Output language**: one question — which language should generated documents be written in? Default `en`. If not `en`, say once that the bundled banned-word list is English-only and their own list belongs in `anti-style.md`.
8. **Agent team**: recommend by stage — early/zero-to-one → customer-voice + prototype-builder; growth → business-analyst + competitive-intel; always offer blind-reviewer + research-analyst for review/synthesis quality; board-executive for exec-heavy roles. Scaffold the picks.

**Scaffold** (create-if-missing, never overwrite). `source template → destination`; the names differ where the destination has a meaning of its own:
- `about-me.md → ABOUT-ME/CLAUDE.md` — the identity file every workflow and agent reads by that name. Do not leave it named `about-me.md`.
- `anti-style.md → ABOUT-ME/anti-style.md`, `pm-principles.md → ABOUT-ME/pm-principles.md`, `current-focus.md → ABOUT-ME/current-focus.md` — placeholders filled from the interview
- `product-claude.md → PROJECTS/<product-slug>/CLAUDE.md`, plus an empty `roadmap.md`
- `vision.md → PROJECTS/<product-slug>/vision.md` — skeleton only. Do not interview for the vision here; it needs a Socratic conversation, so scaffold the file and tell the user to run the `vision` workflow when ready
- `TEMPLATES/` ← copy the doc templates (prd, lightweight-spec, one-pager, prfaq, rice, metrics-tree, jtbd-interview, research-synthesis, competitor-teardown, weekly-update, launch-checklist, decision-log, gtm-brief, tracking-plan, funnel-analysis) as the user's editable working set
- `CLAUDE-OUTPUTS/` ← prds/ strategy-docs/ research/ stakeholder-comms/ data-analysis/ feature-briefs/ prototypes/ drafts/ (add `.gitkeep` files)
- `.claude/agents/` ← the chosen archetypes from `templates/agents/`, ALL `{{PLACEHOLDERS}}` resolved with interview answers
- `pm-os.config.md` ← paths (including the vision path), `## Language`, an empty `## Completeness` (defaults apply until the user overrides), integration switches, agent roster

**Finish**: run the `/blvck-pm:validate` checks on what you just built, then **report every repair you made** — file, what was wrong, what you did. Do not fix silently: `/blvck-pm:setup` wrote the identity file under the wrong name for two releases and nobody saw it, because this step quietly repaired it on every single run. A repair you do not report is a defect you have hidden. Then show the vault tree, the agent roster, and the three daily entry points: just ask for any artifact (the skill routes), `/blvck-pm:validate` monthly, `/blvck-pm:score` when the vault feels messy.
