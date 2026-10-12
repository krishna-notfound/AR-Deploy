# ADR-0003: Store money in minor units
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/04-domain-model.md, design/15-product-editor.md

## Context
Floating-point prices round badly, for example 0.1 + 0.2.

## Decision
`Product.price` is an integer number of cents, stored together with an ISO `currency`. The editor converts the decimal the user types into minor units. Display uses `Intl.NumberFormat`.

## Consequences
- Good: exact arithmetic, and the format maps easily to backend APIs.
- Trade-off: every input and display must convert. Keep the conversion helpers in `lib/format.ts`.
