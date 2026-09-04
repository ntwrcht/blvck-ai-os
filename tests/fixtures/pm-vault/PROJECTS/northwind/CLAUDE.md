# Northwind — Product Context

## About This Product
Billing and revenue recovery for mid-market SaaS companies that outgrew Stripe's dashboard.

- Customers: SaaS companies, 50–500 employees, $5M–$60M ARR
- Stage: Series A, $11M ARR, 340 customers, 71% net revenue retention on the SMB tier
- **North Star Metric: recovered revenue per active customer per month** — it only moves when a
  payment that would have failed goes through, so it cannot be inflated by usage or seat growth.

## Primary Users
**Revenue operations manager**: reconciles failed payments by hand across three tools. Goal: close the month without a spreadsheet.
**Finance controller**: cannot forecast because recovery is unpredictable. Goal: a recovery number they can put in a board deck.
**Support lead**: fields angry emails about cards declined without warning. Goal: fewer tickets caused by billing.

## Buyers vs. Users
Finance signs; revenue operations uses it daily. The controller has never logged in and never
will — every decision they make comes from the monthly export, so the export is a first-class
surface, not a convenience.

## Terminology (use exactly these words)
- "involuntary churn" = a customer lost to a failed payment (never "passive churn")
- "recovery" = a failed payment that later succeeds (never "save" or "rescue")
- "dunning" = the retry and notification sequence after a failure (never "collections")

## Current OKRs
| Objective | Key result | Status |
|-----------|------------|--------|
| Make recovery predictable | Involuntary churn under 1.4% monthly | At 2.1%, on track |
| Make recovery visible | 80% of customers open the monthly recovery export | At 44% |

## Roadmap
See `roadmap.json` in this folder. Active items only; archive shipped ones.

## Data Caveats
- Recovery is attributed on the day the payment clears, not the day it failed. Month-boundary
  failures therefore land in the following month and make the first week of every month look thin.
- The SMB tier migrated billing systems in March; anything before that is not comparable.
