import type { ReactElement, ReactNode } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'
import { catalogLocalPath, productEmbedLocalPath, productLocalPath, tenantProductEmbedPath, tenantProductPath } from '@/lib/urls'

/**
 * Slugs are lower case, but a shared link may not be (R-W4-9: "/catalog/Casa-Lisboa"). Sends such a link to its
 * lower-case address, keeping the query and hash, instead of showing "not found". The path comes from the url helpers.
 */
export function LowercaseSlugs({ route, tenant, children }: { route: 'catalog' | 'product' | 'embed'; tenant?: boolean; children: ReactNode }): ReactElement {
  const params = useParams()
  const { search, hash } = useLocation()
  const b = (params.businessSlug ?? '').toLowerCase()
  const p = (params.productSlug ?? '').toLowerCase()
  const upper = [params.businessSlug, params.productSlug].some((s) => s !== undefined && s !== s.toLowerCase())
  if (!upper) return <>{children}</>
  const path =
    route === 'catalog'
      ? catalogLocalPath({ slug: b })
      : route === 'product'
        ? tenant
          ? tenantProductPath({ slug: p })
          : productLocalPath({ slug: b }, { slug: p })
        : tenant
          ? tenantProductEmbedPath({ slug: p })
          : productEmbedLocalPath({ slug: b }, { slug: p })
  return <Navigate replace to={`${path}${search}${hash}`} />
}
