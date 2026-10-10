# Review Rubric

`/blvck-pm:check` uses this for the half of the check a script cannot do: whether what exists is any good. `validate-vault.mjs` has already answered every structural question. Do not re-derive its checks, and never present your grade as its score or its score as yours.

Every path below is the **resolved** one from the script's `config.paths` (defaults in parentheses).

## Content — ✅ pass / ⚠️ weak / ❌ missing, with the exact rule used

These rules are about what a file *says*, so they apply wherever the file lives.

- **Identity file** (`ABOUT-ME/CLAUDE.md`): names a focus area (❌ if it is a generic "build great products"). Frameworks: RICE, JTBD, NSM, or the pyramid principle are present. The stakeholder table has ≥2 rows with "how to frame" filled.
- **`anti-style.md`**: has both a banned-words list and a banned-behaviors list (❌ if the template text is unedited). Note whether the writing-style block exists; without it, agents use their own tone and nothing stops internal references from reaching customers. Offer `/blvck-pm:setup` to add it.
- **`current-focus.md`**: the Updated date is within 14 days (⚠️ within 30, ❌ older), and the top priority is specific, not a theme.
- **Product `CLAUDE.md`**: a one-liner, a customer profile, and a stage with at least one number (⚠️ if no metrics). The **NSM is named and bolded** (❌ if absent). ≥2 primary users, each with a role, pain, and goal. Buyers vs users answered. The terminology table is not empty.
- **`vision.md`**: an **unedited skeleton is ⚠️, not ❌**, because setup scaffolds it on purpose and leaves the content to the `vision` workflow. Report it as "scaffolded, not yet written — run the vision workflow". Once written, check:
  - a horizon and a review date, with the review date not past (⚠️ if past)
  - the change described in user terms, not product terms
  - ≥3 rows in "What Must Become True", each with a metric
  - ≥1 exclusion (❌ if empty)
  - the bet named
- **`roadmap.json`**: nothing has sat in `building` for more than a quarter. Name each one that has; a stalled outcome is what roadmaps hide most often.
- **Config**: if `language` is not `en`, `anti-style.md` must carry a banned-word list in that language (⚠️ otherwise, and say plainly that no lexical check is running). Every enabled integration's MCP tools are available in this session (⚠️ if enabled but unavailable).
- **Agents** (the agents dir): each one has the grounding ritual (it reads the identity file and the product context), one output folder, and an escalation line. If the vault moved its identity dir, the grounding lines must name the moved path; an agent grounding in a folder that no longer exists is ❌.
- **Identity file named `about-me.md`**: that is a **rename, not a missing file**. Vaults scaffolded before blvck-pm 1.2.0 got that name. Report ⚠️ with the fix: `git mv ABOUT-ME/about-me.md ABOUT-ME/CLAUDE.md`.

## Hygiene — findings with file paths

- **Versioning**: several versions of the same PRD active in `prds/`, with none archived.
- **Staleness**: prototypes older than 90 days, and drafts older than 30.
- **Completeness debt**: documents carrying a `## Completeness` override. Count them and name the item most often left unmet. One override is a decision; the same gap in every document is a process problem.

## Readiness — each module 0–5, with one line of evidence

A module scores by what exists in the outputs dir and the vault, not by intentions.

| Module | Evidence |
|---|---|
| Vision | `vision.md` written, review date not past, ≥3 outcomes with metrics, ≥1 exclusion |
| Roadmap | Outcomes bound to numbers, not features; something has reached `measured`; nothing stuck in `building` beyond a quarter |
| Docs & specs | A current PRD or spec; the latest has measurable success metrics and names the outcome it serves |
| Prioritization | A RICE table ≤1 quarter old; decisions logged |
| Metrics | A metrics tree exists; the NSM in the product `CLAUDE.md` matches it |
| Discovery | A synthesis ≤1 quarter old; insights carry source counts |
| Comms | A weekly update ≤14 days old; the decision log has entries |
| GTM | A GTM brief for the most recent launch-tier feature |
| Analytics | A tracking plan for the newest PRD; a funnel analysis with saved SQL or an export |
| Agent team | Roster present, the contract followed, no unresolved placeholders |

The readiness grade is out of 50 (ten modules × 5). Report it beside the script's score, never added to it, because one is measured and the other is judged.
