# MASTER PROMPT — Complete 3D Furniture Catalog & AR Platform Frontend

> **Source of truth for requirements.** This is the original client brief, kept verbatim.
> **Large file: don't read it whole.** Grep for `^## N\.` and read only that section (see [README.md](README.md)).
> Derived docs: [README.md](README.md) (index) · `design/` · [plan.md](plan.md) · [Task.md](Task.md) · `decisions/`.
> If a derived doc conflicts with this brief, the brief wins: fix the doc and record the change as an ADR.

---

Act as a senior frontend architect, SaaS product designer, and experienced React engineer. Your task is to build the **complete frontend of a premium multi-tenant 3D furniture catalog and Augmented Reality (AR) platform** inside my existing repository.

This is a real client project. Prioritize professional UI/UX, functional interactions, maintainable architecture, and the actual project requirements over unnecessary features.

**Important:** Do not merely create a plan, mockup, or landing page. Inspect the repository and implement the working frontend in the existing codebase.

---

## 1. Inspect the existing project first

Before coding:

1. Inspect the repository structure and all relevant existing files.
2. Identify the framework, routing, styling system, dependencies, and available components.
3. Check `package.json`, build scripts, TypeScript configuration, and existing pages.
4. Reuse existing working code wherever possible.
5. Do not recreate the project from scratch if a working project already exists.
6. Do not overwrite configuration files unnecessarily or break existing functionality.
7. Briefly explain your implementation plan, then proceed with implementation without waiting for approval unless a genuine blocker exists.

Use the existing technology stack. If the project is empty, use React, TypeScript, Vite, and Tailwind CSS, with React Router and Lucide icons where appropriate.

Keep the code modular and production-oriented.

## 2. Product vision

Build a platform where multiple furniture businesses can publish their own digital product catalogs.

Customers should be able to:
- Browse furniture products from a business catalog.
- View product images, pricing, descriptions, dimensions, and materials.
- Rotate and zoom interactive 3D furniture models.
- Tap **“View in my home”** to experience furniture in their real environment using native AR.
- Share product links with other people.

The platform's team manages businesses and catalogs through a central Super Admin Dashboard.

Business-owner dashboards should also be represented in the frontend because individual catalog management was part of the original project brief. However, keep this account type modular and clearly identifiable as pending final scope confirmation. Do not treat its inclusion as a confirmed contractual requirement.

The platform must support Portuguese and English on public product pages. The administrative dashboard will use one language for the initial implementation; choose English unless the existing project establishes otherwise.

---

# PART A — COMPLETE SUPER ADMIN DASHBOARD

## 3. Admin dashboard design

Create a polished central dashboard for the client's internal team.

### Main navigation

- Overview
- Businesses
- All Products
- Analytics
- Catalogs & QR Codes
- Settings
- Logout

Use a collapsible desktop sidebar, responsive mobile navigation, a top bar, breadcrumbs where appropriate, profile menu, and notification UI.

The dashboard should have a consistent design system, reusable components, realistic sample data, and clear loading, empty, error, and success states.

## 4. Super Admin overview

Display summary cards for:
- Total businesses.
- Total products.
- Published products.
- Draft products.
- Total product page views.
- Total AR button activations.

Include:
- Product views and AR activations chart.
- Recently added products.
- Recently created businesses.
- Top-performing products.
- Recent activity.
- Quick actions: Create Business, Add Product, View Catalogs.

All statistics must come from a centralized mock data/service layer. Label sample data appropriately and do not imply that it represents live production analytics.

## 5. Business management

Build a complete business management interface.

### Businesses list
Show:
- Business logo.
- Business name.
- Subdomain or catalog URL.
- Total products.
- Published products.
- Basic performance metrics.
- Status.
- Last updated date.

Include search, status filters, sorting, and pagination if needed.

### Create/Edit Business
Provide a form for:
- Business name.
- Business logo upload.
- Business description.
- Contact information where appropriate.
- Business slug/subdomain.
- Catalog status.

Provide:
- Form validation.
- Preview of the business identity.
- Save Draft or Create Business actions as appropriate.
- Edit business details.
- Activate/deactivate catalog in the demo.
- Open business catalog.
- View its products.
- View its QR code.

Use confirmation dialogs for destructive actions.

The UI can simulate creating a business and its catalog configuration, but must not claim to configure real DNS, SSL, or hosting without a backend.

