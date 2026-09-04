# Integrations

pm-os is local-first. Integrations are per-project switches in `pm-os.config.json`; a disabled or unavailable tool never blocks a workflow — the workflow runs local-only and says so in one line.

## The rule, in order
1. Read `pm-os.config.json` → is the tool enabled for this project?
2. Enabled → check the MCP tools actually exist in this session (e.g. `mcp__…Atlassian…`, `mcp__…Google_Drive…`, `mcp__…BigQuery…`). Config says yes but tools absent → proceed local-only, note "Jira enabled but not connected in this session."
3. Never store credentials or tokens in the vault. Connection setup belongs to Claude Code MCP config, not pm-os.

## Per tool

**Jira** — rice: pull candidate issues by a filter/JQL the user confirms before running. prd: after approval, offer to create implementation tickets (one per Must requirement); show the payload before creating. Team-harness bridge: feature IDs may embed Jira keys (`feat-KEY-123-slug`).

**Confluence** — prd / weekly-update: after the local file is written, offer to publish; user picks the space/parent page. Local file remains the source of truth; add the Confluence URL to its header on publish. Publishing is outward-facing — always confirm before the first publish to a space.

**Google Drive** — research-synthesis / prd inputs: search and read named docs (meeting notes, research). Read-only by default; quote with the doc title and date.

**BigQuery** — metrics-tree: verify source tables exist. weekly-update / funnel-analysis: run read-only queries; save the SQL next to the output doc (`data-analysis/sql/`); respect the product context's Data Caveats section in every claim. Prefer `execute_sql_readonly` when available; never write to tables.
