# Testing an Agent Before It Ships

An agent that reads well is not an agent that works. Three things can fail independently, and only the third is what agent authors usually check.

| Failure class | Symptom | Where the fix lives |
|---|---|---|
| Routing | The agent is never picked for the request it was built for | Description sentences 1 and 2 |
| Boundary | The agent is picked for a neighbouring request it should decline | Description boundary clause, `What You Don't Do`, tool list |
| Contract | The agent is picked correctly and returns something the caller cannot use | Deliverables, workflow completion criteria, success metrics |

Run all three before the agent is registered. A routing pass with a contract failure is worse than no agent — the work is delegated and comes back unusable.

## The Cycle

The same red-green loop that tests a discipline, aimed at delegation.

**RED — run the target request with no agent available.** Record what happens verbatim: which files got read, what the answer looked like, where it stopped short. This is the baseline the agent has to beat, and it is the step most often skipped. Without it the agent is written against imagined failures.

**GREEN — enable the agent and run the same request.** Three checks, in order:

1. Was the agent picked without being named?
2. Did it stay inside its boundary — no edits from a read-only reviewer, no design work from a documenter?
3. Is the returned artifact the shape the description promised?

**REFACTOR — run the neighbour.** Issue the adjacent request the agent should decline. If it accepts, the boundary is too soft; if a sibling agent also accepts the original request, the roster has a routing collision.

## Scenario Formats

Write three scenarios, and keep them with the agent so a later change can be re-run against them.

- **The bullseye** — the request the agent exists for, phrased the way a caller would actually type it, never using the agent's name.
- **The neighbour** — the adjacent request owned by a sibling agent. Expected outcome: not picked, or picked and handed back.
- **The pressure case** — the bullseye plus a reason to cut corners: a deadline, a request to "just give me the short answer," a caller who says the analysis is probably unnecessary. This is where a rule with a compliance cost gets abandoned, and where the canonical file's `Critical Rules` earn their place.

## Closing a Loophole

When a run fails, the fix is chosen by failure class, not by adding prose:

1. **Sharpen the description** when the agent was not picked, or was picked wrongly. Almost every routing failure is a description failure.
2. **Remove a tool** when the agent did something it should not have. A boundary that depends on the agent choosing not to use a tool is a request, not a boundary.
3. **Tighten a completion criterion** when the agent stopped early. Replace the fuzzy step with one that names what must exist before it can be called done.
4. **Add the excuse to Critical Rules** when the agent talked itself out of the work — using its own words from the failed run, phrased as the positive rule it violated.

Re-run all three scenarios after each fix. A fix that closes one loophole regularly opens another, usually by broadening the description until the neighbour starts matching.

## When to Skip

An agent with no rule to violate — a pure lookup or formatting agent — has nothing to pressure-test. Run the bullseye and the neighbour, skip the pressure case.
