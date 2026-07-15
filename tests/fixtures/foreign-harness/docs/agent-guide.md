# Agent Guide

This repo has a real harness. It does not use any of blvck-harness's file names, and it does
not use its wording either — every load-bearing phrase here is this project's own.

## Kickoff

1. Confirm the working directory
2. Read this guide end to end
3. Run `make verify` and make sure it is green
4. Open `.harness/features.json` and pick up the current item
5. Skim the newest entry in `journal/` for where the last session stopped

## Single task rule

- One item from `.harness/features.json` per session, start to finish.
- Anything outside that item's scope is a note in the journal, not an edit.

## Acceptance criteria

An item is done only when all of these hold:

- The behaviour it describes actually works
- `make verify` passes, and its output is pasted into the journal as Evidence
- `.harness/features.json` records the outcome
- The repo starts clean from `make verify` for the next session

## Wrap up

- Append a dated entry to `journal/`
- Update the item's state in `.harness/features.json`
- Record blockers and the recommended next step
