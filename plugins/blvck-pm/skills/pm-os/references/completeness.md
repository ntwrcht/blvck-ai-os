# Completeness — What "a Complete Plan" Means

A plan is complete when the fields that let someone else act on it are filled. This file holds
the default checklists, how they are adjusted, and how the gate behaves.

## The gate warns, it never blocks

"Do the tests pass" is not arguable. "Is this plan complete" always is — a founder running an
experiment may knowingly ship a plan with no success metric, and a tool that refuses to let
them is a tool they stop opening.

So the gate does three things and nothing more:

1. Names every unmet item, with the section it belongs to
2. Offers to fill them, one at a time
3. If the user proceeds anyway, **records the override in the document itself**

Never rewrite a document to satisfy a checklist without being asked. A silently completed plan
is worse than an openly incomplete one, because the gaps stop being visible.

## Recording an override

Append to the bottom of the document. This is the only place the gate writes on its own:

```markdown
## Completeness

Released incomplete on [YYYY-MM-DD]. Unmet at that time:
- Success metric — no baseline available yet
- Rollout gating metric — deliberately deferred until beta feedback
```

Keep the user's stated reason. "Unmet" without a reason is a defect; "unmet because" is a
decision. If the user gives no reason, write `no reason given` rather than inventing one.

## Default checklists

Defaults only. `pm-os.config.md`'s `## Completeness` section overrides them per vault — a user
whose process does not produce one of these fields removes the line rather than failing forever.

**vision** — the change described in user terms, the specific person it serves, at least 3
outcomes each with a metric, at least one exclusion, the bet named, a review date

**prd** — problem with evidence (a quote or a number, not an assertion), job-to-be-done, link
to the NSM or an L1/L2 metric, at least one success metric with baseline and target, at least
one Must requirement with testable acceptance criteria, out-of-scope non-empty, user states
covered for every new surface, rollout tier with a gating metric

**lightweight-spec** — problem, scope boundary, at least one acceptance criterion, owner

**one-pager** — the ask in the first three lines, options considered, recommendation, what
happens if the answer is no

**prfaq** — press release under one page, customer quote, at least three anticipated hard
questions answered

**rice** — every row has all four scores, effort attributed to engineering rather than
estimated by the author, any item scored below 50% confidence routed to discovery instead

**metrics-tree** — NSM passes the three tests (measures user value, correlates with revenue,
the team can move it), every L1 has a formula and a source, at least one counter-metric

**tracking-plan** — every event names the question it answers, destination table or tool
identified, owner for implementation

**gtm-brief** — positioning statement complete before any channel is listed

## Adjusting them

`pm-os.config.md`:

```markdown
## Completeness

Overrides the defaults in the pm-os skill. Omit a document type to keep its defaults.

- prd: drop "rollout tier with a gating metric"      # we gate in the tracker, not the PRD
- prd: add "pricing impact stated"                   # every PRD here touches pricing
- prfaq: skip                                        # we do not write these
```

Three verbs, and nothing else: **drop** removes a default item, **add** appends one, **skip**
turns the gate off for that document type entirely. Anything else is a config error — say so
and keep the defaults rather than guessing at the intent.

## What the gate does not do

- It does not judge quality. "Has a success metric" is checkable; "has a *good* success metric"
  is a conversation, and belongs in `/blvck-pm:validate` or a review agent, not in a gate
- It does not compare against other documents. A PRD contradicting the vision is a real
  problem and a different feature
- It does not run unasked. The gate fires when a document is finished or when the user asks
  whether it is ready — never mid-draft, where every document is legitimately incomplete
