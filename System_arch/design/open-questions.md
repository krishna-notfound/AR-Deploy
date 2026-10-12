# Open questions (for the client)
Read when: a task depends on one of these. Don't block on them; use the default. When one is answered, write an ADR in `../decisions/` and update this row.

| # | Question | Default until answered | Status |
|---|---|---|---|
| Q1 | Is the Business Admin dashboard in confirmed contract scope? | Built, marked "scope pending" | Open |
| Q2 | Production root domain for business subdomains? | `example.com` via `VITE_ROOT_DOMAIN` | Open |
| Q3 | Portuguese variant: pt-PT or pt-BR? | pt-PT text, `pt-PT` number format | Open |
| Q4 | Where will real GLB/USDZ assets be hosted (CDN, CORS)? | Public sample assets or `public/models/` | Open |
| Q5 | Default currency? | EUR; configurable per business | Open |
| Q6 | Will the client supply a USDZ for every product, or only GLB? | Both supported; the editor flags a missing USDZ | Open |
