# Tracking Plan — [Feature]

**Date:** [YYYY-MM-DD] | **PRD:** [link] | **Status:** Draft / Implemented / Verified

Rule: this plan exists before build starts; the launch checklist verifies events fire before GA.

## Questions This Instrumentation Answers
1. [e.g. Do users who touch X activate faster?] → answered by [event(s)]

## Events
| Event name | Fires when | Properties | Owner surface |
|------------|-----------|------------|---------------|
| `object_action` (e.g. `report_created`) | [exact trigger, incl. failure vs success] | [prop: type, source, …] | [screen/API] |

Naming: `object_action`, snake_case, past tense for completed actions. One event per user intent — no catch-all events.

## Properties Dictionary
| Property | Type | Allowed values | Notes |
|----------|------|----------------|-------|
|          |      |                |       |

## Funnel Definitions
| Funnel | Steps (events) | Success window |
|--------|----------------|----------------|
| [name] | e1 → e2 → e3   | [e.g. 7 days]  |

## Identity & Privacy
- User/account ID join keys: [ ]
- PII rules: [what must never be a property value]

## QA Checklist
- [ ] Each event fired once per action (no dupes) in a test session
- [ ] Properties populated, not null, on real data
- [ ] Events visible in [destination: BigQuery table / tool] — table: [ ]
