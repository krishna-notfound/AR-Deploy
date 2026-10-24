import { lazy, Suspense } from 'react'
import { Outlet, type RouteObject, createBrowserRouter } from 'react-router'
import { RequireRole } from '@/auth/RequireRole'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { adminNav, businessNav } from '@/components/layout/nav'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { type Tenant, resolveTenant } from '@/tenant/resolveTenant'
import { RootLayout } from './RootLayout'
import { RouteError } from './RouteError'

// Lazy route modules per surface so public pages never load admin code.
const LandingPage = lazy(() => import('@/features/marketing/LandingPage'))
const DemoEntryPage = lazy(() => import('@/features/demo/DemoEntryPage'))
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'))
const AcceptInvitePage = lazy(() => import('@/features/auth/AcceptInvitePage'))
const ApplyPage = lazy(() => import('@/features/apply/ApplyPage'))
const NotFoundPage = lazy(() => import('@/features/demo/NotFoundPage'))
const PublicNotFoundPage = lazy(() => import('@/features/marketing/PublicNotFoundPage'))

const AdminOverviewPage = lazy(() => import('@/features/admin/AdminOverviewPage'))
const BusinessesListPage = lazy(() => import('@/features/admin/BusinessesListPage'))
const BusinessCreatePage = lazy(() => import('@/features/admin/BusinessCreatePage'))
const BusinessDetailPage = lazy(() => import('@/features/admin/BusinessDetailPage'))
const AdminProductsPage = lazy(() => import('@/features/admin/AdminProductsPage'))
const AdminAnalyticsPage = lazy(() => import('@/features/admin/AdminAnalyticsPage'))
const AdminCatalogsPage = lazy(() => import('@/features/admin/AdminCatalogsPage'))
const AdminSettingsPage = lazy(() => import('@/features/admin/AdminSettingsPage'))
const ApplicationsPage = lazy(() => import('@/features/admin/ApplicationsPage'))
const ApplicationDetailPage = lazy(() => import('@/features/admin/ApplicationDetailPage'))
const AuditLogPage = lazy(() => import('@/features/admin/AuditLogPage'))
const ProductEditorPage = lazy(() => import('@/features/products/ProductEditorPage'))

const BusinessOverviewPage = lazy(() => import('@/features/business/BusinessOverviewPage'))
const MyProductsPage = lazy(() => import('@/features/business/MyProductsPage'))
const BusinessAnalyticsPage = lazy(() => import('@/features/business/BusinessAnalyticsPage'))
const MyCatalogPage = lazy(() => import('@/features/business/MyCatalogPage'))
const BusinessSettingsPage = lazy(() => import('@/features/business/BusinessSettingsPage'))

const CatalogPage = lazy(() => import('@/features/public/CatalogPage'))
const ProductPage = lazy(() => import('@/features/public/ProductPage'))
const EmbedProductPage = lazy(() => import('@/features/public/EmbedProductPage'))

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
    { path: 'applications', element: <ApplicationsPage /> },
    { path: 'applications/:applicationId', element: <ApplicationDetailPage /> },
    { path: 'businesses', element: <BusinessesListPage /> },
    { path: 'businesses/new', element: <BusinessCreatePage /> },
    { path: 'businesses/:businessId', element: <BusinessDetailPage /> },
    { path: 'products', element: <AdminProductsPage /> },
    { path: 'products/new', element: <ProductEditorPage scope="admin" /> },
    { path: 'products/:productId/edit', element: <ProductEditorPage scope="admin" /> },
    { path: 'analytics', element: <AdminAnalyticsPage /> },
    { path: 'catalogs', element: <AdminCatalogsPage /> },
    { path: 'activity', element: <AuditLogPage /> },
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
      errorElement: <RouteError />,
      children: [
        {
          element: <Standalone />,
          children: [
            { path: '/demo', element: <DemoEntryPage /> },
            { path: '/login', element: <LoginPage /> },
          ],
        },
        adminRoutes,
        businessRoutes,
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <LandingPage /> },
            { path: '/apply', element: <ApplyPage /> },
            // Both use t(), so they need the LanguageProvider of this layout.
            { path: '/reset-password', element: <ResetPasswordPage /> },
            { path: '/accept-invite', element: <AcceptInvitePage /> },
            { path: '/catalog/:businessSlug', element: <CatalogPage /> },
            { path: '/products/:businessSlug/:productSlug', element: <ProductPage /> },
            // Framable by any website (vercel.json, ADR-0026); chrome-less, public data only.
            { path: '/embed/products/:businessSlug/:productSlug', element: <EmbedProductPage /> },
            { path: '*', element: <PublicNotFoundPage /> },
          ],
        },
      ],
    },
  ]
}

/** Business subdomain mode (e.g. casa-lisboa.sanctus.app): catalog at "/", products at "/products/:slug". */
function hostnameModeRoutes(slug: string): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <CatalogPage tenantSlug={slug} /> },
            { path: '/products/:productSlug', element: <ProductPage tenantSlug={slug} /> },
            { path: '/embed/products/:productSlug', element: <EmbedProductPage tenantSlug={slug} /> },
            { path: '*', element: <PublicNotFoundPage tenant /> },
          ],
        },
      ],
    },
  ]
}

export function createAppRouter(tenant: Tenant = resolveTenant()) {
  return createBrowserRouter(tenant.mode === 'hostname' ? hostnameModeRoutes(tenant.slug) : pathModeRoutes())
}
