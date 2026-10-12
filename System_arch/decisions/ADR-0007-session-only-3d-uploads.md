# ADR-0007: 3D uploads are session-only
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** design/06-persistence.md, design/15-product-editor.md

## Context
GLB and USDZ files are often 5–50 MB, but localStorage holds only about 5 MB in total. The brief forbids pretending that files are stored or processed on a server.

## Decision
- Uploaded models get a `blob:` URL that lives only in the current session registry. Only their metadata (name, size, status `session-only`) is persisted.
- After a reload, the UI says the file must be re-uploaded because backend storage is needed.
- Images can be persisted as data URLs, up to 1.5 MB each.
- A remote model URL can also be pasted in. Seed products use remote URLs.

## Consequences
- Good: honest behaviour, and the app can't break by running out of storage.
- Trade-off: uploaded models disappear on reload. IndexedDB was considered and deferred to avoid extra complexity.
