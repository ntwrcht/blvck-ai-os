# Proposal: A codebase registry for the PM vault

**Status:** Built in blvck-pm 2.2.0 (feat-016) · **Plugin:** blvck-pm (touches blvck-harness) · **Target:** blvck-pm 2.2.0 · **Date:** 2026-10-04

## Summary

A technical PM or solo founder should plan against the real code without leaving the vault. Each vault keeps a **registry** of the codebases it needs. An entry is a path, and the path can point anywhere: **inside the vault at `CODE/<repo>/` by default**, or at a shared clone outside it. The vault reads the code to plan; the user builds by starting a session inside the repo. Before citing code, pm-os checks that the clone is fresh.

## Problem

| Today | Effect |
|---|---|
| Agents have `Read, Grep, Glob` but no declared place where code lives | Each vault hardcodes its own answer in prose (`~/botnoi-sme`, `repositories/`), and the plugin can't check it |
| Clones go stale | In real use a clone sat 26 commits behind, and a task was generated from old code before anyone noticed |
| A nested repo inherits the vault's root CLAUDE.md | Vault rules ("repositories are read-only", "write to `CLAUDE-OUTPUTS/`") blocked merges and edits in coding sessions |
| The validator and migrate walk every file | A repo's `{{...}}` blocks the vault, a large repo uses up the 4,000-file walk cap, and migrate misreads a repo's README as PM material |

**Job to be done:** *When I plan a feature for a product I also build, I want my PM context and the real code in reach together, so my plans hold up against what the code does today.*

## Target user

A solo founder, technical PM, or PM who writes code in some repos and only reads others. Not targeted: PMs on teams where they never touch code.

## Evidence from real use

Two production vaults, reviewed 2026-10-04, plus about 140 session transcripts:

| | `~/botnoi` | `~/botnoi-voice` |
|---|---|---|
| Where code lives | Outside, `~/botnoi-sme` (23 repos) | Inside, `repositories/` (4 repos) |
| Vault root has CLAUDE.md | Yes | Yes |
| How code gets read | 42 of 86 sessions read `~/botnoi-sme` through Bash, with no access denials | A named agent (`Sam`) reads `develop` read-only; ~80 `git show` / `git grep develop` uses |
| Building | In sessions started inside the repo | In sessions started inside the repo (23 sessions); "it's fine when I start the session inside the repository" |

| Finding | Design consequence |
|---|---|
| The user commits heavily to repos the vault treats as read-only (58 and 66 commits in 90 days) | The registry tracks **scope** (mine vs dependency), not write permission. Access depends on where the session starts. |
| `bn-point-service` and `bn-payment-gateway` are needed by both vaults | A repo must be able to serve two vaults, so a path can point outside |
| The root CLAUDE.md loaded in every nested-repo session and blocked `git merge`, `git switch` and an edit | The validator warns when a codebase is nested under a root CLAUDE.md |
| The user hand-wrote "pull before you cite, read `develop`, pin the commit" | Freshness becomes a built-in rule |
| Repo sessions got PM context from Jira or GitLab tickets, never from the vault | Finding the vault from inside a repo is a nice-to-have, not the core |
| Engineers can't open vault-local files linked from issues | Out of scope here, recorded as a related finding |

## Proposed shape

```
vault/
├── pm-os.config.json        # holds the registry
├── ABOUT-ME/
├── PROJECTS/<product>/
├── CLAUDE-OUTPUTS/
├── .claude/agents/
└── CODE/                    # default home; each repo keeps its own git
    └── billing-api/
```

```json
"codebases": [
  { "name": "billing-api",      "path": "CODE/billing-api",              "scope": "mine",       "branch": "main" },
  { "name": "bn-point-service", "path": "~/botnoi-sme/bn-point-service", "scope": "dependency", "branch": "develop" }
]
```

| Field | Meaning |
|---|---|
| `path` | Anywhere. `CODE/<repo>` is the default that setup suggests. |
| `scope` | `mine`: work here is a task in my plan. `dependency`: work here belongs to a named owner and goes in the plan as a dependency. |
| `branch` | The branch planning reads. Defaults to the repo's default branch. |

## Decisions

