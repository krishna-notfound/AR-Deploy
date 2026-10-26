import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, Product } from '@/domain/types'
import { copyText } from '@/lib/clipboard'
import { PUBLIC_URLS_ARE_LIVE, needsPreview, productLocalPath, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import type { ServiceError } from '@/services/catalogService'
import { deletedToast } from '../shared/storageSweep'

export type EditorScope = 'admin' | 'business'

export function editPath(scope: EditorScope, p: Pick<Product, 'id'>) {
  return scope === 'admin' ? `/admin/products/${p.id}/edit` : `/dashboard/products/${p.id}/edit`
}

export function describeErrors(err: ServiceError): string {
  const fields = Object.values(err.fieldErrors ?? {})
  return fields.length ? fields.slice(0, 3).join(' ') : err.message
}

/** Shared product actions for both dashboards. Every action reports its outcome with a toast. */
export function useProductActions(scope: EditorScope) {
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()

  return {
    async duplicate(p: Product) {
      const r = await service.duplicateProduct(p.id)
      if (!r.ok) return toast.error('Could not duplicate product', r.error.message)
      toast.success('Product duplicated', `“${r.data.name.en}” was created as a draft.`)
      return r.data
    },
    async publish(p: Product, business?: Business) {
      const r = await service.publishProduct(p.id)
      if (!r.ok) return toast.error('Cannot publish yet', describeErrors(r.error))
      if (business && business.status !== 'active')
        toast.success('Published', 'The catalog is not active yet: customers will see this product once the business is activated.')
      else toast.success('Published', business ? `Live at ${PUBLIC_URLS_ARE_LIVE ? '' : 'the demo URL '}${productPublicUrl(business, p)}` : undefined)
      return r.data
    },
    async unpublish(p: Product) {
      const ok = await confirm({
        title: `Unpublish “${p.name.en}”?`,
        body: 'Customers will no longer see this product in the catalog. Existing links will show “product not available”.',
        confirmLabel: 'Unpublish',
      })
      if (!ok) return
      const r = await service.unpublishProduct(p.id)
      if (!r.ok) return toast.error('Could not unpublish', r.error.message)
      toast.success('Unpublished', 'The product is now a draft.')
      return r.data
    },
    async remove(p: Product, opts?: { after?: string }) {
      const ok = await confirm({
        title: `Delete “${p.name.en}”?`,
        body: "This permanently removes the product and its images. This cannot be undone. Its past views stay in your totals as 'Deleted product'.",
        confirmLabel: 'Delete product',
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteProduct(p.id)
      if (!r.ok) {
        toast.error('Could not delete product', r.error.message)
        return false
      }
      if (r.data.failedFiles > 0) toast.info(deletedToast('Product', r.data))
      else toast.success(deletedToast('Product', r.data))
      if (opts?.after) navigate(opts.after)
      return true
    },
    async copyUrl(p: Product, business: Business | undefined) {
      if (!business) return
      const ok = await copyText(productPublicUrl(business, p))
      // A copied link must not look ready to share when customers would get "not available" (DUX-09).
      const caveat =
        p.status !== 'published'
          ? 'This link works once the product is published.'
          : business.status !== 'active'
            ? 'This link works once your catalog is activated.'
            : undefined
      const demo = PUBLIC_URLS_ARE_LIVE ? undefined : 'Example address for this demo.'
      if (ok) toast.success('Product URL copied', [caveat, demo].filter(Boolean).join(' ') || undefined)
      else toast.error('Copy failed', 'Your browser blocked clipboard access.')
    },
    openPreview(p: Product, business: Business | undefined) {
      if (!business) return
      window.open(productLocalPath(business, p, { preview: needsPreview(p, business) }), '_blank', 'noopener')
    },
    edit(p: Product) {
      navigate(editPath(scope, p))
    },
  }
}
