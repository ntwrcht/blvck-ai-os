---
description: Vault hygiene + PM-readiness grading with the top improvements
---
Score the PM OS vault in the current directory. Two dimensions, then a verdict.

**Start with the script** — it settles the structural half without opinion:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/validate-vault.mjs --target . --json
```

Its 26 checks cover hygiene and structure. Your job is the readiness half: whether what exists
is any good. Report the script's number, then yours, and never present one as the other.

**Resolve paths first.** Read `pm-os.config.md`'s `## Paths` and score the vault the user actually has: the outputs dir, identity dir, and agents dir below are the *configured* ones, defaults in parentheses. If a role is undeclared, fall back to the default; if that is absent too, classify by role against the real listing before concluding anything is missing. A vault with its own folder names is not a messy vault, and scoring it as one is the fastest way to be ignored. Say which paths you resolved and how.

**1. Vault hygiene** (each finding listed with file paths):
- Strays: generated `.md` files at vault root or outside the outputs dir (`CLAUDE-OUTPUTS/`) — identity/context/config files excluded
- Versioning: multiple versions of the same PRD active in `prds/` with none archived
- Staleness: `current-focus.md` older than 14 days; prototypes older than 90 days; drafts older than 30 days
- Naming: outputs missing the `[type]-[description]-[YYYY-MM-DD]` convention
- Config drift: agents in the agents dir (`.claude/agents/`) missing from the `pm-os.config.md` roster, or vice versa — and any path `## Paths` declares that does not exist
- Completeness debt: documents carrying a `## Completeness` override. Count them and name the item most often left unmet — one override is a decision, the same gap in every document is a process problem

**2. Module readiness** — grade each 0–5 with one-line evidence (a module scores by what exists in the outputs dir and the vault, not by intentions):
| Module | Evidence looked for |
|---|---|
| Vision | `vision.md` exists, review date not past, ≥3 outcomes with metrics, ≥1 exclusion |
| Roadmap | Outcomes bound to numbers, not features; something has reached `measured`; nothing stuck in `building` beyond a quarter |
| Docs & specs | Any current PRD/spec; latest one has measurable success metrics; each names the vision outcome it serves |
| Prioritization | A RICE table ≤ 1 quarter old; decisions logged |
| Metrics | Metrics tree exists; NSM in product CLAUDE.md matches it |
| Discovery | Synthesis ≤ 1 quarter old; insights carry source counts |
| Comms | Weekly update ≤ 14 days old; decision log has entries |
| GTM | GTM brief for the most recent launch-tier feature |
| Analytics | Tracking plan for the newest PRD; funnel analysis with saved SQL/export |
| Agent team | Roster present, contract followed, no unresolved placeholders |

**Verdict**: overall /100 (hygiene 40, readiness 60 across 10 modules), the weakest module, and the top 3 improvements as concrete actions ("run research-synthesis on the 5 interview files in research/", not "do more discovery"). Close with what's working — one line.
