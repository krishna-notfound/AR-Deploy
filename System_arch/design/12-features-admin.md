# 12 · Super Admin screens + demo entry
Read when: building `/` or any `/admin/*` page. For the shared editor, see [15-product-editor.md](15-product-editor.md). For analytics, see [16-analytics.md](16-analytics.md).

## Demo entry `/`
- Short intro.
- Card "Super Admin" → `/admin`.
- Card "Business Admin": a business Select plus a **"Scope pending confirmation"** badge → `/dashboard`.
- List of public catalogs.
- Footnote: "Demo mode: no real authentication; data stored in this browser."

## Overview `/admin`
- 6 StatCards: businesses, products, published, drafts, views, AR activations.
- 30-day chart of views and AR activations.
- Recent products, recent businesses, top products, recent activity.
- Quick actions: Create Business, Add Product, View Catalogs.
- "Sample data" tag.

## Businesses list `/admin/businesses`
- **Columns:** logo, name, catalog URL (Demo), total/published products, views/AR, status, updated.
- **Controls:** search; status filter; sort by name, updated, products, or views; pagination of 10.
- **Row actions:**
  - Edit
  - Open catalog
  - View products → `/admin/products?business=`
  - View QR → `/admin/catalogs?business=`
  - Activate/Deactivate (confirm)
  - Delete (confirm; cascades to products)

## Business create / edit (`BusinessForm`, shared)
- **Fields:**
  - name (required, max 80)
  - slug (auto-generated from the name, editable, pattern-checked, unique)
  - logo upload
  - description
  - contact: email, phone, website, address (with email and URL validation)
  - status
  - accent colour
  - default currency
- A live `BusinessIdentityPreview`.
- **Actions:** "Save as draft" or "Create business" on create; "Save changes" on edit.
- After create, show a toast with the honesty note from [01-overview.md](01-overview.md) rule 2.
- `/admin/businesses/:id` also has Products and QR tabs.

## All products `/admin/products`
- `ProductTable`: image, name, business, price, status, views, AR, updated.
- **Filters:** search, business, status, category. Filters, sort, and paging are synced to the URL.
- **Row menu:**
  - View
  - Edit
  - Duplicate
  - Publish/Unpublish
  - Copy URL
  - Open preview
  - Delete (confirm)
- "Add product" opens a business-picker modal unless `?business` is already set.

## Catalogs & QR `/admin/catalogs`
`CatalogQrPanel` (shared):
- Business selector.
- Demo catalog URL with a copy button.
- QR canvas with "Download PNG".
- Open catalog preview.
- Published/total product counts with a link to the filtered product list.
- Note: "The QR always points to the catalog, so it stays valid as products change."

## Settings `/admin/settings`
- Profile (display only).
- Reset demo data (confirm).
- Developer: failure-injection toggle.
- Limitations panel, using the table in [18-mock-vs-backend.md](18-mock-vs-backend.md).
