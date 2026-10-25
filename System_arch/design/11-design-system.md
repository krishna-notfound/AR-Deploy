# 11 · Design system
Read when: building or styling any UI component or layout. Load the `frontend-design` skill for new visual work, and `dataviz` for charts.
Decision: [ADR-0011](../decisions/ADR-0011-visual-identity.md)

## Tokens (`src/index.css` → Tailwind v4 `@theme`)
| Token (Tailwind name) | Value |
|---|---|
| `canvas` / `surface` / `subtle` | `#F6F5F2` plaster / `#FFFFFF` / `#EFEDE8` |
| `line` / `line-strong` | `#E3E1DC` / `#CFCCC5` |
| `ink` / `ink-muted` / `ink-faint` | `#23221F` / `#6E6A63` / `#9A958C` |
| `accent` / `accent-hover` / `accent-soft` | `#36564A` eucalyptus / `#2B463C` / `#E4ECE7` |
| `success` / `warning` / `danger` / `info` (each has a `-soft` variant) | `#2F6B4F` / `#94600F` / `#A23B2F` / `#355D7A` |
| Radii | `--radius-control` 8px, `--radius-card` 12px, `--radius-stage` 20px |
| Shadows | `--shadow-card` (a hairline plus a 1px soft shadow), `--shadow-pop` (menus and dialogs) |
| Font | Hanken Grotesk (Google Fonts), with the system stack as fallback. One family only. |
| Chart series | views `#2E8B6A`, AR `#D07A1F` (validated) |

- `--brand-accent` is set by `PublicShell` from the business accent via `safeBrandAccent()`, which falls back to the platform accent when contrast against white is below 4.5:1. It is used by the `brand` Button variant and by public chips and links.
- Motion: transitions of 150 ms or less, `prefers-reduced-motion` is respected, and there are no entrance animations.

## Layout
- **DashboardShell** (`components/layout`):
  - Collapsible sidebar. State is stored in `arfurn:sidebar` and exposed to children as `--sidebar-w`.
  - Mobile drawer that traps focus and closes on Esc.
  - Topbar with a "Demo mode" pill, a notifications popover (recent activity, unread dot, "Mark all as read") and a profile menu (Switch account, Logout).
  - Nav items come from `nav.ts`.
- **PageHeader:** breadcrumbs, title, description, a meta row and actions. It also sets `document.title`.
- **PublicShell** (`features/public`): business logo and name, the EN/PT switcher and a footer.

## Components (`src/components/ui`)
| Component | File | Notes |
|---|---|---|
| Button, ButtonLink, IconButton, `buttonClasses()` | Button.tsx | Variants: primary, brand, secondary, ghost, danger. Supports `loading`. |
| Badge, ProductStatusBadge, BusinessStatusBadge, AssetStatusBadge, SampleDataTag | Badge.tsx | Status is shown as text plus a dot, never colour alone. |
| Card, CardHeader, CardBody | Card.tsx | |
| StatGroup | StatGroup.tsx | One strip of key figures with a footer for the sample-data note. |
| FormField (label, hint, error, `aside`), Input, Textarea, Select, InputAddon, Switch, Checkbox, SegmentedControl | Form.tsx | Uses `aria-describedby` and `aria-invalid`. |
| SearchInput | SearchInput.tsx | 250 ms debounce |
| Modal (+ `useFocusTrap`), ConfirmProvider/`useConfirm()`, ToastProvider/`useToast()` | Modal.tsx, ConfirmProvider.tsx, ToastProvider.tsx | |
| DataTable, Pagination | DataTable.tsx, Pagination.tsx | Sortable with `aria-sort`. Below `md` it becomes a card list. |
| DropdownMenu, Popover | Menu.tsx | Arrow keys and Esc work. |
| Tabs | Tabs.tsx | |
| Skeleton, SkeletonRows, SkeletonGrid, EmptyState, ErrorState, InlineNotice | Skeleton.tsx, States.tsx | |
| SmartImage, Thumb | SmartImage.tsx | Shows a fallback when the image fails to load. |
| ImageUpload, LogoUpload | ImageUpload.tsx, LogoUpload.tsx | |
| CopyButton | CopyButton.tsx | |
| Charts: TrendChart, HorizontalBars, SeriesTable, ActivityTrend | components/charts | ActivityTrend has a "Show as table" toggle. |
| ModelViewer | components/three | Wraps `<model-viewer>`. |

## File validation (`lib/files.ts`)
| Kind | Accept | Max | Real check |
|---|---|---|---|
| Image | jpeg, png, webp | 5 MB (resized to fit within 1.5 MB to persist) | MIME type or extension |
| Logo | jpeg, png, webp, svg | 2 MB | MIME type |
| GLB | `.glb` | 50 MB | First 4 bytes are `glTF` |
| USDZ | `.usdz` | 50 MB | Zip magic bytes `PK\x03\x04` |

## Accessibility
- Visible `:focus-visible` ring.
- A skip link to `#main`.
- Labelled inputs.
- Icon buttons have an `aria-label`.
- Dialogs trap focus and restore it when closed.
- Tables use `th scope`.
- `lang="en"` is set on English fallbacks inside Portuguese pages.