## 6. Product management across businesses

Create a global product management page where the Super Admin can manage products across all businesses.

Each product should show:
- Product image.
- Product name.
- Associated business.
- Price.
- Publication status.
- Product views.
- AR activations.
- Last updated date.

Features:
- Search by product name.
- Filter by business.
- Filter by publication status.
- Sort and paginate.
- View product details.
- Edit product.
- Duplicate product.
- Publish/unpublish product.
- Delete product with confirmation.
- Copy product URL.
- Open product preview.

The Super Admin should be able to select a business before creating a product, so the product is associated with the correct catalog.

## 7. Admin product editor

Build a reusable product editor that works for both Super Admin and Business Admin interfaces.

### Basic information
- Product name.
- Short description.
- Full description.
- Category.
- Price and currency.

### Images
- Upload multiple images.
- Display thumbnails.
- Choose a primary image.
- Remove uploaded images.
- Handle invalid file types and oversized files.

### 3D models
- Upload GLB files.
- Upload USDZ files.
- Display filename, file size, and validation status.
- Preview the model where possible.
- Explain which format is used for web 3D and which is used for iOS AR.
- Provide a useful empty state if a model is missing.

Do not implement automatic GLB-to-USDZ conversion or AI photo-to-3D generation. Do not claim that model compression or server-side processing has occurred when using mock services.

### Dimensions and specifications
- Width.
- Height.
- Depth.
- Explicit units.
- Material.
- Optional weight.
- Colors and variants.

### Additional information
- Additional product photos.
- Call-to-action label.
- Optional CTA destination URL.

### Publishing workflow
- Save Draft.
- Preview Product.
- Publish Product.
- Unpublish Product.

When publishing, simulate the generation of a product URL using the selected business slug and product slug.

For example, the demo may display a URL such as `https://business.example.com/products/modern-sofa`.

This is only a demo URL; do not assume that the domain or routing has already been configured.

## 8. Catalogs and QR codes

Build a global Catalogs & QR Codes page.

Include:
- Business selector.
- Catalog URL.
- QR code preview.
- Copy catalog URL.
- Download QR code.
- Open catalog preview.
- View associated products.

Generate QR codes from the actual catalog URL configured in mock data using a suitable client-side library.

**Important:** The business QR code must link to its catalog, not an individual product. The catalog should remain the destination when the business adds or removes products.

Do not use unrelated hardcoded QR images.

## 9. Admin analytics

Build a clean analytics page containing:
- Overall product views.
- AR button activations.
- Business-level performance.
- Top-performing products.
- Product views and AR activations over time.

Provide a business filter and a product performance table.

Keep analytics limited to basic product views and AR activations. Do not add advanced device breakdowns, elaborate date-filter systems, monthly reports, or 3D interaction tracking.

Use meaningful sample datasets and responsive charts.

---

# PART B — BUSINESS OWNER DASHBOARD

## 10. Business dashboard

Create a separate dashboard experience for a Business Admin.

This interface must represent one business at a time. Do not show global platform data.

### Sidebar
- Overview
- My Products
- Add Product
- Analytics
- My Catalog & QR
- Business Settings
- Logout

### Overview
Display:
- Total products.
- Published products.
- Draft products.
- Product page views.
- AR activations.
- Recent products.
- Recent activity.
- Quick Add Product action.

### My Products
Allow the business owner to:
- View their own products.
- Search and filter products.
- Add a product.
- Edit a product.
- Duplicate a product.
- Publish or unpublish.
- Delete a product with confirmation.
- Preview a product.
- Copy and share product URLs.

### Analytics
Display only that business's product views, AR activations, and top-performing products.

### My Catalog & QR
Display the business catalog URL, QR code, copy action, and download action.

### Business Settings
Allow editing permitted profile fields such as:
- Business name.
- Logo.
- Description.
- Contact information.

Display the configured catalog URL or subdomain. Do not imply that changing a field automatically provisions a subdomain or SSL.

### Important account boundary
Represent two account types in the frontend architecture:
- `super_admin`
- `business_admin`

For the demo, provide a simple mock account selector or demo entry point so both interfaces can be tested without a real authentication service.

Keep the account and permission logic isolated for future integration. The frontend must not be described as a secure authorization boundary; production access control must be enforced by the backend.

Do not add team roles, permissions management, subscription billing, or payment plans.

---

# PART C — PUBLIC BUSINESS CATALOGS

