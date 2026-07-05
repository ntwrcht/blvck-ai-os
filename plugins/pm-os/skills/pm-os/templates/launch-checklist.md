# Launch Checklist — [Feature] — Target: [date]

**Tier:** silent / beta / GA | **Owner:** [Name] | **Go/No-go:** [date, decider]

## Readiness Gates
### Product
- [ ] Acceptance criteria verified against the PRD (list evidence, not opinions)
- [ ] All user states handled: empty, loading, error, permission-denied
- [ ] Tracking plan events firing and visible in [tool] — verified with a real session

### Rollout
- [ ] Feature flag / kill switch tested both directions
- [ ] Rollout stages defined: [% or cohort → gating metric + threshold → next stage]
- [ ] Rollback criteria written: [metric] worse than [threshold] for [duration] → revert

### Comms
- [ ] Support briefed + macros/FAQ delivered
- [ ] Sales/CS one-liner: what changed, who benefits, known limitations
- [ ] Docs / changelog updated
- [ ] Announcement (if GA): channel, owner, date

### Data
- [ ] Success metric baseline captured pre-launch: [value, date]
- [ ] Dashboard link: [ ] — reviewed at [D+1, D+7, D+30]

## Day-After Review (D+1)
[Numbers vs. baseline. Anything ±15% gets a cause or an investigation owner.]

## D+30 Verdict
[Did it hit the PRD success metric? Keep / iterate / kill — logged in the decision log.]
