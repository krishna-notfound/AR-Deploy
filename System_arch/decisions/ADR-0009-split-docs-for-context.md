# ADR-0009: Split the architecture docs into small files
- **Status:** Accepted
- **Date:** 2026-10-12
- **Affects:** System_arch/ (all), CLAUDE.md

## Context
One large system-design file plus the brief of about 600 lines would cost a lot of context tokens every time Claude reads them. Most tasks need only one or two topics.

## Decision
- `System_arch/README.md` is a small index that maps each kind of task to the files to read.
- Design topics live in `design/NN-topic.md`, one topic per file, at most about 100 lines each.
- Tasks live in `tasks/PN-*.md`, one file per phase. `Task.md` is just a status dashboard.
- Decisions live in `decisions/ADR-*.md`.
- `MASTER_PROMPT.md` is read by section only (grep `^## N\.`), never as a whole.

## Consequences
- Good: a typical task loads about 3 short files instead of everything.
- Trade-off: there are more files to keep in sync. Every ADR must therefore name the files it affects.
