# P1 · Domain types, mock service & persistence
→ design/04-domain-model.md, design/05-services.md, design/06-persistence.md, design/08-tenancy-urls.md

- [x] **P1-01** `src/domain/types.ts` per design/04. Accept: compiles with no `any`. — done 2026-10-12
- [x] **P1-02** `lib/slug.ts`, `lib/format.ts`, `lib/urls.ts`, `tenant/resolveTenant.ts` + unit tests. Accept: tests green. — done 2026-10-12: `src/lib/lib.test.ts`.
- [x] **P1-03** `services/mock/seed.ts` (4 businesses with 1 inactive, 21 products, PT gaps, models, broken model, photos, 30-day sample analytics; every remote URL loaded once). — done 2026-10-12: all GLBs return 200 with CORS `*`; all photo IDs return 200; posters rendered and dimensions measured (ADR-0013).
- [x] **P1-04** `services/mock/store.ts`: debounced save, `isValidDb`, corrupt-data fallback, quota handling, flush on unload. Accept: round-trip and corrupt-payload tests. — done 2026-10-12
- [x] **P1-05** `catalogService.ts` interface + Result types. — done 2026-10-12: added `getCatalogs` and the `allowDraft` option.
- [x] **P1-06** Business methods with slug `CONFLICT`. — done 2026-10-12
- [x] **P1-07** Product methods (duplicate `-copy`/`-copy-2`, publish invariants returning `VALIDATION` with `fieldErrors`). — done 2026-10-12
- [x] **P1-08** Analytics aggregation, `recordEvent`, `getRecentActivity`, `resetDemoData`. — done 2026-10-12: daily aggregates (ADR-0012).
- [x] **P1-09** Latency simulation (0 ms in tests) + failure injection via `arfurn:debug:failRate`. — done 2026-10-12: toggle in Settings → Demo data.
- [x] **P1-10** `services/hooks.ts` + `services/index.ts` swap point. Accept: RTL test shows a refresh after a mutation. — done 2026-10-12: `src/test/components.test.tsx`.

## Discovered
- [x] **P1-11** Sample views only for active catalogs (inactive catalogs can't be visited). — done 2026-10-12
