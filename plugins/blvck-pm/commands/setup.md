---
description: Interview + scaffold the PM vault (identity, product context, integrations, agent team)
disable-model-invocation: true
---
Set up a PM OS vault in the current directory (a dedicated vault repo or a product repo — both work). Follow the pm-os skill's conventions; templates live in `${CLAUDE_PLUGIN_ROOT}/skills/pm-os/templates/`.

**Detect mode first.** If `ABOUT-ME/CLAUDE.md` or `pm-os.config.md` exists: say "Found an existing PM OS — I'll validate it and fill gaps", run the `/blvck-pm:validate` logic, and only interview for the missing sections. Never overwrite existing content without explicit approval.

**Interview** — one section at a time, batch each section's questions in ONE message, confirm before moving on. Skip anything already answered by `~/.claude/CLAUDE.md` (global config) — present those as pre-filled and ask only for confirmation:

1. **You as PM**: name; focus area; how you decide (framework or instinct); words you never want used (seed with the global banned list); top priority this week.
2. **Your product**: name; one-liner; customers (type, size); stage + ARR/growth/customer count if shareable; **North Star Metric** and why.
3. **Users & buyers**: the 2–4 people who use it daily (role, biggest pain, goal each); who signs vs. who uses.
4. **Stakeholders**: names, roles, what each cares about, how to frame for each.
5. **Terminology**: exact terms the team uses, and the banned synonyms for each.
6. **Integrations for THIS project**: Jira / Confluence / Google Drive / BigQuery — enable only what this project actually uses. Probe: if an enabled tool's MCP isn't connected in this session, note it but still record the choice.
7. **Agent team**: recommend by stage — early/zero-to-one → customer-voice + prototype-builder; growth → business-analyst + competitive-intel; always offer blind-reviewer + research-analyst for review/synthesis quality; board-executive for exec-heavy roles. Scaffold the picks.

**Scaffold** (create-if-missing, never overwrite):
- `ABOUT-ME/` ← about-me.md, anti-style.md, pm-principles.md, current-focus.md — placeholders filled from the interview
- `PROJECTS/<product-slug>/CLAUDE.md` ← product-claude.md, plus an empty `roadmap.md`
- `TEMPLATES/` ← copy the doc templates (prd, lightweight-spec, one-pager, prfaq, rice, metrics-tree, jtbd-interview, research-synthesis, competitor-teardown, weekly-update, launch-checklist, decision-log, gtm-brief, tracking-plan, funnel-analysis) as the user's editable working set
- `CLAUDE-OUTPUTS/` ← prds/ strategy-docs/ research/ stakeholder-comms/ data-analysis/ feature-briefs/ prototypes/ drafts/ (add `.gitkeep` files)
- `.claude/agents/` ← the chosen archetypes from `templates/agents/`, ALL `{{PLACEHOLDERS}}` resolved with interview answers
- `pm-os.config.md` ← paths, integration switches, agent roster

**Finish**: run the `/blvck-pm:validate` checks on what you just built; fix anything failing. Then show the vault tree, the agent roster, and the three daily entry points: just ask for any artifact (the skill routes), `/blvck-pm:validate` monthly, `/blvck-pm:score` when the vault feels messy.
