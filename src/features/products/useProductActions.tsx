import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, Product } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText, fieldText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'
import { copyText } from '@/lib/clipboard'
import { PUBLIC_URLS_ARE_LIVE, needsPreview, productLocalPath, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import type { ServiceError } from '@/services/catalogService'
import { deletedToast } from '../shared/storageSweep'

export type EditorScope = 'admin' | 'business'

const hasAnyModel = (p: Pick<Product, 'models' | 'variants'>) =>
  [p.models, ...(p.variants ?? []).map((v) => v.models)].some((m) => !!m?.glb || !!m?.usdz)

export function editPath(scope: EditorScope, p: Pick<Product, 'id'>) {
  return scope === 'admin' ? `/admin/products/${p.id}/edit` : `/dashboard/products/${p.id}/edit`
}

export function describeErrors(err: ServiceError, t: (key: TranslationKey, vars?: Vars) => string): string {
  const fields = Object.values(err.fieldErrors ?? {}).map((e) => fieldText(e, t) ?? '')
  return fields.length ? fields.slice(0, 3).join(' ') : errorText(err, t)
}

/** Shared product actions for both dashboards. Every action reports its outcome with a toast. */
export function useProductActions(scope: EditorScope) {
  const toast = useToast()
  const { t, tn } = useI18n()
  const confirm = useConfirm()
  const navigate = useNavigate()

  return {
    async duplicate(p: Product) {
      const r = await service.duplicateProduct(p.id)
      if (!r.ok) return toast.error(t('products.actions.duplicateFailed'), errorText(r.error, t))
      // S4 R-S4-3 (Review Focus 1): a business that can't write its own 3D files gets a photo-only copy.
      const lostModels = hasAnyModel(p) && !hasAnyModel(r.data)
      toast.success(
        t('products.actions.duplicated'),
        t(lostModels ? 'products.actions.duplicatedNoModel' : 'products.actions.duplicatedBody', { name: r.data.name.en }),
      )
      return r.data
    },
    async publish(p: Product, business?: Business) {
      const r = await service.publishProduct(p.id)
      if (!r.ok) return toast.error(t('products.actions.publishFailed'), describeErrors(r.error, t))
      if (business && business.status !== 'active')
        toast.success(t('products.actions.published'), t('products.actions.publishedInactive'))
      else
        toast.success(
          t('products.actions.published'),
          business ? t(PUBLIC_URLS_ARE_LIVE ? 'products.actions.liveAt' : 'products.actions.liveAtDemo', { url: productPublicUrl(business, p) }) : undefined,
        )
      return r.data
    },
    async unpublish(p: Product) {
      const ok = await confirm({
        title: t('products.actions.unpublishTitle', { name: p.name.en }),
        body: t('products.actions.unpublishBody'),
        confirmLabel: t('products.actions.unpublish'),
      })
      if (!ok) return
      const r = await service.unpublishProduct(p.id)
      if (!r.ok) return toast.error(t('products.actions.unpublishFailed'), errorText(r.error, t))
      toast.success(t('products.actions.unpublished'), t('products.actions.unpublishedBody'))
      return r.data
    },
    async remove(p: Product, opts?: { after?: string }) {
      const ok = await confirm({
        title: t('products.actions.deleteTitle', { name: p.name.en }),
        body: t('products.actions.deleteBody'),
        confirmLabel: t('products.actions.deleteConfirm'),
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteProduct(p.id)
      if (!r.ok) {
        toast.error(t('products.actions.deleteFailed'), errorText(r.error, t))
        return false
      }
      if (r.data.failedFiles > 0) toast.info(deletedToast('Product', r.data, { t, tn }))
      else toast.success(deletedToast('Product', r.data, { t, tn }))
      if (opts?.after) navigate(opts.after)
      return true
    },
    async copyUrl(p: Product, business: Business | undefined) {
      if (!business) return
      const ok = await copyText(productPublicUrl(business, p))
      // A copied link must not look ready to share when customers would get "not available" (DUX-09).
      const caveat =
        p.status !== 'published'
          ? t('products.actions.copyCaveatDraft')
          : business.status !== 'active'
            ? t('products.actions.copyCaveatInactive')
            : undefined
      const demo = PUBLIC_URLS_ARE_LIVE ? undefined : t('products.actions.demoAddress')
      if (ok) toast.success(t('products.actions.urlCopied'), [caveat, demo].filter(Boolean).join(' ') || undefined)
      else toast.error(t('products.actions.copyFailed'), t('products.actions.clipboardBlocked'))
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
