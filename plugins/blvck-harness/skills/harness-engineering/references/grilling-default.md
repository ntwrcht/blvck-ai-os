# Built-in Grilling Style

`/blvck-harness:run` grills the user in the main session before a dynamic run, because workflow agents cannot ask the user anything. When the config's `grilling.skill` is installed, use that skill instead. This file is the fallback, so a user without it still gets requirements settled before agents start building.

## Goal

Leave the session with every done criterion checkable and no requirement an agent would have to guess. Questions that the code or the tracker can answer are not for the user; read first, then ask only what remains.

## Method

1. **Read before asking.** Read the feature's tracker entry, the instruction file, and the code it will touch. Note what is already decided.
2. **Map the decisions as a tree.** List what has to be decided for this feature: behavior, inputs, failure paths, who can do it, what "done" looks like. A decision that depends on another one waits until its parent is settled.
3. **Ask every unblocked question in one round.** For each one, give your recommended answer and the reason for it, so the user can reply "yes" to most of them. Use `AskUserQuestion` when the answers are choices; plain text when they are open.
4. **Repeat** until nothing that blocks the plan is left open. Usually two rounds; stop when the remaining questions would not change what gets built.
5. **Reflect it back.** Restate the confirmed requirements as done criteria a test or command can check, and get a yes.

## What to probe

- **Ambiguous words.** "Fast", "simple", "support X". Ask what number or behavior would make it true.
- **The failure path.** What happens when the input is empty, the call fails, the user lacks permission.
- **Scope edges.** What is explicitly not part of this feature, so no agent builds it.
- **Existing behavior.** What must keep working exactly as it does now.

## Output

Hand `/blvck-harness:run` the confirmed requirements as plain text, one decision per line in the form `Q: … A: …`, followed by the done criteria. That text goes to every agent in the run as `args.grilling`.

## Don't

- Don't ask one question per message — batch every unblocked question.
- Don't ask what the code already answers.
- Don't start the workflow while a question that changes the plan is still open; the run would stop at the plan or audit stage and ask anyway.
