import { RequirePermission } from '@/auth/usePermission'
import { JOIN_PATH, PRIVACY_PATH, TERMS_PATH } from '@/lib/urls'
import { lazy, Suspense } from 'react'
import { Navigate, Outlet, type RouteObject, createBrowserRouter, useLocation } from 'react-router'
import { isDemoMode } from '@/services'
import { RequireRole } from '@/auth/RequireRole'
import { SecurityGate } from '@/auth/SecurityGate'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { adminNav, businessNav } from '@/components/layout/nav'
import { loadApplyScreen, loadEditorLayout, loadPageEditorScreen, loadPagesScreen, loadSocialScreen } from '@/features/editor/preload'
import { SiteContentProvider } from '@/features/marketing/SiteContentProvider'
import { LowercaseSlugs } from '@/features/public/LowercaseSlugs'
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
const CustomPage = lazy(() => import('@/features/legal/CustomPage'))

// The website Editor (ADR-0043): one layout that owns the working copy, and a screen per section.
// The loaders are shared with the nav's "preload on intent"; loading the layout also starts the draft request.
const EditorLayout = lazy(loadEditorLayout)
const EditorPagesScreen = lazy(loadPagesScreen)
const EditorPageScreen = lazy(loadPageEditorScreen)
const EditorApplyScreen = lazy(loadApplyScreen)
const EditorSocialScreen = lazy(loadSocialScreen)
const EditorPreview = lazy(() => import('@/features/editor/EditorPreview'))

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
const ModelRequestsPage = lazy(() => import('@/features/admin/ModelRequestsPage'))
const ModelRequestDetailPage = lazy(() => import('@/features/admin/ModelRequestDetailPage'))
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
  // The footer pages and social links are loaded once and shared by every public page (spec 9).
  return (
    <SiteContentProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </SiteContentProvider>
  )
}

/** /demo on the live site: the sign-in page, keeping ?next= and the rest of the query. */
function ToLogin() {
  const { search } = useLocation()
  return <Navigate to={`/login${search}`} replace />
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
    { path: 'model-requests', element: <RequirePermission need="models.manage"><ModelRequestsPage /></RequirePermission> },
    { path: 'model-requests/:requestId', element: <RequirePermission need="models.manage"><ModelRequestDetailPage /></RequirePermission> },
    { path: 'analytics', element: <RequirePermission need="analytics.view"><AdminAnalyticsPage /></RequirePermission> },
    { path: 'catalogs', element: <RequirePermission need="products.view"><AdminCatalogsPage /></RequirePermission> },
    // The website Editor: pages, application form and social links, with draft, preview, publish and history (content.manage + 2FA).
    {
      path: 'editor',
      element: <RequirePermission need="content.manage"><EditorLayout /></RequirePermission>,
      children: [
        { index: true, element: <Navigate to="pages" replace /> },
        { path: 'pages', element: <EditorPagesScreen /> },
        { path: 'pages/:pageKey', element: <EditorPageScreen /> },
        { path: 'apply', element: <EditorApplyScreen /> },
        { path: 'social', element: <EditorSocialScreen /> },
      ],
    },
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

// The Editor's preview is full-screen, outside DashboardShell (the public components keep their own styles), behind the same
// role guard, 2FA gate and permission as the Editor.
const editorPreviewRoute: RouteObject = {
  path: '/admin/editor/preview/*',
  element: (
    <RequireRole allow="super_admin">
      <SecurityGate>
        <RequirePermission need="content.manage">
          <EditorPreview />
        </RequirePermission>
      </SecurityGate>
    </RequireRole>
  ),
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
            // The demo account picker exists only in demo mode; on the live site /demo goes to the sign-in page.
            { path: '/demo', element: isDemoMode ? <DemoEntryPage /> : <ToLogin /> },
            { path: '/login', element: <LoginPage /> },
            { path: JOIN_PATH, element: <JoinPage /> },
            ...settingsRoutes,
            editorPreviewRoute,
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
            { path: '/pages/:slug', element: <CustomPage /> },
            { path: '/reset-password', element: <ResetPasswordPage /> },
            { path: '/accept-invite', element: <AcceptInvitePage /> },
            { path: '/catalog/:businessSlug', element: <LowercaseSlugs route="catalog"><CatalogPage /></LowercaseSlugs> },
            { path: '/products/:businessSlug/:productSlug', element: <LowercaseSlugs route="product"><ProductPage /></LowercaseSlugs> },
            // Framable by any website (vercel.json, ADR-0026); chrome-less, public data only.
            { path: '/embed/products/:businessSlug/:productSlug', element: <LowercaseSlugs route="embed"><EmbedProductPage /></LowercaseSlugs> },
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
            { path: '/products/:productSlug', element: <LowercaseSlugs route="product" tenant><ProductPage tenantSlug={slug} /></LowercaseSlugs> },
            { path: '/embed/products/:productSlug', element: <LowercaseSlugs route="embed" tenant><EmbedProductPage tenantSlug={slug} /></LowercaseSlugs> },
            // The catalogue and product footers link here, so the legal pages answer on business subdomains too.
            { path: PRIVACY_PATH, element: <LegalPage doc="privacy" tenant /> },
            { path: TERMS_PATH, element: <LegalPage doc="terms" tenant /> },
            { path: '/pages/:slug', element: <CustomPage tenant /> },
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
