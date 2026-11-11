# Application form builder redesign (Google Forms style), 2026-11-11

Owner request (2026-11-11): "make it like my client can make his form easily and simple way … take reference of Google Forms … just make the application form builder easy to use and simple, full feature". Scope confirmed: **builder only** ("Builder only (Recommended)" / "na first option").

## Scope

- Redesign the Admin → Website Editor → Application form builder (`src/features/editor/apply/**`, route `/admin/editor/apply`).
- **Not changed:**
  - the saved format (`ApplyFormConfig` in `supabase/functions/_shared/applyForm.ts`);
  - the SQL gate and any migration;
  - Edge Functions;
  - the public Apply page (`src/features/apply/**`);
  - admin application pages and existing applications.
- The new builder opens today's published and draft form unchanged.
- **Limits stay:** 8 steps including Review, 10 own questions, 2–10 options per choice question.
- **Locks stay:**
  - company name, contact name and email are always shown and required;
  - `language` is always required;
  - Review is last and holds consent + terms.
- The paused W6 work (fewer locks, deletable built-ins) stays paused.

## The screen

One column of cards, like Google Forms, centred, max ~760 px, on the existing Editor shell. Autosave, publish and history are untouched.

1. **Top bar:**
   - an EN | PT switch: which language you are typing in. An empty PT field shows the EN text greyed as its placeholder;
   - the Preview button: the existing live preview, desktop/phone and EN/PT, nothing sent;
   - the problems banner from `validateApplyForm`. Each problem links to and focuses its card.
2. **Form header card:** the page title and intro texts (the `apply.*` page texts), edited in place.
3. **Section cards**, one per step:
   - a "Section 2 of 5" label, plus title and description (`step.title` / `step.hint`, EN/PT, limits as today), edited in place;
   - a ⋮ menu: Move up, Move down, Add section below, Delete. Delete is only offered for client-added steps, needs a confirm, and moves the step's questions to the section above, as today.
4. **Question cards:**
   - **Closed:** looks like the question on the public form, with a Required/Optional badge and a "Hidden" badge if hidden.
   - **Click or Enter opens it in place.** No side drawer. One card is open at a time.
   - **Own questions:**
     - a kind dropdown with icons (short answer, paragraph, yes/no, multiple choice, checkboxes);
     - question and description;
     - options: add, remove, reorder by drag or by buttons;
     - a bottom row with Duplicate, Delete (confirm) and a Required switch.
     - Duplicate copies the question (new id, "(copy)" suffix) right below it. It is disabled with a reason when 10 own questions exist.
   - **Standard (built-in) questions** carry a small "Standard" tag:
     - you can edit the wording, description and "Other" label, with Reset to default;
     - options can be renamed and shown/hidden, keeping at least one visible;
     - a Required switch;
     - **Hide / Show** takes the place of Delete.
   - **Locked questions** (company name, contact name, email) show a lock with the one-line reason "Needed to create the company account". They have no Hide and no Required switch.
   - **Reorder:**
     - drag a card by its handle within a section or into another section;
     - the ⋮ menu has Move up / Move down / Move to section… for keyboard and phone;
     - moves are announced in a live region and focus is kept.
     - Drag is built with pointer events, **no new dependency**.
5. **Review & send section:** the last card group. It shows the consent and terms rows with their text editable, a lock and the reason "Always asked (legal)".
6. **"After sending" card:** the thank-you texts (the existing thanks group), plus the link to preview the thanks screen.
7. **"Button & message texts":** a collapsible, searchable panel at the bottom with every other text group from `textGroups.ts`. It replaces the separate Messages tab. Old `?tab=messages` links open this panel.
8. **"+" bar:**
   - floating to the right of the open card on desktop, a fixed bottom bar on phones;
   - Add question picks the kind first and adds below the open card or at the end of the section in view;
   - Add section.
   - When full, the buttons are disabled with the reason ("10 own questions is the most").

## Rules

- All edits go through the pure helpers in `formOps.ts`. Add `duplicateQuestion` and a cross-step move if missing, with tests.
- Text uses `t()` in EN and PT-PT, with no literal strings (ADR-0044). Use design tokens only, no raw colours, so the dashboard dark mode (spec 2026-11-11 dashboard dark mode) applies. The preview area stays light.
- **Phone width (390 px):** the cards are full width, the "+" bar sits at the bottom, there is no horizontal scroll, and touch targets are at least 44 px.
- The old `FieldPanel` drawer and `MessagesTab` are removed once their parts live in the cards and panel. `TextOverride` is kept and reused.

## Tests and done

- Unit tests: the `formOps` additions (duplicate, cross-step move).
- Component tests: open a card and edit it, duplicate, hide/show, delete with confirm, locked card has no Hide, the EN/PT switch, and a problem link focusing its card.
- Update the e2e/visual tests for the builder. One e2e test: edit a question in the builder, publish in demo mode, and see it on `/apply`.
- `typecheck`, `lint`, `test` and `build` pass. Screenshots at 1440 and 390 px.
- **Records:**
  - ADR-0059 "Application form builder: Google Forms-style cards" plus its row in `System_arch/decisions/README.md`;
  - update `System_arch/design/12-features-admin.md`, the builder part;
  - update `docs/CLIENT_HANDOVER.md`, the "Application form" how-to;
  - a row in `docs/DECISIONS.md`.
