# PM OS Config — {{PRODUCT_NAME}}

Machine-read by every pm-os workflow. Edit by hand or re-run `/blvck-pm:setup`.

## Paths
- Vault root: {{VAULT_ROOT}}
- Outputs: CLAUDE-OUTPUTS/ (the only write zone)
- Product context: PROJECTS/{{PRODUCT_SLUG}}/CLAUDE.md

## Integrations (this project only)
| Tool | Enabled | Use for |
|------|---------|---------|
| Jira | {{JIRA}} | Pull issues into RICE; create tickets from PRDs |
| Confluence | {{CONFLUENCE}} | Publish PRDs and weekly updates |
| Google Drive | {{DRIVE}} | Read research docs and meeting notes as inputs |
| BigQuery | {{BIGQUERY}} | Ground metrics tree, funnels, weekly updates in real numbers |

Rule: when a tool is disabled or its MCP is unavailable, the workflow runs local-only and says so — it never blocks on a missing integration.

## Agent Team
Scaffolded in `.claude/agents/`:
{{AGENT_ROSTER}}

## Vault Rules (summary)
1. All generated files go to `CLAUDE-OUTPUTS/<type>/`, named `[artifact-type]-[description]-[YYYY-MM-DD].md`
2. Never write to `ABOUT-ME/` or `PROJECTS/` unless explicitly asked
3. Version PRDs (v1, v2, …); move superseded versions to `_archive/`, never delete
