# PRD: Dunning Retry Scheduler
**Author:** Worachote | **Date:** 2026-08-14 | **Status:** Review | **Version:** v1

## 1. Overview

### Problem
2.1% of customers are lost monthly to failed payments. Revenue operations reconciles these by
hand across three tools, taking roughly 6 hours per month-end close.

### Job-to-be-Done
When a payment fails, the revenue operations manager wants the retry to happen on its own, so
they can close the month without a spreadsheet.

### Solution Hypothesis
We believe adaptive retry timing for mid-market SaaS will raise recovered revenue, measured by
recovered revenue per active customer. The strongest argument against this is that issuer
behaviour, not timing, decides most retries.

### Link to North Star
Directly moves recovered revenue per active customer per month.

### Vision Outcome Served
Outcome 1 — failed payments recover without anyone touching them.

## 2. Success Metrics
| Metric | Baseline | Target | How measured | When |
|--------|----------|--------|--------------|------|
| Recovered revenue per active customer | $412 | $700 | Billing export, monthly | 90 days post-launch |

## 3. Requirements

### In Scope
| # | Requirement | Priority | Acceptance criteria |
|---|-------------|----------|---------------------|
| R1 | Retry schedule adapts to issuer response code | Must | A soft decline retries within 72h; a hard decline never retries |

### Out of Scope
- SMS notifications — no consent infrastructure exists yet

### User States
Empty (no failures), loading, error (retry API down), success (payment cleared).

## 4. Users & Flows
- Primary persona: revenue operations manager
- Flow: payment fails → schedule computed → retry → success or escalation to manual queue

## 5. Dependencies & Risks
| Item | Type | Owner | Mitigation |
|------|------|-------|------------|
| Issuer response code mapping | tech | Priya | Fall back to fixed schedule when the code is unknown |

## 6. Rollout
- Launch tier: beta — gating metric: recovery rate not below current 26% for 2 weeks
- Tracking plan: `CLAUDE-OUTPUTS/data-analysis/` — required before build starts

## 7. Open Questions
- [ ] Does Finance want recovery attributed on clear date or failure date — Dana — before GA

## Completeness

Released incomplete on 2026-08-14. Unmet at that time:
- Pricing impact stated — deferred, no pricing change expected but Finance has not confirmed
