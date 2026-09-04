# Voice & Writing Rules

Defaults for every pm-os output. The vault's `ABOUT-ME/anti-style.md` extends (never weakens)
these.

The rules come in two kinds, and the difference matters once a vault writes in a language other
than English: **structural rules hold in every language, lexical rules do not.** A banned-word
list written for English says nothing about a Thai PRD, and applying it there produces the
illusion of a style check rather than a style check.

## Structural rules — every language

- Lead with the conclusion or the ask (pyramid principle)
- Active voice, with the actor named
- Concise: one sentence beats two; paragraphs ≤3 sentences
- Numbers over adjectives; name the evidence or mark the assumption
- Never open by validating the question; never close with a summary of what was just said
- One clarifying question when intent is ambiguous — ask it, don't guess

## Lexical rules — English (`language: en`)

Banned outright:

- "Leverage" as a verb; "synergy"; "ecosystem"; "delightful"; "learnings"; "actionable
  insights"; "move the needle"; "low-hanging fruit"; "robust" as generic praise

For a vault set to another language, these do not apply. Write the equivalent list for that
language in `ABOUT-ME/anti-style.md` — the vault's own list is always authoritative for its
own language. English ships as the only bundled list; others are user-supplied.

## Document conventions — every language

- Markdown headers and tables; bullets for lists of 3+
- Date-stamp recurring artifacts: `update-2026-07-05.md`
- File naming: `[artifact-type]-[description]-[YYYY-MM-DD].md` — the artifact type stays in
  English even when the content is not, so sorting and tooling keep working
- Versioned docs (PRDs): `-v1`, `-v2`; supersede to `_archive/`, never delete

## Which language

`pm-os.config.json`'s `language` decides. Default `en`. Do not infer the language from
what the user typed in chat — a PM who asks a question in one language often needs the document
in another, and an inferred language changes between documents in the same vault, which makes
`anti-style.md` unenforceable.
