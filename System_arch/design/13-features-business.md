# 13 · Business Admin screens (scope pending)
Read when: building any `/dashboard/*` page.
Decision: [ADR-0008](../decisions/ADR-0008-business-admin-shared-scoped.md)

Every screen reuses shared features and is scoped by `user.businessId`. These screens never show global data.

| Route | Content |
|---|---|
| `/dashboard` | Business status badge, 5 stats (products, published, drafts, views, AR launch attempts), "Next steps" (getting-started checklist when empty; otherwise drafts, products without a 3D model, products without a USDZ, catalogue not public, each linking to the filtered list), trend (empty state while nothing is published), recent products, recent activity |
| `/dashboard/products` | `ProductTable scope="business"` with no business column or filter. Search, status, category and 3D/AR filters (`?ar=ready|android-only|photos-only`), AR readiness pill (AR ready / Android only / Photos only), "AR attempts" column, Edit, Duplicate, Publish/Unpublish, Delete (confirm), Preview, Copy URL (with a not-live caveat for drafts and non-active catalogues) Product QR code (ADR-0025) and "Embed on your website" (`EmbedCodeDialog`: iframe snippet for published products, ADR-0026). |
| `/dashboard/products/new` and `/:id/edit` | `ProductEditor` with the business fixed. Editing another business's product shows not-found. |
| `/dashboard/analytics` | `AnalyticsView businessId={user.businessId}` |
| `/dashboard/catalog` | `CatalogQrPanel businessId` with no selector |
| `/dashboard/settings` | `BusinessForm mode="owner"` |

On `/dashboard/settings`:
- The owner can edit the name, logo, description, and contact details.
- The slug and catalog URL are **read-only**, with the note "Changing your catalog address requires platform support."
- Never imply that a subdomain or SSL gets provisioned.

Sidebar items: Overview, My Products (stays active in the editor), Analytics, My Catalog & QR, Business Settings, Logout. "Add product" is the primary button on Overview and My Products, not a nav item.

Every `/dashboard/*` page shows `CatalogStatusNotice` while the business is not active: draft ("not public yet") or inactive ("Your catalog is paused"), each with a link to the owner catalogue preview (ADR-0025). The topbar shows "Demo mode" only in demo mode.
