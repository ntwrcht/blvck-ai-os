---
description: Start the next feature, or several at once in dynamic mode — grill unclear requirements, then run them (dynamic workflows or classic ritual)
argument-hint: "[feature-id ...] [--brief <path> ...]"
disable-model-invocation: true
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
---
Start work on one feature in the current repository, or on several at once in dynamic mode.

`$ARGUMENTS` can name tracker features, or hand over briefs with `--brief <path>` (repeatable). A brief is a Markdown file someone already wrote for one unit of work: its goal, where in the code, acceptance checks, edge cases, and what is out of scope. It becomes a tracker feature (step 2) and settles most of the grilling (step 3).

## 1. Read the harness

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/scripts/validate-harness.mjs --target . --json`.

- Exit **2**: the map or `.claude/harness-workflow.json` is broken. Show the error, suggest `/blvck-harness:setup`, and stop.
- `unscored`: there is no harness here to run. Suggest `/blvck-harness:setup` and stop.
- Keep `layout`, `resolution`, `workflow.mode`, and `visibility` — the next steps use them.

## 2. Pick features

Read the tracker from `resolution.featureTracker.sources` (adapted layouts included — the real file is named there). List features that are not done and whose dependencies are all done.

- **Classic mode** runs one feature. If `$ARGUMENTS` names more than one, say classic mode works one feature at a time, and ask which to start.
- **Dynamic mode** can run several. If `$ARGUMENTS` names features, use them; otherwise recommend the first ready one and offer to add more. A picked feature may also depend on another picked feature that is not done yet: it is **stacked** and starts after that one delivers (step 4b). Refuse a feature whose dependencies are neither done nor picked, and name the missing one.

### Briefs

For each `--brief <path>`, before listing features:

1. Read the brief. A missing or unreadable file stops the run with its path. The brief may live outside this repository.
2. Take the feature id from the brief's frontmatter `ticket`, else `id`, else the file name without its date and extension. The name is the frontmatter `title` (or the first heading) without the id.
3. If the tracker already holds that id, use that entry and do not add a second one. If it is done, say so and leave it out of the run.
4. Otherwise add it to the tracker in its own layout: solo appends to `feature_list.json`; team writes `features/<id>/status.json` from the team template; adapted writes through the map's `shape.fields` to the declared source. If the adapted shape cannot hold a new entry safely, show the entry and ask where it goes. Use `status: "not-started"`, no dependencies unless the brief names a tracker feature it needs, and a description of the brief's goal in one or two sentences ending with `Brief: <path>`.
5. Run the validator again. Exit 2 means the entry broke the tracker: undo it and show the error.

A brief's feature is picked for this run. Its branch follows this repository's convention (`delivery.branchPrefix` plus the id in dynamic mode), not a branch the brief names.

Every picked feature gets its own feature branch, so a dynamic batch opens one PR/MR per feature. In **team** layout, check nobody else has claimed each one, then write the user's `owner` and the branch into each `status.json` and commit the claims together (ask before pushing them).

## 3. Grill

Settle every requirement an agent would otherwise have to guess, here in this session — workflow agents cannot ask the user anything.

A feature that came from a brief starts with its answers already given: its acceptance checks are the done criteria, its edge cases are settled `Q: … A: …` lines, and its out-of-scope list is a constraint. Read the code it cites first. Then ask only about what is still open: a check that is not binary, a path or line that no longer matches the code, a contradiction between the brief and the code or another picked feature, or a requirement it leaves out. When nothing is open, say the brief settles it and continue without asking. Its grilling text is the brief's settled lines plus any new answers, and names the brief's path.

- If `.claude/harness-workflow.json` names `grilling.skill` and that skill is available, use it.
- Otherwise follow the built-in [grilling style](${CLAUDE_PLUGIN_ROOT}/skills/harness-engineering/references/grilling-default.md).

Read the code and tracker first so you only ask what they cannot answer. End with the confirmed requirements as `Q: … A: …` lines plus checkable done criteria.

With several features, grill all of them now, one at a time and labelled by feature id, before anything launches. A stacked feature starts later with no chance to ask, so settle its questions here too. Ask where two picked features meet (a shared file, an API one exposes and the other uses) once, and add the answer to both features' requirements.

## 4a. Classic mode

Follow the instruction file's Startup Workflow, implement the feature yourself within its Working Rules, verify, and finish with its End of Session steps. Stop here.

## 4b. Dynamic mode

Pre-flight, in one message:
- With several features, say how many workflows run at once (`batch.maxFeatures`, 3 when the config has none), which features wait for a dependency, and that each running workflow uses its own stage ceilings, so the token cost adds up.
- Uncommitted changes in this checkout are invisible to the workflow's worktrees, which start from committed branches. If there are any that the feature depends on, ask the user to commit them first.
- If `delivery.host` is `github` or `gitlab`, check `gh auth status` or `glab auth status`. If not signed in, say the run will push the branch and hand back a link to open the PR/MR by hand.

Then launch the workflows with the Workflow tool — the user typing this command is the opt-in. Each feature gets its own launch, so it gets its own progress view, result, and branch.

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
  - `siblings`: with several features, the other picked features as `[{ "id": …, "name": … }]`, leaving out the ones this feature stacks on; omit it for one
  - `stackOn`: for a stacked feature, the `featureBranch` of each picked dependency, from that dependency's delivered result; omit it otherwise

Launch order:

1. Launch every picked feature whose dependencies are all done, up to `batch.maxFeatures`, in one message so they start together. Copy the script once; every launch uses the same `scriptPath`.
2. Hold the rest in a queue: features over the limit, and stacked features waiting on a picked dependency.
3. Each time a workflow finishes (step 5), launch from the queue: first any stacked feature whose picked dependencies have all **delivered**, then the next ready one, keeping no more than `batch.maxFeatures` running.

Tell the user what is running and what is queued, that it all runs in the background, that they can keep chatting here, and that `/workflows` shows live progress.

## 5. When a workflow finishes

Handle each result as it arrives; the other workflows keep running.

- **needs-input**: the plan or audit stage found requirements only the user can settle. Grill those questions the same way, add the answers to that feature's grilling text, and launch it again. Features stacked on it keep waiting.
- **blocked** with a stacked dependent: do not launch the dependent, because it would build on unfinished work. Report it as skipped, naming the blocked feature, so the user can run it alone later.
- **delivered** or **blocked**: report in plain language that stands on its own — the reader should not have to scroll back or look anything up. Cover what was built and how it was verified; the assumptions the run made without asking (`plan.assumptions`), so the user can object before merging; the PR/MR link (or the manual link and why); for anything blocked, what failed, why, and which branch holds the unfinished work, plus any task that never started because a task it needed failed; and what clean-up removed and kept. For a stacked feature, say its PR/MR also shows the work it builds on until that merges, so the dependency's PR/MR merges first. Describe tasks by what they do, not by their ids.
- When the last workflow of a batch finishes, end with one table: each feature, its outcome, and its PR/MR link or the reason it stopped.
