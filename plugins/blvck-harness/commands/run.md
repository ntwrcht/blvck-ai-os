---
description: Start the next feature — grill unclear requirements, then run it (dynamic workflow or classic ritual)
argument-hint: [feature-id]
disable-model-invocation: true
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Start work on exactly one feature in the current repository.

## 1. Read the harness

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json`.

- Exit **2**: the map or `.claude/harness-workflow.json` is broken. Show the error, suggest `/blvck-harness:setup`, and stop.
- `unscored`: there is no harness here to run. Suggest `/blvck-harness:setup` and stop.
- Keep `layout`, `resolution`, `workflow.mode`, and `visibility` — the next steps use them.

## 2. Pick one feature

Read the tracker from `resolution.featureTracker.sources` (adapted layouts included — the real file is named there). List features that are not done and whose dependencies are all done. If `$ARGUMENTS` names one, use it; otherwise recommend the first and let the user choose. In **team** layout, check nobody else has claimed it, then write the user's `owner` and the branch into its `status.json` and commit that claim (ask before pushing it).

## 3. Grill

Settle every requirement an agent would otherwise have to guess, here in this session — workflow agents cannot ask the user anything.

- If `.claude/harness-workflow.json` names `grilling.skill` and that skill is available, use it.
- Otherwise follow the built-in [grilling style](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/grilling-default.md).

Read the code and tracker first so you only ask what they cannot answer. End with the confirmed requirements as `Q: … A: …` lines plus checkable done criteria.

## 4a. Classic mode

Follow the instruction file's Startup Workflow, implement the feature yourself within its Working Rules, verify, and finish with its End of Session steps. Stop here.

## 4b. Dynamic mode

Pre-flight, in one message:
- Uncommitted changes in this checkout are invisible to the workflow's worktrees, which start from committed branches. If there are any that the feature depends on, ask the user to commit them first.
- If `delivery.host` is `github` or `gitlab`, check `gh auth status` or `glab auth status`. If not signed in, say the run will push the branch and hand back a link to open the PR/MR by hand.

Then launch the workflow with the Workflow tool — the user typing this command is the opt-in.

The Workflow tool only loads a script from a directory the session can read, and the plugin's install folder is not one. Copy the script into this repo's git directory — inside the working directory, invisible to git, and refreshed from the plugin on every run:

Also keep the runtime's worktrees out of the user's `git status` — the workflow creates them under `.claude/worktrees/`:

```bash
G="$(git rev-parse --git-dir)"; grep -qxF '/.claude/worktrees/' "$G/info/exclude" 2>/dev/null || echo '/.claude/worktrees/' >> "$G/info/exclude"
mkdir -p "$(git rev-parse --git-dir)/blvck-harness" && cp "${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/workflows/feature.js" "$(git rev-parse --git-dir)/blvck-harness/feature.js"
```

If `git rev-parse --git-dir` points outside the working directory (this checkout is itself a git worktree), copy it to a directory you can read instead and tell the user where.

- `scriptPath`: the absolute path of that copy
- `args` (a JSON object, not a string):
  - `config`: the parsed contents of `.claude/harness-workflow.json`
  - `feature`: the picked tracker entry
  - `grilling`: the confirmed requirements text from step 3
  - `harness`: `{ "layout": …, "resolution": … }` from step 1
  - `verification`: `./init.sh` (or the resolved verification file) when `visibility` is `shared`; when it is `local`, `bash <absolute repo root>/<that file>`, because worktrees do not contain local harness files
  - `codeStyle`: the text of the instruction file's `## Code Style` section (between its `blvck-harness:code-style` markers), or omit it when there is none
  - `local`: `true` when `visibility` is `local`
  - `repoRoot`: the absolute path of this checkout

Tell the user it is running in the background, that they can keep chatting here, and that `/workflows` shows live progress.

## 5. When the workflow finishes

- **needs-input**: the plan or audit stage found requirements only the user can settle. Grill those questions the same way, add the answers to the grilling text, and launch again.
- **delivered** or **blocked**: report in plain language that stands on its own — the reader should not have to scroll back or look anything up. Cover what was built and how it was verified; the assumptions the run made without asking (`plan.assumptions`), so the user can object before merging; the PR/MR link (or the manual link and why); for anything blocked, what failed, why, and which branch holds the unfinished work; and what clean-up removed and kept. Describe tasks by what they do, not by their ids.
