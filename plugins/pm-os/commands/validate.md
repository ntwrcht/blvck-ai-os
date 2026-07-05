---
description: Scored section-by-section check of the PM vault (✅ / ⚠️ / ❌ with fixes)
---
Validate the PM OS vault in the current directory. Report, don't fix — offer fixes at the end.

**Structure** — table with ✅/❌: `ABOUT-ME/` (CLAUDE.md, anti-style.md, pm-principles.md, current-focus.md), `PROJECTS/<product>/CLAUDE.md`, `TEMPLATES/`, `CLAUDE-OUTPUTS/` (prds, strategy-docs, research, stakeholder-comms, data-analysis required; feature-briefs, prototypes, drafts recommended ⚠️), `pm-os.config.md`, `.claude/agents/`.

**Content** — score each section ✅ pass / ⚠️ weak / ❌ missing, with the exact rule used:

- `ABOUT-ME/CLAUDE.md` → Identity: names a focus area (❌ if generic "build great products"). Frameworks: RICE/JTBD/NSM/pyramid present. Stakeholder table: ≥2 rows with "how to frame" filled.
- `anti-style.md` → has both a banned-words list and banned-behaviors list; ❌ if template text unedited.
- `current-focus.md` → Updated date within 14 days (⚠️ within 30, ❌ older); a top priority that is specific, not a theme.
- Product `CLAUDE.md` → one-liner + customer profile + stage with at least one number (⚠️ if no metrics); **NSM named and bolded** (❌ if absent); ≥2 primary users each with role + pain + goal; buyers vs users answered; terminology table non-empty.
- `pm-os.config.md` → integration table complete; every enabled tool's MCP actually available in this session (⚠️ if enabled-but-unavailable); agent roster matches the files in `.claude/agents/`.
- `.claude/agents/*` → each agent has the grounding ritual (reads ABOUT-ME + product CLAUDE.md), one output folder, an escalation line; ❌ any file with unresolved `{{PLACEHOLDERS}}`.

**Verdict**: overall ✅/⚠️/❌ per area, then a numbered fix list ordered by impact (unresolved placeholders and missing NSM first). Offer to apply fixes; touch `ABOUT-ME/` and `PROJECTS/` only with explicit approval per file.
