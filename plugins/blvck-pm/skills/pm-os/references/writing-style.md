# Writing Style Round

`/blvck-pm:setup` runs this round in both modes, on a new vault and on reconfigure. Every document the vault produces follows the answers, and every agent reads them through its grounding step. They are not scored, because voice is the user's choice. Without them, agents fall back to their own habits.

Read before asking. Look at what the vault already says: the existing `anti-style.md`, the identity file, and two or three recent documents in the outputs folder. A rule the user already follows in practice is a confirmation question, not an open one. Give a recommended answer for each question, with a one-sentence reason, and ask them all in one message.

## Questions

| Topic | Ask | Recommend |
|---|---|---|
| **Banned words** | Which words or phrases must never appear? | Start from the bundled English list (`references/voice.md`), plus any list in `~/.claude/CLAUDE.md`, and add their own |
| **Tone** | How should documents sound? Pick from direct / formal / warm, and name anything they dislike in AI writing | Direct: the conclusion first, active voice with the actor named, numbers over adjectives |
| **Output language** | Which language should documents be written in? | Keep the current `language`; default `en`. For anything other than `en`, the banned-word list must be written in that language, because the bundled list is English only. For a Thai vault, offer the `kien-thai` skill when it is installed |
| **Internal references** | May ticket ids, internal codenames, repo names, or internal links appear in documents that go to customers or executives? | **Never in outward documents.** A customer or an executive cannot open `BILL-1423`, and a codename tells them nothing. Internal working documents (PRD, spec, research) may carry them |

Outward documents are the PR/FAQ, GTM brief, weekly update, launch checklist, one-pager, and anything published to Confluence or Drive. The user may move a type from one list to the other.

## Where the answers go

- Banned words → the `## Never Use These Words or Phrases` list in `anti-style.md`. Add words to the list and never remove the user's own entries.
- Output language → `language` in `pm-os.config.json`.
- Tone and internal references → a marked block at the end of `anti-style.md`. On reconfigure, replace the existing block; never add a second one:

```markdown
<!-- blvck-pm:writing-style:start -->
## Tone

- [the tone rules the user confirmed]

## Internal References

- Outward documents ([the types]): no ticket ids, internal codenames, repo names, or internal links. Say what the thing is in plain words.
- Internal documents ([the types]): ticket ids and repo paths are allowed, and help readers find the source.
<!-- blvck-pm:writing-style:end -->
```

The identity dir is normally read-only for agents. This block is written only by setup, with the user's approval of the exact text.
