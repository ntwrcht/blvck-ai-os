# Workflow Setup Walkthrough

`/blvck-pm:setup` follows this for the mode, visibility, and dynamic-workflow rounds. The plugin guides and the user decides. Offer a recommended answer in every round, explain the trade-off in one sentence, and never force a shape.

Everything chosen here lands under the `workflow` key of `pm-os.config.json`, which stays the vault's only config. If the key is absent, the vault runs in classic mode. `create-vault.mjs --mode dynamic --preset <name>` writes the preset and scaffolds its personas. Edit the key to match the user's answers, then run `validate-vault.mjs`: it exits **2** on any workflow config it cannot trust, and never falls back to a preset. Mode never changes the score.

## Round: mode

| Mode | What it is | Recommend when |
|---|---|---|
| **Classic** | You and one agent work through the workflow in this session, step by step | Most vaults, tight token budgets, and anything you want to steer while it is written |
| **Dynamic** | `/blvck-pm:run` settles the brief with you here, then a background workflow researches each source in parallel, drafts, reviews through blind lenses, revises, checks completeness, and delivers the document. This session stays free | Research over many sources, teardowns of several competitors, and PRD reviews through several lenses: work that is naturally parallel |

Say plainly that dynamic runs several agents per document and costs more tokens than classic. Work that is not one of the four pipelines below always runs classic.

## Round: visibility

