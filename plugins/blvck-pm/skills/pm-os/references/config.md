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
  "agents": ["lead-engineer", "blind-reviewer"]
}
```

## The fields

**`paths`** — move anything you like and record it here. Every workflow, `/blvck-pm:validate`,
`/blvck-pm:score`, and both scripts read the vault through this, not through hardcoded folder
names. A declared path that does not exist fails the run rather than falling back quietly: a
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

**`agents`** — the roster. `/blvck-pm:validate` fails on a roster naming a file that is not there,
and on an agent file the roster does not mention.

## The write zone

Generated documents go to `paths.outputs` and nowhere else, named
`[artifact-type]-[description]-[YYYY-MM-DD].md`. The exceptions are the vision and the roadmap,
which are product context rather than dated artifacts. Superseded documents move to `_archive/`;
nothing is deleted.
