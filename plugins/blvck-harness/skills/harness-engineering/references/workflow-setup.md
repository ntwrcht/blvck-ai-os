# Workflow Setup Walkthrough

`/blvck-harness:setup` follows this for the mode, visibility, and dynamic-workflow rounds. The plugin guides; the user decides. Offer a recommended answer in every round, explain the trade-off in one sentence, and never force a shape.

Everything chosen here lands in `.claude/harness-workflow.json`. Absent file = classic mode. `create-harness.mjs` writes the defaults; edit the file to match the user's answers, then re-run `create-harness.mjs --mode dynamic` (no `--force`) so the **Workflow Mode** section in the instruction file is re-rendered from the file. `validate-harness.mjs` exits **2** on any config it cannot trust — run it after every edit.

## Round: mode

| Mode | What it is | Recommend when |
|---|---|---|
| **Classic** | One agent follows the startup ritual, one feature at a time | Small repos, tight token budgets, or a user new to harnesses |
| **Dynamic** | `/blvck-harness:run` grills the user here, then a background workflow plans, splits, builds in parallel worktrees, tests, reviews, and opens a PR/MR | Features that split into independent parts, and a user who wants the main session free while work runs |

Say plainly: dynamic runs several agents per feature and costs more tokens than classic.

## Round: visibility

| Choice | Effect |
|---|---|
| **Shared** (default) | Harness files are committed and pushed like any other file |
| **Local only** | `--visibility local` writes the harness paths (instruction file, state files, `init.sh`, map, workflow config, stage personas, `.claude/skills/`, `.agents/`) into `.git/info/exclude` — nothing git can see, nothing pushed, and no `.gitignore` entry announcing it |

Refuse local for a **team** layout: claims and status only work when teammates can see them. If any of those paths are already tracked by git, excluding them does nothing until they are untracked — say so, and only run `git rm --cached <path>` with explicit approval, explaining that the next push removes them from the remote.

## Round: preset (dynamic only)

| Preset | Stages |
|---|---|
| **Recommended** | plan → audit → breakdown → implement → test → review → deliver → clean up |
| **Lean** | plan → breakdown → implement → test → deliver → clean up (no plan audit, no separate review) |
| **Custom** | Ask the next round |

## Round: stages (custom only)

Plan, implement, and deliver are required — the run cannot finish without them. The rest are optional:

| Stage | Turning it off means |
|---|---|
| audit | Nobody pressure-tests the plan before code is written |
| breakdown | One implementer builds everything — no parallel work |
| test | Tasks are not tested one by one; only the final verification runs |
| review | No per-task or whole-feature code review |
| clean up | Worktrees and merged task branches stay until the user removes them |

## Round: agents per stage

Ceilings, never targets: parallel stages scale to the number of independent tasks, and a feature that splits into three tasks runs three implementers whatever the ceiling says. Limits: plan and audit 1–5 (extra agents are independent angles or skeptic votes), implement/test/review 1–16, breakdown/deliver/clean up 1. Recommended: implement 10, test 5, review 5, everything else 1.

## Round: personas

Each stage runs as a subagent from `.claude/agents/`:

| Stage | Default persona |
|---|---|
| plan | `product-owner` |
| audit, breakdown, review, deliver | `tech-lead` |
| implement | `developer` |
| test | `qa-engineer` |
| clean up | default workflow agent (`null`) |

Find what the user already has: `ls .claude/agents/*.md ~/.claude/agents/*.md 2>/dev/null`. Offer their own agents per stage alongside the defaults — a user with a `rails-dev` agent may want it to implement.

Then ask how to create the personas they did not map to an existing agent:

- **Tailor with agent-smith** (recommend when available). Look for it as `agent-smith` in `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, or an installed plugin (blvck-pm bundles one; `ntwrcht/blvck-skills` ships the current one, which also writes a `skills:` preload list into each agent). Invoke it once per persona with the role, the stage duties from the matching default in `templates/agents/`, and the project's context. Keep the default **names** so the config does not change, and scaffold with `--no-agents` so the defaults do not land first.
- **Preloaded vs per-stage skills.** A subagent's `skills:` frontmatter loads those skills in full on every run — right for know-how the persona always needs (the `developer` preloading `next-engineer` in a Next.js repo), costly for anything occasional. Stage skills in the config are offered on demand. Preload only skills that are installed; a preloaded skill that is missing breaks the agent, a missing stage skill is just skipped.
- **Use the defaults.** `create-harness.mjs --mode dynamic` copies the four templates and skips any that exist.

## Round: skills per stage

Any number of skills per stage. Find what is installed and model-invocable:

```bash
for f in .claude/skills/*/SKILL.md .agents/skills/*/SKILL.md ~/.claude/skills/*/SKILL.md ~/.agents/skills/*/SKILL.md; do
  [ -f "$f" ] && ! grep -q '^disable-model-invocation: true' "$f" && echo "$f"
