# Built-in Grilling Style

`/blvck-pm:run` settles the requirements in the main session before any work starts, because workflow agents cannot ask the user anything. When the workflow config's `grilling.skill` names an installed skill, use that skill instead. This file is the fallback, so a user without one still gets the brief settled before agents start writing.

## Goal

Leave the session with a brief an agent can act on without guessing anything the PM would notice. Questions the vault can already answer are not for the user. Read the vault first, then ask only what remains.

## Method

1. **Read before asking.** Read the product context, the vision, the roadmap outcome this work serves, and any document the work builds on. Note what is already decided.
2. **Map the decisions as a tree.** List what has to be decided for this piece of work. A decision that depends on another one waits until its parent is settled.
3. **Ask every unblocked question in one round.** For each one, give your recommended answer and the reason for it, so the user can reply "yes" to most of them. Use `AskUserQuestion` when the answers are choices, and plain text when they are open.
4. **Repeat** until nothing that changes the document is left open. Usually two rounds are enough. Stop when the remaining questions would not change what gets written.
5. **Reflect it back.** Restate the brief and get a yes.

## What to settle, by pipeline

| Pipeline | Settle before the run |
|---|---|
| **prd** | The job-to-be-done, the evidence for the problem (a quote or a number), the success metric with baseline and target, what is out of scope, and the sources the discover stage should read |
| **research-synthesis** | The question the synthesis answers, and the exact sources: files, folders, or Drive documents. One analyst reads each source, so a vague source list means wasted agents |
| **competitor-teardown** | The competitors by name, the dimensions to compare (pricing, positioning, a specific job), and the sources each analyst may use |
| **prd-review** | The document to review, what decision it feeds (engineering handoff, exec approval), and which lenses matter most |

## What to probe

- **Ambiguous words.** "Faster", "simpler", "enterprise-ready". Ask what number or behavior would make it true.
- **Evidence.** Where each claim about users or metrics comes from. An unsourced claim becomes an assumption in the document, so it is better settled now.
- **Scope edges.** What the document explicitly does not cover.
- **Audience.** Who reads the result, and so which writing rules apply (`anti-style.md`'s internal-references rule).

## Output

Give `/blvck-pm:run` the confirmed brief as plain text, one decision per line in the form `Q: … A: …`. Then list the inputs (sources, competitors, or the document) separately, because they become the run's parallel work.

## Don't

- Don't ask one question per message. Batch every unblocked question.
- Don't ask what the vault already answers.
- Don't start the workflow while a question that changes the document is still open. The draft stage would stop and ask anyway.