| Choice | Effect |
|---|---|
| **Shared** (default) | The vault is committed and pushed like any other file |
| **Local only** | `--visibility local` lists the vault (identity dir, product dir, templates, outputs, `pm-os.config.json`, the roster's agent files, `.claude/skills/`, `.agents/`) in `.git/info/exclude`. Git cannot see it, nothing is pushed, and no `.gitignore` entry announces it |

Recommend local when the vault holds private notes inside a repository other people use. A vault outside git is already local. If any of those paths are tracked by git already, excluding them does nothing until they are untracked. Say so, and only run `git rm --cached <path>` with explicit approval, explaining that the next push removes them from the remote.

## Round: preset (dynamic only)

| Preset | What changes |
|---|---|
| **Recommended** | Every stage on. PRD and PRD review get four lenses (engineer, designer, customer, executive), each its own persona |
| **Lean** | No discover or revise stage for PRDs, and no review or revise for research or teardowns. PRD reviews use two blind lenses, both `blind-reviewer`. Serious findings that no revise stage handled are listed openly in the document |
| **Custom** | Ask the next rounds |

## Round: pipelines and stages (custom only)

Turn each pipeline on or off; at least one stays on. Then its optional stages:

| Pipeline | Required | Optional, and what turning it off means |
|---|---|---|
| **prd** | draft, deliver | **discover**: no per-source research before drafting. **review**: no blind lenses. **revise**: findings are listed in the document instead of fixed; it needs review on. **completeness**: the checklist is not run on the draft |
| **research-synthesis** | analyze, synthesize, deliver | **review**: nobody checks the synthesis before it lands. **revise**: serious findings are listed in the document instead of fixed; it needs review on |
| **competitor-teardown** | analyze, compare, deliver | **review** and **revise**: as above |
| **prd-review** | review, consolidate, deliver | — |

## Round: agents per stage

These are ceilings, never targets. A parallel stage runs one agent per real source, competitor, or lens, and the ceiling caps how many run at once. Limits: discover and analyze 1–16, review 1–8 (and at most 8 lenses), every other stage 1. Recommend 5 for discover and analyze, and one per lens for review.

## Round: review lenses

Each lens is one blind reviewer: `{ "name": "engineer", "agent": "lead-engineer" }`. The name is the angle the reviewer takes, and the agent is the persona that takes it. A lens with `"agent": null` uses the stage's `agent`, or the default workflow agent. Two lenses with the same name are refused, because two identical lenses give two answers and no way to choose between them.

## Round: personas

Each stage runs as a subagent from `.claude/agents/`. The workflow calls agents by name, so they must live there or in `~/.claude/agents/`, whatever `paths.agents` says.

| Stage | Default persona |
|---|---|
| discover, analyze (research) | `research-analyst` |
| analyze (teardown) | `competitive-intel` |
| draft, revise, compare, consolidate | `product-manager` |
| synthesize, and revise in research synthesis | `customer-voice` |
| review lenses | `lead-engineer`, `blind-reviewer`, `customer-voice`, `board-executive` |
| completeness, deliver | default workflow agent (`null`) |

Find what the user already has: `ls .claude/agents/*.md ~/.claude/agents/*.md 2>/dev/null`. Offer their own agents per stage alongside the defaults; a user with a `pricing-analyst` agent may want it as a review lens.

Then ask how to create the personas they did not map to an existing agent:

- **Tailor with agent-smith** (recommend). Use the current one when it is installed: look for `agent-smith` in `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, `~/.agents/skills/`, or the `blvck-skills` plugin. That version, from `ntwrcht/blvck-skills`, also writes a `skills:` preload list into each agent. Otherwise use the copy bundled with this plugin (`blvck-pm:agent-smith`). Invoke it once per persona with the role, the stage duties from the matching archetype in `templates/agents/`, and the vault's product context. Keep the default **names**, so the config does not change, and keep the vault's grounding ritual in each one.
- **Preloaded vs per-stage skills.** A subagent's `skills:` frontmatter loads those skills in full on every run. That is right for know-how the persona always needs, and costly for anything occasional. Stage skills in the config are offered on demand. Preload only skills that are installed: a missing preloaded skill breaks the agent, while a missing stage skill is just skipped.
- **Use the archetypes.** `create-vault.mjs --mode dynamic` copies each persona the config names from `templates/agents/`, skips any that exist, and adds them to the roster.

## Round: skills per stage

Any number of skills per stage. Find what is installed and model-invocable:

```bash
for f in .claude/skills/*/SKILL.md .agents/skills/*/SKILL.md ~/.claude/skills/*/SKILL.md ~/.agents/skills/*/SKILL.md; do
  [ -f "$f" ] && ! grep -q '^disable-model-invocation: true' "$f" && echo "$f"
done
```

The plugin form shows up in this session's skill list as `blvck-skills:<name>`, so count those too. Leave out any skill with `disable-model-invocation: true` and say why: an agent cannot invoke it, so wiring it to a stage does nothing.

Recommended map from `ntwrcht/blvck-skills`. Offer only what is installed, and when most of it is missing suggest `npx skills add github:ntwrcht/blvck-skills`:

| Stage | Skills |
|---|---|
| discover, analyze, synthesize | `research`, `discovery-synthesis` |
| draft, revise | `write-a-prd`, `write-a-story`, `doc-coauthoring` |
| any step that ranks options | `prioritize` |
| review | `scrutinize` |
| deliver | `stakeholder-comms`, `write-user-docs` |
| PRDs that add tracking | `ga4-measurement` |
| work that introduces or renames domain terms | `domain-modeling` |
| Thai-language vaults (`language: th`) | `kien-thai` |

`grilling` belongs to `/blvck-pm:run` itself (the grilling round), and `agent-smith` and `skill-smith` build the roster rather than run in it.

A skill listed for a stage but not installed is skipped by the agent, not an error. Still, tell the user which of their choices are missing.

## Round: grilling

`grilling.skill` names the skill `/blvck-pm:run` uses before each run. The default is `grilling` (from blvck-skills). If it is not installed, run falls back to the built-in [grilling style](grilling-default.md). Set `null` to always use the built-in one.

## Round: deliver targets

The finished document always goes to the vault's outputs folder, and its path is recorded on the roadmap outcome it serves. Outside targets are optional, per pipeline:

| Target | Pipelines | What happens |
|---|---|---|
| `confluence` | all | Published as a page at `workflow.destinations.confluence` (space and parent page); the URL goes in the document header |
| `drive` | all | Uploaded to `workflow.destinations.drive` (a folder) |
| `jira` | prd | One ticket per Must requirement in project `workflow.destinations.jira` |

A target needs its integration on (`integrations.<tool>: true`) and a destination, or the config exits 2. Choosing a target here is the approval to publish there on every run. Say so before recording it, because these are outward-facing and a run does not stop to confirm. A target whose tool is not connected during a run is reported as skipped. It never blocks delivery.

## Confirm

Show the final config as one table per pipeline: stage, on/off, persona, max agents, skills, lenses. Then show visibility, deliver targets with their destinations, and the grilling skill. Write nothing until the user says yes.

## Shape

```json
"workflow": {
  "version": 1,
  "mode": "dynamic",
  "preset": "recommended",
  "pipelines": {
    "prd": {
      "enabled": true,
      "stages": {
        "discover": { "enabled": true, "agents": 5, "agent": "research-analyst", "skills": ["research"] },
        "draft": { "enabled": true, "agents": 1, "agent": "product-manager", "skills": ["write-a-prd"] },
        "review": { "enabled": true, "agents": 4, "agent": null, "skills": ["scrutinize"],
                    "lenses": [{ "name": "engineer", "agent": "lead-engineer" }, { "name": "executive", "agent": "board-executive" }] },
        "revise": { "enabled": true, "agents": 1, "agent": "product-manager", "skills": [] },
        "completeness": { "enabled": true, "agents": 1, "agent": null, "skills": [] },
        "deliver": { "enabled": true, "agents": 1, "agent": null, "skills": [], "targets": ["confluence"] }
      }
    }
  },
  "destinations": { "confluence": "PM space / Specs" },
  "grilling": { "skill": "grilling" }
}
```