done
```

`npx skills add` installs into `.agents/skills/` or `.claude/skills/` (`-g`: the same under `~`); the blvck-skills installer uses `.claude/skills/`; the plugin form shows up in this session's skill list as `blvck-skills:<name>`. Count all of them. Leave out any skill with `disable-model-invocation: true` and say why: an agent cannot invoke it, so wiring it to a stage does nothing.

Recommended map from `ntwrcht/blvck-skills` — offer only what is installed, and when most of it is missing suggest `npx skills add github:ntwrcht/blvck-skills` (or `--skill <names>` for just these):

| Stage | Always | When it applies |
|---|---|---|
| plan | `codebase-design` | `domain-modeling` when the feature introduces or renames domain concepts; `prototype` when the open question is how a UI or state model should feel |
| audit | `scrutinize` | `security-audit` when the feature touches auth, tokens, secrets, or user data |
| breakdown | `codebase-design` | — |
| implement | `tdd` | the stack skill (below); `ga4-measurement` when the feature adds tracking |
| test | `tdd`, `debug` | `ga4-measurement` to validate tracking |
| review | `scrutinize` | `security-audit` as above; the stack skill (below) |
| deliver | — | `code-to-docs` when the feature changes an API or architecture that docs describe |

**Stack skills** — detect the stack from manifests and recommend the match for implement and review (and as a preload for `developer`):

| Detected | Skill |
|---|---|
| `angular.json` / `@angular/core` | `angular-engineer` |
| `next` in package.json | `next-engineer` |
| `pyproject.toml` / `requirements.txt` | `python-engineer` |
| `@strapi/strapi` | `strapi-engineer` |
| `supabase/` / `@supabase/supabase-js` | `supabase-engineer` |
| TiDB connection or `tidb` in config | `tidb-engineer`; `mongodb-to-tidb-migration` for a migration feature |

Not for stages, and why: `grilling` belongs to `/blvck-harness:run` itself (the grilling round); `agent-smith` and `skill-smith` build the roster and skills, they do not run in it; `subagent-driven-development`, `triage`, `handoff`, `setup-context`, `to-questionnaire`, and `wait-what` are user-only; the PM and writing skills (`write-a-prd`, `write-a-story`, `prioritize`, `stakeholder-comms`, `discovery-synthesis`, `doc-coauthoring`, `write-user-docs`, `release-scan`, `kien-thai`) and `caveman`, `research`, `post-mortem` serve people, not a build stage.

**`git-guardrails` conflicts with dynamic mode.** Its hooks block `git push` and `git branch -D`, so Deliver cannot push or open the PR/MR and Clean up cannot force-delete branches. If its hooks are installed (look for it in `.claude/settings*.json` hooks), say so: the run will leave the feature branch local and report it, and the user pushes it themselves. Never suggest removing the guardrails to make the workflow pass.

A skill listed for a stage but not installed is skipped by the agent, not an error — but tell the user which of their choices are missing.

## Round: grilling

`grilling.skill` names the skill `/blvck-harness:run` uses before each run. Default `grilling` (from blvck-skills). If it is not installed, run falls back to the built-in [grilling style](grilling-default.md) — set `null` to always use the built-in one.

## Round: delivery

- **Host**: read `git remote get-url origin`. `github.com` → `github` (opens a PR with `gh`); `gitlab` in the host → `gitlab` (opens an MR with `glab`); a self-hosted remote → ask which it is; no remote → `none`. Check `gh auth status` / `glab auth status` and warn if not signed in — the run still pushes the branch and returns a link to open the PR/MR by hand.
- **Target branch**: the branch PRs/MRs merge into. Default to the remote's default branch (`git symbolic-ref refs/remotes/origin/HEAD`), and let the user pick another (`develop`, a release branch).
- **Source branch**: always one feature branch, `<branchPrefix><feature id>` (default `feat/`), which collects every task's worktree branch.
- **Repair loop**: how many times a rejected task is sent back before the run stops and flags it — default 2, maximum 3.

## Confirm

Show the final config as a table — stage, on/off, persona, max agents, skills — plus visibility, host, target branch, and repair limit. Write nothing until the user says yes.
