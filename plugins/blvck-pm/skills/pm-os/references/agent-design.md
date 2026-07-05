# Agent Design — the Contract

pm-os ships agent *archetypes* (templates), not fixed agents. `/blvck-pm:setup` scaffolds the ones a product needs into that project's `.claude/agents/`, pre-filled with product context. They belong to the user: editable, versioned with the repo, extendable via the agent-builder workflow.

## The contract (every PM agent follows it)

1. **Ground in the vault first.** First action: read `ABOUT-ME/CLAUDE.md`, `ABOUT-ME/anti-style.md`, and `PROJECTS/<product>/CLAUDE.md`. Subagents share files, not conversation — the vault is the context bus. An agent that skips grounding produces generic output.
2. **One job, one lens.** The description says exactly when to spawn it. If a new agent's job overlaps an existing one, extend the existing one.
3. **One output home.** Each agent writes to a single `CLAUDE-OUTPUTS/<type>/` folder with date-stamped names — or returns results to the parent session without writing (workers like research-analyst). Never two agents writing the same file.
4. **Escalate judgment, don't exercise it.** Agents analyze and recommend; decisions that change strategy, scope, or money go back to the PM, stated as options.
5. **Blind means blind.** Review agents must not read other reviews of the same document; independence is the value they add.

## Cost discipline — when to spawn

Spawn agents at high-stakes or high-volume moments; stay single-agent otherwise.

| Spawn | Don't spawn |
|---|---|
| PRD review before engineering handoff (3 blind lenses) | Drafting any document — it needs your answers mid-flight |
| Synthesis across >3 sources (one worker per source) | Synthesis of ≤3 sources |
| Teardown of a competitor while you keep working | Weekly updates, RICE tables, decision-log entries |
| Prototype build (long-running, isolated repo) | Quick edits to existing docs |

Every workflow that can spawn agents has a single-agent fallback — a vault with no `.claude/agents/` still works fully.

## Minting a new agent (agent-builder workflow)

1. Define: the job in one sentence, the spawn moments, the output folder.
2. Copy the closest archetype's skeleton: frontmatter (name + spawn-trigger description) → grounding ritual → lens and rules (5–8, each one testable) → output contract → escalation line.
3. Fill product placeholders from the vault (product, stage, NSM, terminology).
4. Write to `.claude/agents/<name>.md`; add it to the roster in `pm-os.config.md`.
5. Test it once on a real task; tighten the rules that didn't bite.
