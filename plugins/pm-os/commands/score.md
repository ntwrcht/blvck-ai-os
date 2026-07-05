---
description: Vault hygiene + PM-readiness grading with the top improvements
---
Score the PM OS vault in the current directory. Two dimensions, then a verdict.

**1. Vault hygiene** (each finding listed with file paths):
- Strays: generated `.md` files at vault root or outside `CLAUDE-OUTPUTS/` (identity/context/config files excluded)
- Versioning: multiple versions of the same PRD active in `prds/` with none archived
- Staleness: `current-focus.md` older than 14 days; prototypes older than 90 days; drafts older than 30 days
- Naming: outputs missing the `[type]-[description]-[YYYY-MM-DD]` convention
- Config drift: agents in `.claude/agents/` missing from the `pm-os.config.md` roster, or vice versa

**2. Module readiness** — grade each 0–5 with one-line evidence (a module scores by what exists in `CLAUDE-OUTPUTS/` and the vault, not by intentions):
| Module | Evidence looked for |
|---|---|
| Docs & specs | Any current PRD/spec; latest one has measurable success metrics |
| Prioritization | A RICE table ≤ 1 quarter old; decisions logged |
| Metrics | Metrics tree exists; NSM in product CLAUDE.md matches it |
| Discovery | Synthesis ≤ 1 quarter old; insights carry source counts |
| Comms | Weekly update ≤ 14 days old; decision log has entries |
| GTM | GTM brief for the most recent launch-tier feature |
| Analytics | Tracking plan for the newest PRD; funnel analysis with saved SQL/export |
| Agent team | Roster present, contract followed, no unresolved placeholders |

**Verdict**: overall /100 (hygiene 40, readiness 60), the weakest module, and the top 3 improvements as concrete actions ("run research-synthesis on the 5 interview files in research/", not "do more discovery"). Close with what's working — one line.
