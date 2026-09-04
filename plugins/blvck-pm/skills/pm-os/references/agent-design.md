# Agent Design — the Contract

pm-os ships agent *archetypes* — **structures, not a default team**. There is no roster every vault
gets. `/blvck-pm:setup` asks who the PM normally has to go ask, maps the answer onto the catalog,
and scaffolds only those into `.claude/agents/`, pre-filled with product context. They belong to
the user: editable, versioned with the repo.

The catalog is a starting shape, not a limit. Anything the interview surfaces that has no
archetype gets built with the bundled **`agent-smith`** skill, which ships with this plugin and
enforces the parts that are easy to skip: an explicit tool and model budget, boundaries against
sibling agents, and a delegation test before the agent is used in anger.

## The contract (every PM agent follows it)

1. **Ground in the vault first.** First action: read `ABOUT-ME/CLAUDE.md`, `ABOUT-ME/anti-style.md`, and `PROJECTS/<product>/CLAUDE.md`. Subagents share files, not conversation — the vault is the context bus. An agent that skips grounding produces generic output.
2. **One job, one lens.** The description says exactly when to spawn it. If a new agent's job overlaps an existing one, extend the existing one.
3. **One output home.** Each agent writes to a single `CLAUDE-OUTPUTS/<type>/` folder with date-stamped names — or returns results to the parent session without writing (workers like research-analyst). Never two agents writing the same file.
4. **Escalate judgment, don't exercise it.** Agents analyze and recommend; decisions that change strategy, scope, or money go back to the PM, stated as options.
5. **Blind means blind.** Review agents must not read other reviews of the same document; independence is the value they add.

## Tool and model budget

Every archetype declares `tools` and `model` in its frontmatter. Both are decisions, not
boilerplate:

| Archetype | Model | Why |
|---|---|---|
| `research-analyst` | haiku | Fans out one worker per source above 3 sources — the highest-volume agent in the roster, and the only place a cheaper model shows up on a bill |
| `board-executive` | opus | One invocation, entirely judgment |
| everything else | sonnet | Review and analysis at one invocation each |

Read-only agents get `Read, Grep, Glob` and nothing more. `prototype-builder` is the only one
with write and shell access, because building is its job.

An honest limit: a tool allowlist cannot express "read this file and no other", so
`blind-reviewer`'s independence is still carried by its instructions. Denying it write access
makes it structurally unable to contaminate the document under review; it does not make it unable
to read a sibling review. Do not describe that guarantee as stronger than it is.

## Cost discipline — when to spawn

Spawn agents at high-stakes or high-volume moments; stay single-agent otherwise.

| Spawn | Don't spawn |
|---|---|
| PRD review before engineering handoff (3 blind lenses) | Drafting any document — it needs your answers mid-flight |
| Synthesis across >3 sources (one worker per source) | Synthesis of ≤3 sources |
| Teardown of a competitor while you keep working | Weekly updates, RICE tables, decision-log entries |
| Prototype build (long-running, isolated repo) | Quick edits to existing docs |

Every workflow that can spawn agents has a single-agent fallback — a vault with no `.claude/agents/` still works fully.

## Minting a new agent

Load the bundled `agent-smith` skill and follow it — it covers the budget, the roster boundary,
and the delegation test properly. What it does not know is this vault, so bring:

1. The job in one sentence, the spawn moments, the single output folder.
2. The grounding ritual every PM agent shares: read the identity file, `anti-style.md`, and the
   product context before anything else. Subagents share files, not conversation.
3. Product placeholders filled from the vault (product, slug, stage, NSM, terminology).
4. Registration: write to `.claude/agents/<name>.md` and add it to the roster in
   `pm-os.config.json` — `/blvck-pm:validate` fails on a roster that names a file that is not
   there, and on a file no roster mentions.

Refuse an agent whose job overlaps an existing one. Extend the existing one instead — two agents
with the same lens produce two answers and no way to choose between them.
