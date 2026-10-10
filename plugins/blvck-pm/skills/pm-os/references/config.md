# The Config File

`pm-os.config.json` is the one fixed name in a vault — it is how everything else is found. As of
2.0.0 it is the **only** config: `pm-os.config.md` is no longer read, because two copies of the
same truth drift silently and a markdown bullet list was never reliably parseable.

Convert an old one once:

```bash
node <plugin>/skills/pm-os/scripts/create-vault.mjs --upgrade-config --target .
```

## Shape

```json
{
  "version": 1,
  "product": "acme",
  "productName": "Acme",
  "language": "en",
  "paths": {
    "identity": "ABOUT-ME",
    "identityFile": "ABOUT-ME/CLAUDE.md",
    "antiStyle": "ABOUT-ME/anti-style.md",
    "principles": "ABOUT-ME/pm-principles.md",
    "currentFocus": "ABOUT-ME/current-focus.md",
    "productContext": "PROJECTS/acme/CLAUDE.md",
    "vision": "PROJECTS/acme/vision.md",
    "roadmap": "PROJECTS/acme/roadmap.json",
    "templates": "TEMPLATES",
    "outputs": "CLAUDE-OUTPUTS",
    "agents": ".claude/agents"
  },
  "language": "en",
  "completeness": {
    "prd": { "add": ["pricing impact stated"], "drop": ["rollout tier with a gating metric"] },
    "prfaq": "skip"
  },
  "decisions": { "flagIrreversible": true, "flagCostTimeScope": true, "confidenceFloor": 0.7 },
  "integrations": { "jira": false, "confluence": false, "drive": false, "bigquery": false },
  "codebases": [
    { "name": "billing-api", "path": "CODE/billing-api", "scope": "mine", "branch": "main" },
    { "name": "point-service", "path": "~/work/point-service", "scope": "dependency", "branch": "develop" }
  ],
  "agents": ["lead-engineer", "blind-reviewer"],
  "workflow": { "version": 1, "mode": "dynamic", "preset": "recommended", "pipelines": { "…": "…" } }
}
```

## The fields

**`paths`** — move anything you like and record it here. Every workflow, `/blvck-pm:check`,
and both scripts read the vault through this, not through hardcoded folder names. A declared path that does not exist fails the run rather than falling back quietly: a
declaration is an assertion, and a typo that reads as configured is worse than no config at all.

**`language`** — output language for generated documents, default `en`. Structural writing rules
hold in every language; the banned-word list does not, and for anything but `en` it comes from
`anti-style.md`. Never inferred from the language the user typed in.

**`completeness`** — overrides the per-document checklists in `references/completeness.md`. Two
verbs, `drop` and `add`, or the string `"skip"` to disable a type. Anything else fails validation,
because an override the tool cannot parse looks configured and silently does nothing.

**`decisions`** — when an agent flags rather than decides. See `references/agent-design.md`.

**`integrations`** — per-project switches. A disabled or unavailable tool never blocks a
workflow; it runs local-only and says so.

**`codebases`** — the code this vault plans against (2.2.0, optional). Each entry is a git repo:

| Field | Meaning |
|---|---|
| `name` | Unique within the vault |
| `path` | Anywhere. Relative paths resolve from the vault root and `~` is the home directory. `CODE/<repo>` is the default home |
| `scope` | `mine` — work there is a task in this plan. `dependency` — work there belongs to a named owner and enters the plan as a dependency |
| `branch` | The branch planning reads. Omitted means the repo's current default |
| `rootClaudeMd` | Only value: `"accepted"`. Records that this nested repo inheriting the vault's root `CLAUDE.md` is intended, which silences that one warning. Any other value is a config error |

`scope` is **not** a write permission. Access follows where the session starts: the vault root
plans and reads, and a session started inside the repo builds. A PM who commits to a repo still
plans against it read-only from here.

This is the one declared path allowed outside the vault. The inside-the-vault rule exists so a
vault cannot borrow another vault's score; a codebase earns no points, and a repo shared by two
vaults has to sit outside at least one of them. The rest of the declaration contract holds: a
codebase that is gone or is not a git repo **blocks**, and an unknown key or scope is a config
error (exit 2). Every git repo nested in the vault is skipped when the validator walks it — a
repo is never vault material — and one the registry does not list is named as a warning.

A codebase nested in the vault inherits the vault's root `CLAUDE.md` in every coding session
there, because Claude Code loads every CLAUDE.md above the working directory. The validator warns
when that is the case. A fresh vault has no root `CLAUDE.md`, so the default is clean. If the
inheritance is intended — say the root file's rules were scoped to vault-root sessions — set
`"rootClaudeMd": "accepted"` on that entry. A recorded trade-off is a decision, not a gap, and a
warning that can never be answered teaches people to skip warnings.

**`agents`** — the roster. `validate-vault.mjs` fails on a roster naming a file that is not there;
`/blvck-pm:check` also reports an agent file the roster does not mention.

**`workflow`** — how PM work runs (3.0.0, optional). Absent or `"mode": "classic"` is classic: one
session does the work. `"mode": "dynamic"` turns on pipelines for PRDs, research syntheses,
competitor teardowns, and PRD reviews, each with its stages, agent ceilings, personas, review
lenses, skills, and deliver targets. Every field and round: `references/workflow-setup.md`. It is
read beside the score, never inside it, so a vault scores the same in either mode. Anything the
validator cannot trust exits 2, and it never falls back to a preset: an unknown key, pipeline, or
stage; a required stage turned off; a ceiling out of range; a persona name Claude Code could not
resolve; two lenses with the same name; revise on without review; a deliver target whose
integration is off or that names no destination.

**Visibility** is not a config field. A local-only vault is recorded in `.git/info/exclude`
between `# blvck-pm:local:start` and `# blvck-pm:local:end`, which `create-vault.mjs --visibility
local` writes and the validator reports as `visibility: local`.

## The write zone

Generated documents go to `paths.outputs` and nowhere else, named
`[artifact-type]-[description]-[YYYY-MM-DD].md`. The exceptions are the vision and the roadmap,
which are product context rather than dated artifacts. Superseded documents move to `_archive/`;
nothing is deleted.
