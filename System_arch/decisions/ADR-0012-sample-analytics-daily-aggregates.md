# ADR-0012: Seeded analytics stored as daily aggregates
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/06-persistence.md, design/16-analytics.md, src/services/mock/db.ts

## Context
Thirty days of individual sample events would be about 15,000 objects, more than 2 MB of localStorage, which is close to the browser quota.

## Decision
- Sample data is stored as `dailyStats` rows: product × day × views/AR. That is about 500 rows.
- Real events recorded during the demo (`recordEvent`) are stored individually in `events` with `sample: false`, capped at 5,000.
- `summarize()` merges both sources.
- Only products of **active** catalogs get sample views.

## Consequences
- Good: a small storage footprint, and numbers still move when you browse the demo.
- Trade-off: sample data has day-level resolution only, which is all the analytics UI needs.
