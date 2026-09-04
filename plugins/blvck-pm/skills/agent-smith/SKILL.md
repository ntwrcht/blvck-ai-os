---
name: agent-smith
description: "Designs specialized subagents as a persona-and-operations definition with an explicit tool and model budget, boundaries against sibling agents, and a delegation test run before the agent ships. Use when creating an agent, writing a subagent, defining an agent persona, reviewing an agent definition file, or planning a roster of specialized agents."
argument-hint: "<agent idea, role, or draft agent file>"
allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)
license: MIT
---

# Agent Smith

Vendored into `blvck-pm` from `ntwrcht/blvck-skills` so it ships with `/plugin install` — a user
who installs the plugin must get the agent builder too, or the interview in `/blvck-pm:setup`
produces a roster it cannot build. Edits made here do not flow back upstream.

Design agents a delegating model reaches for correctly, that stay inside their lane, and that carry only the tools and context their job needs.

## When to Use

Use this skill when the user wants to create, draft, review, or sharpen a specialized agent — a named persona that runs in its own context window with its own tool budget and returns work to whoever delegated to it. It covers the canonical agent definition, the runnable subagent derived from it, tool and model budgets, roster boundaries, and the delegation test that proves the agent gets picked.

## When Not to Use

**A skill is knowledge the current agent loads. An agent is a colleague the current agent hands the work to.** That distinction decides which tool to reach for:

- Instructions that change how *this* agent performs a task, loaded into the running context — that is a skill. Use `skill-smith`.
- Driving agents that already exist through a multi-step plan — use `subagent-driven-development`.
- A one-off role prompt for a single message, never reused — write the prompt, skip the file.

## Artifacts

- Produces: `agents/<name>.md` — the canonical definition (persona + operations). Write it beside an existing roster if the repo already has one; otherwise default to `agents/`.
- Produces: `.claude/agents/<name>.md` — the runnable subagent derived from the canonical file.
- Consumes: the existing agent roster, read for overlap and boundary checks.

Both paths are structural — one is the repo's roster convention, the other is fixed by the agent runtime — so neither is a configurable output location.

## Core Rule

An agent nobody delegates to is a file. Design the routing contract first — name, description, boundaries — then write the persona and workflow that make the delegation pay off.

## Workflow

1. **Name the job, not the topic.** `database` is a topic; `migration-archaeologist` is a job with an output. A name that reads as a role predicts what comes back.
2. **Read the existing roster.** List every sibling agent and its one-line remit. If the new agent's remit is a subset of one already there, extend that agent instead of adding a competitor — two agents that answer the same request make delegation a coin flip.
3. **Set the tool and model budget before writing prose.** See **Tool and Model Budget** below. This decision constrains everything after it: an agent with no write tools cannot promise fixes.
4. **Draft the canonical file.** Load `references/agent-template.md` for the section-by-section structure, the frontmatter fields, and a worked example.
5. **Write the boundary section.** Name the sibling agents this one hands off to and what it declines. An agent with no stated edges expands into its neighbours.
6. **Derive the runnable subagent.** Load `references/subagent-mapping.md` for the field mapping, the description that drives delegation, and what to compress.
7. **Test the delegation.** Load `references/testing-agents.md`. Run the target request without the agent, record what happens, then confirm the agent is picked and returns something the caller can use.
8. **Review against the checklist** below, then register the agent in the roster index if the repo keeps one.

## Two Files, One Source of Truth

The canonical `agents/<name>.md` holds the full persona and operations. The runnable `.claude/agents/<name>.md` is derived from it — compressed, with runtime frontmatter.

Edit the canonical file and regenerate the derived one. Hand-editing the derived file forks the agent: the version that runs and the version that gets reviewed drift apart, and nobody notices until the agent misbehaves in a way the canonical file says it cannot.

## Tool and Model Budget

Every agent declares an explicit tool allowlist and a model tier. An agent granted every tool inherits every failure mode, and one left on the default model is priced by accident rather than by judgment.

