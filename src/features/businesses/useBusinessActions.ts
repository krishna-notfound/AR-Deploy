import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { deletedToast } from '../shared/storageSweep'
import { service } from '@/services'

export function useBusinessActions() {
  const { t, tn } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  return {
    async setActive(b: Business, active: boolean) {
      const ok = await confirm(
        active
          ? { title: t('admin.businesses.actions.activateTitle', { name: b.name }), body: t('admin.businesses.actions.activateBody'), confirmLabel: t('admin.businesses.actions.activate') }
          : {
              title: t('admin.businesses.actions.deactivateTitle', { name: b.name }),
              body: t('admin.businesses.actions.deactivateBody'),
              confirmLabel: t('admin.businesses.actions.deactivate'),
              destructive: true,
            },
      )
      if (!ok) return
      const r = await service.setBusinessStatus(b.id, active ? 'active' : 'inactive')
      // A closure request opened after the page loaded (R-W1-3): the server refuses and says why.
      if (!r.ok) return toast.error(t(r.error.reason === 'closure_pending' ? 'admin.businesses.actions.notActivated' : 'admin.businesses.actions.statusFailed'), errorText(r.error, t))
      toast.success(t(active ? 'admin.businesses.actions.activated' : 'admin.businesses.actions.deactivated'))
    },
    /** `productCount` is undefined when the products could not be counted; the dialog then says "all of its products", never a wrong number. */
    async remove(b: Business, productCount: number | undefined, opts?: { after?: string }) {
      const products = productCount === undefined ? t('admin.businesses.actions.allProducts') : tn('admin.businesses.actions.productCount', productCount)
      const ok = await confirm({
        title: t('admin.businesses.actions.deleteTitle', { name: b.name }),
        body: t('admin.businesses.actions.deleteBody', { products }),
        confirmLabel: t('admin.businesses.actions.delete'),
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteBusiness(b.id)
      if (!r.ok) {
        toast.error(t('admin.businesses.actions.deleteFailed'), errorText(r.error, t))
        return false
      }
      if (r.data.failedFiles > 0) toast.info(deletedToast('Business', r.data, { t, tn }))
      else toast.success(deletedToast('Business', r.data, { t, tn }))
      if (opts?.after) navigate(opts.after)
      return true
    },
  }
}
