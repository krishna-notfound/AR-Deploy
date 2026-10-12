# 03 · Folder structure
Read when: creating a new file and deciding where it goes.

```
src/
├── main.tsx, index.css            # mount; Tailwind + @theme tokens
├── app/        App.tsx, router.tsx, providers/   (Toast, Confirm, Account, Language)
├── domain/     types.ts           # ONLY place entity shapes live (04-domain-model)
├── services/   catalogService.ts (interface), hooks.ts, index.ts (swap point)
│   └── mock/   mockCatalogService.ts, store.ts, seed.ts
├── auth/       accounts.ts, AccountProvider.tsx, RequireRole.tsx
├── tenant/     resolveTenant.ts
├── i18n/       dictionaries/{en,pt}.ts, LanguageProvider.tsx, types.ts
├── lib/        format, slug, clipboard, files, userAgent, urls, download
├── types/      model-viewer.d.ts
├── components/
│   ├── ui/     design-system primitives (11-design-system)
│   └── layout/ DashboardShell, Sidebar, Topbar, MobileNav, Breadcrumbs, PublicShell, nav.ts
└── features/
    ├── demo/        DemoEntryPage
    ├── admin/       Super Admin pages
    ├── business/    Business Admin pages
    ├── products/    SHARED ProductEditor, ProductTable, ProductActions, ModelPreview
    ├── businesses/  SHARED BusinessForm, BusinessIdentityPreview
    ├── catalogs/    SHARED CatalogQrPanel
    ├── analytics/   SHARED AnalyticsView({ businessId? })
    └── public/      CatalogPage, ProductPage, ModelViewer3D, ArTips, InAppNotice, LanguageSwitcher
tests/e2e/      Playwright specs
public/models/  optional self-hosted sample GLB/USDZ
```

## Rules
- Anything used by both dashboards goes in a shared feature folder and takes a `businessId` or `scope` prop. Never duplicate it.
- Components never import `services/mock/*`. They use `services/hooks.ts` only.
- Only `lib/urls.ts` composes URLs.