## Phase 2 tokens (ADR-0014, supersedes the palette above)
| Token | Value | Use |
|---|---|---|
| `canvas` / `surface` / `subtle` | `#FAF9F7` / `#FFF` / `#F2F1EE` | page / panels / hover, skeleton |
| `line` / `line-strong` | `#E7E5E1` / `#D3D0CA` | hairlines / input borders |
| `ink` / `ink-body` / `ink-muted` / `ink-faint` | `#161616` / `#333` / `#5F5D59` / `#8C8A85` | headings / body (default) / secondary text / icons only |
| `accent-bright` | `#FE6F2D` | fills under dark text (`Button variant="accent"`, brand dot) |
| `accent` / `accent-hover` | `#E85F1F` / `#D4521A` | focus ring, nav indicator, icons, switches |
| `accent-ink` | `#B4441A` | orange text and links |
| `accent-soft` | `#FFF1EA` | accent badge background |
| `text-display` / `text-headline` / `text-title` / `text-lead` | fluid 40–70 px / 30–48 px / 26 px / 18 px | hero / section titles / page titles / intro copy |
| radii | 6 / 10 / 14 px | control / card / stage |
| `shadow-card` | 1 px hairline | cards (no elevation) |

- **Buttons:** primary is charcoal; `accent` is orange with dark text; `brand` is the tenant accent (public pages).
- **Platform chrome:** `BrandMark` / `Wordmark` (isometric box + orange floor anchor), plus `SiteHeader` / `SiteFooter` on platform pages.
- **Spacing rhythm:** 6/14/24/32/64 px = Tailwind 1.5/3.5/6/8/16. Editorial sections use `py-20 lg:py-28`; dashboards keep compact spacing.

## Phase 3 tokens: Sanctus (ADR-0023, supersedes the two palettes above)

Source: the client's brand board (`AR-attachment/`, design/21). Token names are unchanged; only values moved.

| Token | Value | Use |
|---|---|---|
| `canvas` / `surface` / `subtle` | `#F3F0E9` Chalk / `#FAF8F3` / `#ECE7DD` | page, cards and inputs, quiet fills |
| `line` / `line-strong` | `#D9D3C7` Limestone / `#8A8073` | hairlines / input borders (3.4:1) |
| `ink` / `ink-body` / `ink-muted` / `ink-faint` | `#1D1C1A` Obsidian / `#3A352F` / `#5A5148` Umber / `#6E6559` | text, all ≥ 4.5:1 on canvas |
| `accent-bright` / `accent` / `accent-hover` / `accent-ink` / `accent-soft` | `#C9B79B` / `#8A765C` Burnished Bronze / `#76644D` / `#6E5C45` / `#EAE3D6` | fills under dark text / rings and icons / hover / bronze text / soft fills |
| `taupe`, `umber`, `obsidian`, `chalk`, `limestone` | moodboard names | dark bands, overlays, decoration (taupe is never text) |
| Fonts | `--font-display` Cormorant Garamond, `--font-sans` Jost | serif for display/headline/title and dashboard page titles |
| `text-eyebrow` / `text-label` | 11px, 500, uppercase, 0.24em / 0.2em tracking | section captions; buttons (`lg`) and arrow links |
| Radii | 2px everywhere | square edges of the references |

- **Buttons:** `primary` is obsidian with chalk text; `lg` buttons use the spaced uppercase label. `arrowLinkClasses` is the references' "LABEL →" text link. `brand` keeps white text (the tenant accent is only guaranteed 4.5:1 against white).
- **Platform chrome:** `Wordmark` and `BrandMark` are the traced SANCTUS wordmark and "S" monogram. `SiteHeader variant="overlay"` sits on the landing hero; `solid` elsewhere. The mobile menu is a native `<dialog>`.
- **Public pages:** `LanguageSwitcher` is an "EN / PT" radio group. Catalogue cards are 4:5, image-first, with a category caption and a serif name. The product page opens on the photograph; 3D and AR are round actions beside the stage.

## Dashboard type (ADR-0031)

Inside the dashboards (`[data-surface="dashboard"]`, set by `DashboardShell`) the type and density change. Everything outside it (landing, apply, sign-in, join, demo, public pages except D8) keeps the Sanctus values above. Full values: `design/dashboard/BRIEF.md` §1–§2.

- **Fonts:** Inter 400/500/600 for all UI text, tables, forms and numbers. Cormorant Garamond 500 for the page title (h1) only.
- **Scale:** h1 32/1.15/-0.01em; subline 15; card title 16/600; body and input 14 (16 under 640px); table cell 14/20, secondary line 13/18, header 13/500 sentence case; label 14/500; help 13; KPI value 28/1.1 tabular, KPI label 13; badge 12/20; button 14/500 sentence case; nav item 14.
- **Spacing:** canvas padding 40/24/16, card gap and padding 24, controls 40 (36 in card headers, 44 touch), sidebar 256 with 40px rows and 18px icons, top bar 56.
- **Rules:** nothing under 12px; greys are `#5A5148` (`#6E6559` only for placeholders); weights 400/500/600; tabular figures on numbers; no small uppercase letter-spaced text (only the SANCTUS wordmark); no icons on stat cards.
- **Guard:** `npx playwright test --project=guard` checks that the untouched pages are pixel-identical (`tests/visual/guard.spec.ts`).
