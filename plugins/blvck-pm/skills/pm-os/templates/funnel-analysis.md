# Funnel Analysis — [Funnel name]

**Date:** [YYYY-MM-DD] | **Window:** [date range] | **Segment:** [all users / cohort]

## Headline
[The step that loses the most recoverable value, and the recommended action. One sentence, first.]

## The Funnel
| Step | Event | Users | Conversion from prev | Conversion from top |
|------|-------|-------|----------------------|---------------------|
| 1 |  |  | — | 100% |
| 2 |  |  |  |  |

Source: [BigQuery query saved at CLAUDE-OUTPUTS/data-analysis/sql/… when enabled; else the export file used]

## Where It Leaks
- Biggest absolute drop: [step → step, N users, %]
- Biggest vs. benchmark/prior period: [step, delta]

## Segment Cuts (only ones that change the story)
| Cut | Finding |
|-----|---------|
| [new vs returning / plan / channel] | [difference + size] |

## Hypotheses (ranked)
| # | Why users drop here | Evidence for | Cheapest test |
|---|---------------------|--------------|---------------|
| 1 |  |  |  |

## Caveats
[Tracking gaps from the product context Data Caveats section that affect this read.]

## Recommendation
[One action + expected effect on the L1/NSM metric + how we'll know within [timeframe].]