| Archetype | Tools | Model | Why this budget |
|---|---|---|---|
| Reviewer, auditor, critic | `Read, Grep, Glob` | opus or sonnet | No write access, so findings stay reviewable instead of silently applied |
| Researcher, explorer | `Read, Grep, Glob, WebSearch, WebFetch` | sonnet | Reads widely, returns a synthesis, changes nothing |
| Implementer, fixer | `Read, Edit, Write, Bash, Grep, Glob` | opus | Needs the full loop, and the judgment to stop |
| Mechanical transformer | `Read, Edit, Bash` | haiku | Deterministic reshaping where a bigger model buys nothing |
| Interviewer, planner | `Read, Grep, Glob` | opus | Produces a document, not a diff |

**Separate the hand from the eye.** An agent that writes code is a poor judge of the code it just wrote — it defends its own choices. Split the reviewer from the implementer rather than granting one agent both budgets.

## Persona That Earns Its Tokens

Every persona line is context the agent pays for on every run, so each one has to change an output.

- "You are a meticulous senior engineer who cares about quality" changes nothing — every model already answers that way.
- "You report 3–5 issues and refuse to raise one without a `file:line` and a reproduction" changes the shape of every response.

Apply the test to each line: **what would this agent produce differently if the line were deleted?** No answer means no line. This is the same no-op failure that bloats skills, and it costs more here — an agent's persona is reloaded on every delegation.

The same test sharpens the `vibe` field. A vibe is a compression handle, not decoration: it should let a reader predict the agent's first move.

## Roster Boundaries

Agents overlap silently. Two symptoms, both worth catching before ship:

- **Ambiguous routing** — a request that two agents would both accept. Cure: sharpen one description until the request fits only one, and name the other in the boundary section.
- **Silent expansion** — an agent that starts fixing what it was asked to review, or documenting what it was asked to design. Cure: remove the tool that permits the expansion, not just the permission to use it.

Once a roster passes roughly five agents, keep a one-line remit per agent in an index so the next agent can be checked against it without reading five files.

## Reference Map

Load `references/agent-template.md` when drafting or reviewing a canonical agent file — it holds the full section structure, frontmatter fields, per-section guidance, and a complete worked example.

Load `references/subagent-mapping.md` when deriving or refreshing the runnable subagent — field mapping, name and description transforms, tool syntax, model values, and what to compress.

Load `references/testing-agents.md` when the agent is drafted and needs proof it works — the three agent-specific failure classes (routing, boundary, contract), scenario formats, and how to close a loophole.

## Review Checklist

Before finalizing:

- Does the name read as a job with an output rather than a topic?
- Does the description say **when to delegate** and **what comes back**, in that order?
- Is there a request two agents in this roster would both accept?
- Is the tool allowlist explicit, and is every listed tool needed for a deliverable the agent actually promises?
- Is the model tier a decision, with a reason someone could argue with?
- Does the agent have write access to anything it is also expected to judge?
- Does every persona line change an output — and would deleting it change behaviour?
- Does the boundary section name real sibling agents that exist?
- Are the deliverables concrete — a named format, a real example — rather than a description of a format?
- Are the success metrics observable by the caller from the returned work alone?
- Does the canonical file stay the only hand-edited copy?
- Was the delegation tested: the agent picked for the request it targets, and passed over for the neighbouring request it should decline?

## Next Step

Do not write the runnable subagent or register the agent until the user has reviewed the canonical draft.

- **If approved:** derive `.claude/agents/<name>.md` per `references/subagent-mapping.md`, add the agent to the roster index if the repo keeps one, and run the delegation test in `references/testing-agents.md` against the live agent.
- **If not approved:** revise the canonical file in place. If the objection is overlap with an existing agent, return to step 2 and decide whether to extend that agent instead. If the objection is that the remit is too broad to test, split it into two agents and draft the narrower one first.
