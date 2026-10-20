# ADR-0005: The QR code encodes the catalog URL
- **Status:** Accepted (amended by ADR-0025: a separate, labelled per-product QR code exists; this catalogue QR rule is unchanged)
- **Date:** 2026-10-12
- **Affects:** design/08-tenancy-urls.md, design/12-features-admin.md

## Context
Brief §8: the business QR code must link to the catalog, not to a single product, so it keeps working when products change. Real domains don't exist yet.

## Decision
- The QR code is generated on the client with `qrcode`. It encodes `catalogPublicUrl(b)` = `https://{slug}.{VITE_ROOT_DOMAIN ?? 'example.com'}`, labelled "Demo URL".
- An optional toggle, off by default, encodes the local preview URL instead so it can be tested on a phone.

## Consequences
- Good: the QR code is correct by design and becomes production-valid once a real domain is set.
- Trade-off: scanning the demo QR code opens example.com until the domain exists, which is why the toggle is there.
