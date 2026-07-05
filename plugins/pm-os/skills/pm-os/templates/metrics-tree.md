# Metrics Tree — [Product]

**Date:** [YYYY-MM-DD] | **Owner:** [Name]

## North Star Metric
**[NSM]** — [definition, exact formula, source table/dashboard]
Why this metric: [it captures value delivered to users AND correlates with revenue — state the causal story.]

## Tree
```text
NSM: [metric]
├── L1: [input metric 1 — e.g. activation]
│   ├── L2: [driver — e.g. signup → first key action rate]
│   └── L2: [driver]
├── L1: [input metric 2 — e.g. engagement/frequency]
│   └── L2: [driver]
└── L1: [input metric 3 — e.g. retention/expansion]
    └── L2: [driver]
```

## Metric Definitions
| Metric | Level | Formula | Source | Owner | Current | Target |
|--------|-------|---------|--------|-------|---------|--------|
|        |       |         |        |       |         |        |

## Health Checks
- Counter-metric(s): [what we watch so we don't game the NSM — e.g. quality, churn]
- Known data caveats: [from product context Data Caveats — repeat them here]

## How We Use It
Every roadmap item names the L1/L2 it moves. Items that move nothing on this tree need a written exception in the decision log.