## 11. Business catalog pages

Create a public-facing catalog for every configured business.

Each catalog should include:
- Business logo and name.
- Business branding using restrained, configurable styling.
- Responsive product grid.
- Product images.
- Product names and prices.
- Search and category filtering where useful.
- Product detail links.
- Clear empty states.
- Mobile-first layout.

Use the business slug or hostname to identify the correct mock business.

For local development, support simple routes such as:

- `/catalog/:businessSlug`
- `/products/:businessSlug/:productSlug`

Design the routing so it can later support real business subdomains through hostname-based resolution.

Do not build a separate application or deployment for each business.

## 12. Public product detail pages

This is a core part of the platform. Treat these pages as a customer-facing shopping and product-discovery experience, not an admin screen.

### Product presentation
Include:
- Product image gallery.
- Product name and price.
- Description.
- Dimensions.
- Materials.
- Colors and variants.
- Additional photos.
- Call-to-action button.
- Business identity and link back to the catalog.
- Share product link.

### Interactive 3D viewer
Use Google's `<model-viewer>` web component if compatible with the existing project.

Support:
- GLB model display.
- Rotate and zoom.
- Model loading indicator.
- Poster image before model loading.
- Graceful error handling.
- Useful fallback when the model is unavailable.

### AR experience
Add a prominent **“View in my home”** button.

Prepare the frontend for:
- iOS AR Quick Look using USDZ.
- Android AR Scene Viewer using a compatible GLB model.
- Fallback to interactive 3D when AR is unavailable.

Use the real product model URLs supplied by the mock data layer. Do not create fake conversion workflows or pretend to verify device capabilities without actual implementation.

### Accurate furniture scale
Furniture dimensions are important.

Represent width, height, and depth explicitly, with a clear unit system. Configure model presentation using the actual model asset and its dimensions when available.

Do not silently scale models based on guesses. If a model's physical dimensions cannot be verified, display the entered product dimensions and treat AR accuracy as unverified.

### In-app browser notice
Detect Instagram, Facebook, and WhatsApp in-app browsers where reasonably supported.

When appropriate, display a dismissible notice explaining that the user should open the page in Safari or Chrome for the best AR experience.

Do not falsely guarantee that every in-app browser blocks AR.

### First-time AR guidance
Add a small, dismissible AR tips panel explaining how to:
- Point the camera at the floor.
- Scan the environment.
- Place the furniture.
- Move or resize the view if supported.

Keep the instructions short and mobile-friendly.

## 13. Bilingual public pages

Implement Portuguese and English language switching for the public catalog and product pages.

Requirements:
- A visible language switcher.
- Centralized translation dictionaries.
- Translate navigation, buttons, AR instructions, labels, and interface messages.
- Keep product content associated with its correct language where translations exist.
- Gracefully handle missing translations.
- Persist the selected language for the current demo session if practical.

The administrative dashboard should remain in one language for this implementation.

---

# PART D — SHARED DESIGN SYSTEM

## 14. Visual direction

The platform should look like a premium furniture technology product.

Use:
- Warm white and subtle neutral backgrounds.
- Charcoal text.
- Muted, elegant accent colors.
- Clear typography.
- Spacious but efficient layouts.
- Consistent border radii.
- Subtle shadows and borders.
- Realistic furniture imagery.
- Professional charts, tables, forms, and dialogs.

Avoid:
- Excessive gradients.
- Glassmorphism everywhere.
- Huge decorative text.
- Unnecessary animations.
- Repeated generic dashboard cards.
- Overcrowded interfaces.
- Excessive emoji.
- Fake AI badges or claims.

Use consistent visual rules across the public website, Super Admin Dashboard, and Business Dashboard, while allowing public catalogs to display each business's logo.

Build reusable components for:
- Buttons.
- Inputs and selects.
- Status badges.
- Tables and responsive product cards.
- Stat cards.
- Charts.
- Modals and confirmation dialogs.
- Toast notifications.
- Loading skeletons.
- Empty states.
- Image uploads.
- Product previews.
- Navigation and layout.

Support desktop, tablet, and mobile layouts.

## 15. Functional interaction requirements

Do not leave buttons that look functional but do nothing.