| Decision | Reason |
|---|---|
| **One registry; a path can point anywhere** | Inside and outside are one mechanism with different path values, not two modes. Two modes would drift into parallel implementations, the failure blvck-harness's adapted layout was designed to avoid. |
| **Inside (`CODE/`) is the default** | User's choice: one folder is the simplest start for a new vault. A fresh vault has no root CLAUDE.md, so nothing leaks. Outside is for repos shared across vaults or already checked out elsewhere. |
| **Scope, not write permission** | Evidence: the user writes code in repos the vault treats as read-only. Access follows where the session starts: the vault root plans and reads, and a session inside the repo builds. |
| **Built-in freshness rule** | Before citing code, pm-os records the commit the work is pinned to and names it in the output. If the repo is on `branch` with a clean tree, it runs `git pull --ff-only`. If not (another branch, uncommitted work, or a pull that can't fast-forward), it leaves the working tree alone, runs `git fetch`, and reads `origin/<branch>` through git (`git show`, `git ls-tree`, `git grep`), the way the `Sam` agent already does. It never checks out, switches, stashes, merges or resets: the user may be mid-build in that clone. |
| **Leak check for nested repos** | If a codebase sits inside the vault and the vault root has a CLAUDE.md, the validator **warns** that it loads in every coding session there. A warning, not a block: some users may want that context. |
| **The leak warning can be acknowledged** (added after the first real migrate) | `"rootClaudeMd": "accepted"` on an entry silences that entry's warning. On `~/botnoi-voice` the user deliberately scoped the root rule, and all four warnings still showed on every run; a warning that can never be answered trains people to ignore warnings. Same rule as a document's `## Completeness` section: a recorded trade-off is a decision. |
| **Skip every nested repo when walking the vault** | A repo is any subfolder with its own `.git`. Deciding by what a folder *is*, not its name, means a vault with no nested repos sees zero change. |
| **PM agents run from the vault root** | Tested: a session started inside a nested repo sees only that repo's agents. PM agents are for planning, and a vault-root session can read every registered codebase. |
| **Vault inside a product repo stays as is** | That vault already lives with its code. |

## What would change

### blvck-pm

| Area | Change |
|---|---|
| `pm-os.config.json` | New optional `codebases` array (`name`, `path`, `scope`, `branch`). `~` expands to the home directory. Codebase paths are exempt from the inside-the-vault rule, because they earn no points; `paths` keep that rule unchanged. |
| `pm-os` skill | Reads code only through the registry, applies the freshness rule before citing, and states the pinned commit in any output that cites code. |
| `/blvck-pm:setup` | One question: "Do you write or read code for this product?" If yes, suggest `CODE/`, add nested repos to `.gitignore` when the vault is a git repo, and offer `/blvck-harness:setup` for `mine` repos. |
| `/blvck-pm:migrate` | Finds repos inside the vault and repo paths named in the vault's own CLAUDE.md and agents, then offers to declare them. See below. |
| `validate-vault.mjs` | Skip nested repos in the walk. Mechanical checks only: a declared codebase path exists (blocking, like every declared path), the leak warning, and a `mine` repo has `CLAUDE.md` and `init.sh` (passes when no codebases are declared). It never scores a repo's harness: `vault-utils.mjs` and `harness-utils.mjs` share no code on purpose. |
| Agent templates | `lead-engineer` and `prototype-builder` read from the registry. `prototype-builder` builds in `CODE/<repo>/`. |

### blvck-harness

Planned separately: agent templates move into blvck-harness so it can help users set up agents inside a repo. This proposal does not depend on it.

## Migrating from earlier versions

Every existing vault keeps working unchanged, since the registry is optional. Adoption goes through `/blvck-pm:migrate`.

**Migrate is a helper, never a gate.** It shows how the vault maps onto the plugin's concept (registry, `CODE/` default, scope, freshness) and recommends a step, but nothing changes without the user's yes, and every step is skippable. A vault that declines everything is still a valid vault and scores the same as before.

| Existing vault | Path |
|---|---|
| **1. No code** | Migrate asks whether to register codebases; a no changes nothing |
| **2. Repos already inside** (like `botnoi-voice/repositories/`) | Declare them where they stand. No move is needed, since paths can point anywhere. Raise the leak warning if the root has a CLAUDE.md. |
| **3. Repos outside** (like `botnoi` → `~/botnoi-sme`) | Offer the default (move into `CODE/`) or declaring them where they stand. The plan names what a move costs: the repo loses its past Claude Code sessions and memory, which are stored by path, and a repo another vault also needs can't move. |
| **4. Vault inside a product repo** | Leave as is |

Moving a repo is a plain rename on the same disk. Across disks it is copy-and-delete: migrate asks first, and deletes the original only after `git status` is clean and `HEAD` matches. Before moving, migrate warns that editor workspaces, aliases and scripts pointing at the old path will break.

**Agents in older vaults are never rewritten.** Both production vaults run fully custom rosters, none from the plugin's eight archetypes, so updating the bundled templates would reach nobody. Migrate lists the agents whose files mention code paths and suggests pointing them at the registry, and the user edits them.

## Version

**MINOR** (blvck-pm 2.2.0), checked against the code:

| Change | Effect on an existing vault |
|---|---|
| New `codebases` field | None. The loader rejects unknown path roles, not unknown top-level keys. |
| Outside-the-vault exemption | Applies only to `codebases`; `paths` keep the rule |
| Codebase checks | None for vaults without codebases. The `mine`-has-harness check passes when none are declared, so x/n becomes (x+1)/(n+1), which never lowers a score. |
| Skipping nested repos | None without nested repos. With them, the vault can only lose false blocks. |
| Completeness gate | None. It reads only `vision` and the outputs dir. |

## Open questions

None. All decisions are recorded above.

## Out of scope

- PM teams where the PM never touches code
- Running PM agents from inside a code repo
- Finding the vault from inside a code repo. Dropped 2026-10-04: in real use, coding sessions got PM context from tickets, never the vault. Revisit when someone asks.
- Scoring a codebase's harness from blvck-pm
- Putting PM content into tickets instead of vault-local links (real finding; separate proposal)

## Related findings (fix separately)

- `assertInsideRoot` in `vault-utils.mjs` compares paths as text and does not follow symlinks, so a symlink inside the vault pointing outside passes for every `paths` entry. Fix: resolve with `realpath` before comparing, and add an `init.sh` case.
- Repo-level and vault-level skills with the same name collide (`write-a-story` appeared in both). Worth a naming rule when blvck-harness gains agent templates.
