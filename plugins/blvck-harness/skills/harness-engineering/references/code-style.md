# Code Style Round

`/blvck-harness:setup` asks this in both modes. Agents write code the way they were told to, or the way their training leans when nobody told them: comments narrating what each line does, ticket numbers and "added for X" notes inside the code, names that drift from the codebase's own. Each habit is small; together they make code harder for the humans who maintain it after the agent has gone. This round settles the rules once, up front.

## 1. Read before asking

Find what the codebase already decided, so every question comes with a recommendation grounded in it:

- Formatter and linter configs (`.editorconfig`, `.prettierrc*`, `eslint.config.*`, `.eslintrc*`, `ruff.toml`, `pyproject.toml`, `.rubocop.yml`, `.golangci.yml`, …) — those rules are enforced by tools; do not restate them, point at them.
- A sample of real source files: comment density, comment language, naming case for variables, functions, types, files, and whether references to tickets or PRs already appear in code.
- Style rules already in the instruction file or a `CONTRIBUTING.md`.

For a new repo with no code yet, recommend the defaults below.

## 2. Ask, in one round

| Question | Recommended default |
|---|---|
| **Comments** — how much? | Explain *why*, never *what*: comment a non-obvious decision, constraint, or workaround; no comment that restates the code. Match the density of the surrounding code. |
| **References in code** — ticket ids, PR numbers, issue links, "added for X", "fix for bug Y"? | Never. They belong in commit messages and PR descriptions, where they stay accurate; in code they go stale and mean nothing to the next reader. |
| **Naming** | Follow what the codebase already does — state it concretely (e.g. `camelCase` functions, `PascalCase` types, `kebab-case` files). Descriptive names over abbreviations. |
| **Comment and identifier language** | The language the codebase already uses (usually English). |
| **Anything else?** | Open question: function size, error-handling style, test naming, import order — only what the user cares about and no tool enforces. |

## 3. Write the section

Write the answers into the instruction file as one section between markers, so a later setup run replaces it instead of appending a second copy. Place it before `## Definition of Done`:

```markdown
<!-- blvck-harness:code-style:start -->
## Code Style

Enforced by tools: `.editorconfig`, `eslint.config.js` — run them, don't restate them.

- **Comments**: explain why, never what. Match the density of the surrounding code.
- **No references in code**: no ticket ids, PR numbers, issue links, or "added for X" notes — they go in the commit message and the PR.
- **Naming**: camelCase functions and variables, PascalCase types, kebab-case file names; descriptive over abbreviated.
- **Language**: English for comments and identifiers.
<!-- blvck-harness:code-style:end -->
```

Rules are concrete and checkable — a reviewer must be able to point at a line and say which rule it breaks. "Write clean code" is not a rule.

## How the rules are used

- Every agent reads the instruction file, so classic mode follows the section with no extra wiring.
- `/blvck-harness:run` passes the section's text to the dynamic workflow as `args.codeStyle` (worktrees of a local-only harness have no instruction file). Implementers must follow it, and reviewers report a violation as **must-fix** — the user chose these rules deliberately, so breaking one is a defect, not a preference.
- The section is not scored: style is the user's choice, and the 25 checks grade whether the harness works, not which conventions it picked. `/blvck-harness:check` notes when the section is missing.
