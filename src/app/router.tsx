import { lazy, Suspense } from 'react'
import { Outlet, type RouteObject, createBrowserRouter } from 'react-router'
import { RequireRole } from '@/auth/RequireRole'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { adminNav, businessNav } from '@/components/layout/nav'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { type Tenant, resolveTenant } from '@/tenant/resolveTenant'
import { RootLayout } from './RootLayout'

// Lazy route modules per surface so public pages never load admin code.
const LandingPage = lazy(() => import('@/features/marketing/LandingPage'))
const DemoEntryPage = lazy(() => import('@/features/demo/DemoEntryPage'))
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const NotFoundPage = lazy(() => import('@/features/demo/NotFoundPage'))

const AdminOverviewPage = lazy(() => import('@/features/admin/AdminOverviewPage'))
const BusinessesListPage = lazy(() => import('@/features/admin/BusinessesListPage'))
const BusinessCreatePage = lazy(() => import('@/features/admin/BusinessCreatePage'))
const BusinessDetailPage = lazy(() => import('@/features/admin/BusinessDetailPage'))
const AdminProductsPage = lazy(() => import('@/features/admin/AdminProductsPage'))
const AdminAnalyticsPage = lazy(() => import('@/features/admin/AdminAnalyticsPage'))
const AdminCatalogsPage = lazy(() => import('@/features/admin/AdminCatalogsPage'))
const AdminSettingsPage = lazy(() => import('@/features/admin/AdminSettingsPage'))
const ProductEditorPage = lazy(() => import('@/features/products/ProductEditorPage'))

const BusinessOverviewPage = lazy(() => import('@/features/business/BusinessOverviewPage'))
const MyProductsPage = lazy(() => import('@/features/business/MyProductsPage'))
const BusinessAnalyticsPage = lazy(() => import('@/features/business/BusinessAnalyticsPage'))
const MyCatalogPage = lazy(() => import('@/features/business/MyCatalogPage'))
const BusinessSettingsPage = lazy(() => import('@/features/business/BusinessSettingsPage'))

const CatalogPage = lazy(() => import('@/features/public/CatalogPage'))
const ProductPage = lazy(() => import('@/features/public/ProductPage'))

function PublicLayout() {
  return (
    <LanguageProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </LanguageProvider>
  )
}

function Standalone() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Outlet />
    </Suspense>
  )
}

const adminRoutes: RouteObject = {
  path: '/admin',
  element: (
    <RequireRole allow="super_admin">
      <DashboardShell nav={adminNav} variant="admin" />
    </RequireRole>
  ),
  children: [
    { index: true, element: <AdminOverviewPage /> },
    { path: 'businesses', element: <BusinessesListPage /> },
    { path: 'businesses/new', element: <BusinessCreatePage /> },
    { path: 'businesses/:businessId', element: <BusinessDetailPage /> },
    { path: 'products', element: <AdminProductsPage /> },
    { path: 'products/new', element: <ProductEditorPage scope="admin" /> },
    { path: 'products/:productId/edit', element: <ProductEditorPage scope="admin" /> },
    { path: 'analytics', element: <AdminAnalyticsPage /> },
    { path: 'catalogs', element: <AdminCatalogsPage /> },
    { path: 'settings', element: <AdminSettingsPage /> },
    { path: '*', element: <NotFoundPage inShell /> },
  ],
}

const businessRoutes: RouteObject = {
  path: '/dashboard',
  element: (
    <RequireRole allow="business_admin">
      <DashboardShell nav={businessNav} variant="business" />
    </RequireRole>
  ),
  children: [
    { index: true, element: <BusinessOverviewPage /> },
    { path: 'products', element: <MyProductsPage /> },
    { path: 'products/new', element: <ProductEditorPage scope="business" /> },
    { path: 'products/:productId/edit', element: <ProductEditorPage scope="business" /> },
    { path: 'analytics', element: <BusinessAnalyticsPage /> },
    { path: 'catalog', element: <MyCatalogPage /> },
    { path: 'settings', element: <BusinessSettingsPage /> },
    { path: '*', element: <NotFoundPage inShell /> },
  ],
}

function pathModeRoutes(): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      children: [
        {
          element: <Standalone />,
          children: [
            { path: '/', element: <LandingPage /> },
            { path: '/demo', element: <DemoEntryPage /> },
            { path: '/login', element: <LoginPage /> },
          ],
        },
        adminRoutes,
        businessRoutes,
        {
          element: <PublicLayout />,
          children: [
            { path: '/catalog/:businessSlug', element: <CatalogPage /> },
            { path: '/products/:businessSlug/:productSlug', element: <ProductPage /> },
          ],
        },
        { element: <Standalone />, children: [{ path: '*', element: <NotFoundPage /> }] },
      ],
    },
  ]
}

/** Business subdomain mode (e.g. casa-lisboa.furnish.app): catalog at "/", products at "/products/:slug". */
function hostnameModeRoutes(slug: string): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      children: [
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <CatalogPage tenantSlug={slug} /> },
            { path: '/products/:productSlug', element: <ProductPage tenantSlug={slug} /> },
          ],
        },
        { element: <Standalone />, children: [{ path: '*', element: <NotFoundPage /> }] },
      ],
    },
  ]
}

export function createAppRouter(tenant: Tenant = resolveTenant()) {
  return createBrowserRouter(tenant.mode === 'hostname' ? hostnameModeRoutes(tenant.slug) : pathModeRoutes())
}
