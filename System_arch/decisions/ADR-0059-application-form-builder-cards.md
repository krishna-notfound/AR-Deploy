# ADR-0059: Application form builder: Google Forms-style cards
- **Status:** Accepted
- **Date:** 2026-11-11
- **Affects:** design/12-features-admin.md, docs/CLIENT_HANDOVER.md, docs/superpowers/specs/2026-11-11-apply-form-builder-redesign-design.md

## Context
The Website Editor's application form builder (ADR-0043) worked but felt heavy to the owner: a Form tab and a Messages tab, a side drawer per question, move buttons and a "Move to step" select on every row, English and Portuguese boxes side by side everywhere. Owner request, 2026-11-11: make it "easy and simple" for the client, "take reference of Google Forms", "full feature". Scope confirmed: the builder only.

## Decision
Rebuild the builder screen (`src/features/editor/apply/**`, route `/admin/editor/apply`) as one centred column of cards that are edited in place. Nothing outside the builder changes: the saved format (`ApplyFormConfig` in `supabase/functions/_shared/applyForm.ts`), the SQL gate, the Edge Functions, the public Apply page and the admin application pages stay as they are, and the builder opens today's published and draft form unchanged.

- **Cards:** a form header card (eyebrow, title, introduction), one group per section (a section card with its title and description, then its question cards), the Review rows, an "After sending" card (the thank-you texts and the link to preview that screen) and a collapsible, searchable "Button & message texts" panel that replaces the Messages tab (`?tab=messages` opens it).
- **Question cards:** closed they look like the question on the public form (with Required, Optional, Hidden and Standard badges); a click or Enter opens one card at a time, in place, with no drawer. Own questions get a kind menu with icons (short answer, paragraph, yes or no, multiple choice, checkboxes), a description, options, Duplicate (copy with "(copy)", refused at 10), Delete after a confirmation and a Required switch. Standard questions can be reworded (Reset to default), have options renamed and hidden (one stays), and are hidden or shown, not deleted. Locked questions show a lock and the reason and have no Hide and no Required switch.
- **Reorder:** drag by the handle, inside a section or into another one, built with pointer events (no dependency); the ⋮ menu (Move up, Move down, Move to section) and the arrow keys on the handle do the same for keyboard and phone; moves are announced in a live region and focus stays on the handle.
- **Language:** one EN | PT switch says which language is being typed; an empty Portuguese field shows the English text greyed as its guide.
- **Add bar:** Add question (kind first) and Add section, floating to the right of the open card from 1280 px, a fixed bottom bar below that; disabled with the reason at the limits.
- **Preview:** the existing live preview (real form, EN | PT, desktop | phone) opens from a "Preview the form" button; its area is marked `data-theme="light"` so it stays light when the dashboard dark mode applies.
- **Problems:** the banner lists each problem as a link that opens and focuses its card (and switches to the language the problem is in).
- **Limits and locks are unchanged:** 8 sections including Review, 10 own questions, 2 to 10 options per choice question, company name, contact name and email always shown and required, `language` always required, Review last with consent and terms. W6 (fewer locks, deletable standard questions) stays paused.
- **Code:** new pure helpers in `formOps.ts` (`moveFieldTo`, `duplicateQuestion`, `addStep` and `addQuestion` with an anchor); `FieldPanel`, `FormTab` and `MessagesTab` are removed; `TextOverride` is kept and reused. `DropdownMenu` gets an optional trigger tooltip.

## Consequences
- Good: one place to edit everything, no drawer, fewer controls on screen, the same words on the card as on the form, works with a keyboard and a phone.
- Good: no schema, function or public-page change, so nothing to apply or deploy beyond the front end.
- Trade-off: the live preview no longer sits beside the cards (the cards need the width inside the Editor shell); it opens on demand.
- Trade-off: a drag cannot be tested end to end in jsdom, so the component tests simulate the pointer with fixed layout and the real behaviour was checked in a browser.

## Alternatives rejected
- Keep the two tabs and drawer, only restyle: does not reach "like Google Forms".
- A drag-and-drop library: needs a new dependency and its own ADR; pointer events are enough for one list.
- A form builder that also changes the public Apply page or the saved format: out of scope (owner chose "builder only").
