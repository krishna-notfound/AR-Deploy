# P7 · QA, E2E & delivery
→ design/17-testing.md, design/18-mock-vs-backend.md

Specs live in `tests/e2e/`. Numbers in brackets refer to the brief's §19.
- [x] **P7-01** `admin-nav.spec`: every sidebar route, logout, guard [1]. Mobile drawer is in `responsive.mobile.spec` [14]. — done 2026-10-12
- [x] **P7-02** `business-crud.spec` [2]. — done 2026-10-12
- [x] **P7-03** `product-crud.spec` [3–7]. — done 2026-10-12
- [x] **P7-04** `public.spec` [8–11]. — done 2026-10-12
- [x] **P7-05** `qr-copy.spec` [12]. — done 2026-10-12
- [x] **P7-06** `accounts-persistence.spec` [13, 15]. — done 2026-10-12
- [~] **P7-07** Manual accessibility and responsive pass. — partial 2026-10-12: screenshot review at 390 and 1280–1440 px, and the mobile E2E checks for horizontal overflow. A full keyboard-only and screen-reader audit has **not** been done.
- [x] **P7-08** Full gate green: typecheck, lint (0 errors), test, test:e2e, build [16]. — done 2026-10-12
- [x] **P7-09** `DELIVERY_REPORT.md`. — done 2026-10-12

## Discovered
- [ ] **P7-10** Test AR on real devices: iPhone Safari (Quick Look, which needs a USDZ or model-viewer's own generation), Android Chrome (Scene Viewer), and the Instagram/WhatsApp in-app browsers.
- [ ] **P7-11** Complete the keyboard-only and screen-reader audit (P7-07 remainder).
- [ ] **P7-12** Consider self-hosting the sample GLBs in `public/models/` if GitHub raw hosting proves unreliable.
