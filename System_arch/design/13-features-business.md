# 13 · Business Admin screens (scope pending)
Read when: building any `/dashboard/*` page.
Decision: [ADR-0008](../decisions/ADR-0008-business-admin-shared-scoped.md)

Every screen reuses shared features and is scoped by `user.businessId`. These screens never show global data.

| Route | Content |
|---|---|
| `/dashboard` | 5 StatCards (products, published, drafts, views, AR), recent products, recent activity, Quick Add Product |
| `/dashboard/products` | `ProductTable scope="business"` with no business column or filter. Search, status filter, Edit, Duplicate, Publish/Unpublish, Delete (confirm), Preview, and Copy/Share URL. |
| `/dashboard/products/new` and `/:id/edit` | `ProductEditor` with the business fixed. Editing another business's product shows not-found. |
| `/dashboard/analytics` | `AnalyticsView businessId={user.businessId}` |
| `/dashboard/catalog` | `CatalogQrPanel businessId` with no selector |
| `/dashboard/settings` | `BusinessForm mode="owner"` |

On `/dashboard/settings`:
- The owner can edit the name, logo, description, and contact details.
- The slug and catalog URL are **read-only**, with the note "Changing your catalog address requires platform support."
- Never imply that a subdomain or SSL gets provisioned.

Sidebar items: Overview, My Products, Add Product, Analytics, My Catalog & QR, Business Settings, Logout.