Implement frontend behavior for:
- Navigation between all pages.
- Search, sorting, and filters.
- Product creation and editing.
- Product duplication.
- Product deletion with confirmation.
- Publishing and unpublishing.
- Business creation and editing.
- Product previews.
- Copy link.
- QR generation and download.
- Form validation.
- Image and model file selection.
- Language switching.
- Notifications.
- Mock account switching.
- Responsive sidebar.

Use mock data and simulated asynchronous operations when necessary. Clearly distinguish simulation from real backend functionality.

Persist demo changes in localStorage only if appropriate, and handle invalid stored data safely.

---

# PART E — FRONTEND ARCHITECTURE

## 16. Keep backend separate

This task is strictly frontend-focused.

Do not build:
- A real backend API.
- A database.
- Authentication-provider integration.
- Real user registration or password recovery.
- Server-side model conversion.
- Server-side file storage.
- Payment integration.
- Production DNS or SSL automation.

Keep API integration ready for a later phase.

Create typed entities where appropriate:

- `Business`
- `Product`
- `ProductVariant`
- `ProductAnalytics`
- `User`
- `BusinessCatalog`

Use a centralized mock service layer with methods such as:

- `getBusinesses()`
- `getBusinessBySlug(slug)`
- `createBusiness(data)`
- `updateBusiness(id, data)`
- `getProducts()`
- `getProductsByBusiness(businessId)`
- `getProductById(id)`
- `createProduct(data)`
- `updateProduct(id, data)`
- `duplicateProduct(id)`
- `deleteProduct(id)`
- `publishProduct(id)`
- `getAnalytics()`
- `getBusinessAnalytics(businessId)`

Use a consistent error-handling pattern and typed return values.

Keep mock data separate from UI components. Components should call the mock service layer rather than directly manipulating a hardcoded array scattered across the application.

Use localStorage only for demo persistence, not as a replacement for a production database or authorization system.

## 17. Suggested route organization

Adapt these routes to the existing router instead of blindly replacing it.

**Admin**
- `/admin`
- `/admin/businesses`
- `/admin/businesses/new`
- `/admin/businesses/:businessId`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/:productId/edit`
- `/admin/analytics`
- `/admin/catalogs`
- `/admin/settings`

**Business dashboard**
- `/dashboard`
- `/dashboard/products`
- `/dashboard/products/new`
- `/dashboard/products/:productId/edit`
- `/dashboard/analytics`
- `/dashboard/catalog`
- `/dashboard/settings`

**Public pages**
- `/catalog/:businessSlug`
- `/products/:businessSlug/:productSlug`

Use a simple demo entry page or mock account selector to navigate between the Super Admin and Business Dashboard during development.

---

# PART F — QUALITY AND DELIVERY

## 18. Quality standards

- Strict TypeScript wherever the project supports it.
- Avoid unnecessary `any`.
- Avoid giant components and duplicated business logic.
- Use semantic HTML and accessible labels.
- Ensure visible focus states and keyboard usability.
- Handle missing images and models gracefully.
- Include empty, loading, success, and error states.
- Validate forms.
- Do not expose secrets or credentials.
- Avoid unnecessary dependencies.
- Do not break existing working features.
- Keep the UI consistent across all routes.
- Ensure the build succeeds.

## 19. Test the completed frontend

After implementation, test:

1. Super Admin navigation.
2. Business creation and editing.
3. Product creation and editing.
4. Product duplication and deletion.
5. Publishing and unpublishing.
6. Business-specific product filtering.
7. Search and status filters.
8. Public catalog navigation.
9. Product detail and 3D viewer fallback.
10. AR button behavior and unavailable-model states.
11. Portuguese/English switching.
12. Catalog URL copying and QR code download.
13. Mock account switching.
14. Responsive desktop and mobile layouts.
15. Persistence of demo changes.
16. Typecheck, lint, tests, and production build where available.

Fix issues introduced by your implementation.

## 20. Final delivery report

When finished, provide:
- Summary of the implemented screens.
- Important files created or modified.
- Routes available for testing.
- How to run the project.
- Dependencies added.
- Build and typecheck results.
- Any incomplete interactions or known limitations.
- Clear distinction between mock frontend behavior and functionality that requires a backend.

## Final instruction

Build the complete frontend in the existing repository. Prioritize a coherent, polished product experience across the Super Admin Dashboard, Business Dashboard, public catalogs, and 3D/AR product pages.

Do not stop after creating the landing page or writing a plan. Implement the pages, wire the interactions to mock services, test the application, and leave the codebase ready for the next backend integration phase.
