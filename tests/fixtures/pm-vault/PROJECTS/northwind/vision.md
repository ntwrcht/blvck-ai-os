# Vision — Northwind

**Horizon:** 3 years | **Written:** 2026-08-01 | **Review on:** 2027-02-01

## The Change We Want to Cause

A finance team stops treating failed payments as an unavoidable cost of doing business. The
money that used to leak out silently becomes a number they can forecast, defend in a board
meeting, and hold someone accountable for. Nobody reconciles a payment by hand again.

## Who This Is For

Revenue operations managers at SaaS companies between $5M and $60M ARR — past the point where
Stripe's dashboard is enough, well before they can justify a billing engineer.

## What Must Become True

| # | Outcome | How we would know | Current |
|---|---------|-------------------|---------|
| 1 | Failed payments recover without anyone touching them | recovered revenue per active customer per month | $412 |
| 2 | Finance can forecast recovery within 10% | forecast error against actual recovery | 34% |
| 3 | Billing stops generating support load | tickets tagged billing per 100 customers | 8.2 |

## What We Will Not Do

- We will not become a general-purpose billing platform. Invoicing, tax, and revenue
  recognition are crowded and would take the whole team to reach parity.
- We will not build a customer-facing payment portal. It is the obvious next request and it
  puts us in the support path for our customers' customers.

## The Bet

That involuntary churn is a workflow problem rather than a payments problem — that better retry
timing and clearer customer messaging recover more than a smarter payment router would. If a
routing-only competitor matches our recovery rate without touching workflow, the bet is wrong.

## Leading Signal

Card-update completion rate. It moves within a week of a messaging change, long before recovered
revenue does. If it stays flat for two quarters while we ship workflow improvements, the bet
above needs revisiting rather than more execution.
