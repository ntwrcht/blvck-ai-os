# Security Policy

## Reporting a vulnerability

Please report security issues privately to **s.worachote01@gmail.com**, or via
[GitHub private vulnerability reporting](https://github.com/ntwrcht/blvck-ai-os/security/advisories/new).

Please don't open a public issue for a vulnerability. Include what you found, how to
reproduce it, and what an attacker could achieve. Expect an initial response within
7 days.

## Supported versions

The latest released version of each plugin receives fixes. See each plugin's
`CHANGELOG.md`.

## What these plugins do on your machine

Installing a Claude Code plugin means running someone else's instructions in your sessions.
Worth knowing about this one:

- **`blvck-harness` bundles executable scripts.** `create-harness.mjs` and
  `validate-harness.mjs` run via Node against a `--target` directory you name. They write
  harness artifacts to that target.
- **Skills can read their own bundled files without prompting.** Both skills declare
  `allowed-tools: Read(${CLAUDE_PLUGIN_ROOT}/**)`, scoped to the plugin's own directory so
  references and templates load without a permission prompt. This grants no access to your
  project, home directory, or credentials.
- **Write commands are user-initiated only.** `setup` and `migrate` set
  `disable-model-invocation: true`, so Claude cannot decide to scaffold or migrate your
  files on its own — you type the command.
- **Nothing is deleted.** `migrate` moves files to a backup, with per-group confirmation
  and a plan shown before any write.
- **No network calls, no telemetry, no MCP servers, no hooks.** The plugins ship skills,
  commands, templates, and two local Node scripts.

## Verifying what you install

```bash
claude plugin details blvck-harness   # component inventory + token cost
claude plugin validate ./plugins/blvck-harness --strict
```

The source is small and readable — the skills and commands are plain markdown. Reading them
before you trust them is encouraged.
