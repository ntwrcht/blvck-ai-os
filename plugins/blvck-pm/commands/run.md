---
description: Start a piece of PM work — pick the outcome it serves, grill the brief, then run it (dynamic workflow or classic)
argument-hint: [prd|research-synthesis|competitor-teardown|prd-review|<any workflow>]
disable-model-invocation: true
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Start exactly one piece of PM work in the current vault.

## 1. Read the vault

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/pm-os/scripts/validate-vault.mjs --target . --json`.

- Exit **2**: the config is invalid or unsafe. Show the error, suggest `/blvck-pm:setup`, and stop.
- `unscored`: there is no vault here. Suggest `/blvck-pm:setup` and stop.
- Keep `config.paths`, `config.language`, `workflow`, `visibility`, and `codebases`; the next steps use them. Then run the pm-os skill's session ritual.

## 2. Pick the work and the outcome it serves

- **The work.** `$ARGUMENTS` may name it. Otherwise ask what they want to produce, and map it to a workflow in the pm-os skill's catalog. Four of them are pipelines: `prd`, `research-synthesis`, `competitor-teardown`, `prd-review`.
- **The outcome.** List the roadmap outcomes that are not `measured`, recommend the one this work serves, and let the user choose. If none fits, say so plainly: either the work is off-strategy or the roadmap is stale, and both are worth knowing before anything is written. The user may go ahead with no outcome.
- **The name.** Agree a short lowercase-hyphen slug for the file name (`dunning-retry`).

## 3. Grill

Settle every requirement an agent would otherwise have to guess, here in this session. Workflow agents cannot ask the user anything.

- If the config's `workflow.grilling.skill` names an installed skill, use it.
- Otherwise follow the built-in [grilling style](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/grilling-default.md).

Read the vault first, so you only ask what it cannot answer. End with the confirmed brief as `Q: … A: …` lines, plus the inputs: sources, competitors, or the document to review.

## 4a. Classic mode, or work that is not a pipeline

Run the workflow yourself in this session, following the pm-os skill and its catalog. That covers classic mode, any pipeline the config has turned off, and any work that is not one of the four pipelines. Stop here.

## 4b. Dynamic mode

Pre-flight, in one message:
- **Codebases.** If the vault registers any, apply the pm-os skill's freshness rule to every one now, and record the commit each was read at. Agents read code only at those commits.
- **Deliver targets.** For each outside target on this pipeline's deliver stage, check that its MCP tools are available in this session. Say which are not: the run reports them as skipped and still delivers to the vault.
- **Checklist (prd only).** Resolve the PRD's completeness checklist: the defaults in [completeness.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/completeness.md) with the config's `completeness` overrides applied. If the type is `"skip"`, pass an empty list.

Then launch the workflow with the Workflow tool. The user typing this command is the opt-in.

The Workflow tool only loads a script from a directory the session can read, and the plugin's install folder is not one. Copy the script into the vault, refreshed from the plugin on every run. In a git repository it goes inside the git directory, where git cannot see it:

```bash
if G="$(git rev-parse --git-dir 2>/dev/null)"; then D="$G/blvck-pm"; else D=".claude/blvck-pm"; fi
mkdir -p "$D" && cp "${CLAUDE_PLUGIN_ROOT}/skills/pm-os/workflows/pm-work.js" "$D/pm-work.js" && echo "$D/pm-work.js"
```

If the vault is not a git repository, the copy lives in `.claude/blvck-pm/`; tell the user. Claude Code treats files under `.git/` as sensitive and asks before writing there. If the user declines, or the copy is refused, pass the script's contents as `script` instead of `scriptPath`, unchanged, and say so. If `git rev-parse --git-dir` points outside the working directory (this checkout is a git worktree), copy the script to a directory you can read instead, and say where.

- `scriptPath`: the absolute path of that copy
- `args` (a JSON object, not a string):
  - `config`: the `workflow` object from `pm-os.config.json`
  - `pipeline`: the pipeline name
  - `brief`: `{ "title", "slug", "summary", "sources": [...], "competitors": [...], "document": "<vault-relative path, prd-review only>" }`
  - `grilling`: the confirmed brief text from step 3
  - `outcome`: `{ "id", "outcome", "metric" }` from the roadmap, or `null`
  - `vault`: `{ "root": "<absolute vault path>", "paths": <config.paths>, "language": <config.language or "en">, "productName": <productName from the config> }`
  - `checklist`: the resolved list (prd only; otherwise `[]`)
  - `codebases`: `[{ "name", "path", "scope", "commit" }]` from the pre-flight, or `[]`
  - `date`: today, `YYYY-MM-DD`

Tell the user it is running in the background, that they can keep working here, and that `/workflows` shows live progress.

## 5. When the workflow finishes

- **needs-input**: the draft stage hit a question only the user can settle, and nothing was written. Grill those questions the same way, add the answers to the grilling text, and launch again.
- **delivered** or **blocked**: report in plain language that stands on its own; the reader should not have to scroll back or look anything up. Cover:
  - where the document is, and the roadmap outcome it was recorded on
  - the **assumptions** the run made without asking, so the user can object
  - what the reviewers flagged for a person to confirm, and the top fix
  - which outside targets were published, skipped, or failed, and why
  - for a PRD with `mine` codebases, the **proposed harness features**: the user applies them in that repo (with `/blvck-harness:setup` or by editing its tracker), because planning never writes into a codebase
  - for blocked, what failed and why
- **Completeness (prd).** If `completeness.unmet` is not empty, the gate has named gaps. It never fills them, and it never blocks. Offer to fill each one with the user now. If they release the document as it is, append the override to the document yourself, with the date and their reason, as [completeness.md](${CLAUDE_PLUGIN_ROOT}/skills/pm-os/references/completeness.md) shows. Write `no reason given` if they give none.
- Finish with `validate-vault.mjs`. The new document should be named correctly and should not add a blocking finding.
