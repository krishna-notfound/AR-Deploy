import { RequirePermission } from '@/auth/usePermission'
import { JOIN_PATH, PRIVACY_PATH, TERMS_PATH } from '@/lib/urls'
import { lazy, Suspense } from 'react'
import { Outlet, type RouteObject, createBrowserRouter } from 'react-router'
import { RequireRole } from '@/auth/RequireRole'
import { SecurityGate } from '@/auth/SecurityGate'
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
const LegalPage = lazy(() => import('@/features/legal/LegalPage'))

const AdminOverviewPage = lazy(() => import('@/features/admin/AdminOverviewPage'))
const BusinessesListPage = lazy(() => import('@/features/admin/BusinessesListPage'))
const BusinessCreatePage = lazy(() => import('@/features/admin/BusinessCreatePage'))
const BusinessDetailPage = lazy(() => import('@/features/admin/BusinessDetailPage'))
const AdminProductsPage = lazy(() => import('@/features/admin/AdminProductsPage'))
const AdminAnalyticsPage = lazy(() => import('@/features/admin/AdminAnalyticsPage'))
const AdminCatalogsPage = lazy(() => import('@/features/admin/AdminCatalogsPage'))
const ApplicationsPage = lazy(() => import('@/features/admin/ApplicationsPage'))
const ApplicationDetailPage = lazy(() => import('@/features/admin/ApplicationDetailPage'))
const AuditLogPage = lazy(() => import('@/features/admin/AuditLogPage'))
const TeamPage = lazy(() => import('@/features/team/TeamPage'))
const RolePermissionsPage = lazy(() => import('@/features/team/RolePermissionsPage'))
const MemberDetailPage = lazy(() => import('@/features/team/MemberDetailPage'))
const JoinPage = lazy(() => import('@/features/join/JoinPage'))
const ProductEditorPage = lazy(() => import('@/features/products/ProductEditorPage'))
const SettingsLayout = lazy(() => import('@/features/settings/SettingsLayout'))

const BusinessOverviewPage = lazy(() => import('@/features/business/BusinessOverviewPage'))
const MyProductsPage = lazy(() => import('@/features/business/MyProductsPage'))
const BusinessAnalyticsPage = lazy(() => import('@/features/business/BusinessAnalyticsPage'))
const MyCatalogPage = lazy(() => import('@/features/business/MyCatalogPage'))

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
      <SecurityGate>
        <DashboardShell nav={adminNav} variant="admin" />
      </SecurityGate>
    </RequireRole>
  ),
  children: [
    { index: true, element: <AdminOverviewPage /> },
    // Each page needs its permission (ADR-0029). UX only: the database enforces the same rules.
    { path: 'applications', element: <RequirePermission need="applications.view"><ApplicationsPage /></RequirePermission> },
    { path: 'applications/:applicationId', element: <RequirePermission need="applications.view"><ApplicationDetailPage /></RequirePermission> },
    { path: 'businesses', element: <RequirePermission need="businesses.view"><BusinessesListPage /></RequirePermission> },
    { path: 'businesses/new', element: <RequirePermission need="businesses.edit"><BusinessCreatePage /></RequirePermission> },
    { path: 'businesses/:businessId', element: <RequirePermission need="businesses.view"><BusinessDetailPage /></RequirePermission> },
    { path: 'products', element: <RequirePermission need="products.view"><AdminProductsPage /></RequirePermission> },
    { path: 'products/new', element: <RequirePermission need="products.edit"><ProductEditorPage scope="admin" /></RequirePermission> },
    { path: 'products/:productId/edit', element: <RequirePermission need="products.edit"><ProductEditorPage scope="admin" /></RequirePermission> },
    { path: 'analytics', element: <RequirePermission need="analytics.view"><AdminAnalyticsPage /></RequirePermission> },
    { path: 'catalogs', element: <RequirePermission need="products.view"><AdminCatalogsPage /></RequirePermission> },
    { path: 'team', element: <RequirePermission need="owner"><TeamPage /></RequirePermission> },
    { path: 'team/permissions', element: <RequirePermission need="owner"><RolePermissionsPage /></RequirePermission> },
    { path: 'team/:memberId', element: <RequirePermission need="owner"><MemberDetailPage /></RequirePermission> },
    { path: 'activity', element: <RequirePermission need={['records.view', 'access.view']}><AuditLogPage /></RequirePermission> },
    { path: '*', element: <NotFoundPage inShell /> },
  ],
}

const businessRoutes: RouteObject = {
  path: '/dashboard',
  element: (
    <RequireRole allow="business_admin">
      <SecurityGate>
        <DashboardShell nav={businessNav} variant="business" />
      </SecurityGate>
    </RequireRole>
  ),
  children: [
    { index: true, element: <BusinessOverviewPage /> },
    { path: 'products', element: <MyProductsPage /> },
    { path: 'products/new', element: <ProductEditorPage scope="business" /> },
    { path: 'products/:productId/edit', element: <ProductEditorPage scope="business" /> },
    { path: 'analytics', element: <BusinessAnalyticsPage /> },
    { path: 'catalog', element: <MyCatalogPage /> },
    { path: '*', element: <NotFoundPage inShell /> },
  ],
}

// The settings hub is full-screen, outside DashboardShell but behind the same role guard and 2FA gate. Every platform role
// reaches its account sections; the Owner-only sections are hidden by the section registry, not by the route.
const settingsRoutes: RouteObject[] = [
  {
    path: '/admin/settings/:section?',
    element: (
      <RequireRole allow="super_admin">
        <SecurityGate>
          <SettingsLayout scope="admin" />
        </SecurityGate>
      </RequireRole>
    ),
  },
  {
    path: '/dashboard/settings/:section?',
    element: (
      <RequireRole allow="business_admin">
        <SecurityGate>
          <SettingsLayout scope="business" />
        </SecurityGate>
      </RequireRole>
    ),
  },
]

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
            { path: JOIN_PATH, element: <JoinPage /> },
            ...settingsRoutes,
          ],
        },
        adminRoutes,
        businessRoutes,
        {
          element: <PublicLayout />,
          children: [
            { path: '/', element: <LandingPage /> },
            { path: '/apply', element: <ApplyPage /> },
            { path: PRIVACY_PATH, element: <LegalPage doc="privacy" /> },
            { path: TERMS_PATH, element: <LegalPage doc="terms" /> },
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
            // The catalogue and product footers link here, so the legal pages answer on business subdomains too.
            { path: PRIVACY_PATH, element: <LegalPage doc="privacy" tenant /> },
            { path: TERMS_PATH, element: <LegalPage doc="terms" tenant /> },
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
