---
description: Scored section-by-section check of the PM vault (✅ / ⚠️ / ❌ with fixes)
---
Validate the PM OS vault in the current directory. Report, don't fix — offer fixes at the end.

**Run the script first**, then read what it cannot:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/validate-vault.mjs --target . --json
```

It answers every structural question mechanically — files present, placeholders unresolved,
paths declared but absent, roadmap well formed, focus stale, roster drifted — and it is
reproducible in a way your reading is not. Report its score and exit code verbatim. Then do the
part it cannot: judge whether the content is any good. Do not re-derive its checks by hand, and
do not soften its result; if it exits 1, say so before anything else.

Exit `2` means the config is invalid or unsafe, not that the vault is weak — say that plainly
and fix the config before scoring anything.

**Resolve paths first.** Read `pm-os.config.json`'s `paths`. Every path below is the *configured* one, not a hardcoded folder name — a vault that keeps identity in `00-me/` and outputs in `90-artifacts/` is a vault, not a broken one. For each role, in order:

1. the path `paths` declares
2. the default below, if the config does not declare it
3. classify by role against the actual directory listing — identity material, product context, doc templates, produced artifacts, config, agent definitions. Known layouts are hints, not requirements; a folder that fits no role is **unknown** — ask, never guess
4. if it still does not resolve, report it unresolved and offer `/blvck-pm:migrate`

`pm-os.config.json` itself is the one fixed name — it is how everything else is found. Annotate any path you resolved from the config or by classification, so the reader can see what was actually checked rather than assuming the defaults.

**Structure** — table with ✅/❌, defaults in parentheses: identity dir (`ABOUT-ME/`: CLAUDE.md, anti-style.md, pm-principles.md, current-focus.md), product context (`PROJECTS/<product>/CLAUDE.md`), vision (`PROJECTS/<product>/vision.md` — ⚠️ if absent, not ❌: a vault can work without one, but say what it costs), templates (`TEMPLATES/`), outputs (`CLAUDE-OUTPUTS/`: prds, strategy-docs, research, stakeholder-comms, data-analysis required; feature-briefs, prototypes, drafts recommended ⚠️), `pm-os.config.json`, agents (`.claude/agents/`).

If the identity file is `about-me.md` rather than `CLAUDE.md`, that is a **rename, not a missing file** — vaults scaffolded before blvck-pm 1.2.0 got the wrong destination name from `/blvck-pm:setup`, while every workflow and agent reads `ABOUT-ME/CLAUDE.md`. Report it as ⚠️ with the one-line fix (`git mv ABOUT-ME/about-me.md ABOUT-ME/CLAUDE.md`), never as ❌ missing identity.

**Content** — score each section ✅ pass / ⚠️ weak / ❌ missing, with the exact rule used. These rules are about what the file *says*, so they apply unchanged wherever the file lives:

- Identity file (`ABOUT-ME/CLAUDE.md`) → Identity: names a focus area (❌ if generic "build great products"). Frameworks: RICE/JTBD/NSM/pyramid present. Stakeholder table: ≥2 rows with "how to frame" filled.
- `anti-style.md` → has both a banned-words list and banned-behaviors list; ❌ if template text unedited.
- `current-focus.md` → Updated date within 14 days (⚠️ within 30, ❌ older); a top priority that is specific, not a theme.
- Product `CLAUDE.md` → one-liner + customer profile + stage with at least one number (⚠️ if no metrics); **NSM named and bolded** (❌ if absent); ≥2 primary users each with role + pain + goal; buyers vs users answered; terminology table non-empty.
- `vision.md` → an **unedited skeleton is ⚠️, not ❌**: `/blvck-pm:setup` scaffolds it deliberately and defers the content to the `vision` workflow, so report "scaffolded, not yet written — run the vision workflow". Once written, check: horizon and review date present, and the review date not past (⚠️ if past — a vision nobody revisited is context, not direction); the change described in user terms rather than product terms; ≥3 rows in "What Must Become True", each with a metric (⚠️ if rows exist without metrics — an outcome with no number cannot become a roadmap item); ≥1 exclusion (❌ if empty: a vision without exclusions directs nothing); the bet named. Partially written is ⚠️ naming the unfilled sections.
- `pm-os.config.json` → present and machine-readable (⚠️ if only `pm-os.config.json` exists — the markdown copy is a bridge for pre-1.4.0 vaults, and only the JSON is parsed by the script; offer to generate it)
- `roadmap.json` → present at the configured path; every item bound to a metric; every `measured` item carrying date, value, and verdict; nothing sitting in `building` for more than a quarter (⚠️ and name them — a stalled outcome is the most common thing a roadmap hides)
- `pm-os.config.json` → `language` present (⚠️ if absent — `en` is assumed); if language is not `en`, `anti-style.md` must carry a banned-word list for that language (⚠️ otherwise, and say plainly that no lexical check is running). `completeness` present, and every override uses only `drop` / `add` / `skip` against a known document type (❌ on an unknown verb or type — a typo'd override reads as configured and silently does nothing). `paths` present and every declared path exists (❌ a declared path that is not there — a declaration is an assertion, and a broken one is worse than an absent one); integration table complete; every enabled tool's MCP actually available in this session (⚠️ if enabled-but-unavailable); agent roster matches the files in the configured agents dir.
- Agents (`.claude/agents/*`) → each agent has the grounding ritual (reads the identity file + product CLAUDE.md), one output folder, an escalation line; ❌ any file with unresolved `{{PLACEHOLDERS}}`. If the vault moved its identity dir, the agents' grounding lines must name the moved path — an agent grounding in a folder that no longer exists is ❌, not ⚠️.

**Completeness overrides** — for every document in the outputs dir that carries a `completeness` object recording an override, list it: document, date, what was unmet. These are not failures — the gate is designed to let them through — but a vault where every PRD shipped without a success metric is telling you something the individual documents cannot. Report the pattern, not just the rows.

**Verdict**: overall ✅/⚠️/❌ per area, then a numbered fix list ordered by impact (unresolved placeholders, a broken declared path, an invalid completeness override, and missing NSM first). Offer to apply fixes; touch the identity dir and product context only with explicit approval per file.
