import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, Product } from '@/domain/types'
import { copyText } from '@/lib/clipboard'
import { productLocalPath, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import type { ServiceError } from '@/services/catalogService'

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
      toast.success('Published', business ? `Live at the demo URL ${productPublicUrl(business, p)}` : undefined)
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
        body: 'This permanently removes the product, its images and its analytics from the demo. This cannot be undone.',
        confirmLabel: 'Delete product',
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteProduct(p.id)
      if (!r.ok) {
        toast.error('Could not delete product', r.error.message)
        return false
      }
      toast.success('Product deleted')
      if (opts?.after) navigate(opts.after)
      return true
    },
    async copyUrl(p: Product, business: Business | undefined) {
      if (!business) return
      const ok = await copyText(productPublicUrl(business, p))
      if (ok) toast.success('Product URL copied', 'This is a demo URL. The real domain is configured with the backend.')
      else toast.error('Copy failed', 'Your browser blocked clipboard access.')
    },
    openPreview(p: Product, business: Business | undefined) {
      if (!business) return
      window.open(productLocalPath(business, p, { preview: p.status !== 'published' }), '_blank', 'noopener')
    },
    edit(p: Product) {
      navigate(editPath(scope, p))
    },
  }
}
