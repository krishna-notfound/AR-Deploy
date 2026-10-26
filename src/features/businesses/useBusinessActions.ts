import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { deletedToast } from '../shared/storageSweep'

export function useBusinessActions() {
  const confirm = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  return {
    async setActive(b: Business, active: boolean) {
      const ok = await confirm(
        active
          ? { title: `Activate ${b.name}’s catalog?`, body: 'Published products become visible to customers at the catalog URL and QR code.', confirmLabel: 'Activate catalog' }
          : {
              title: `Deactivate ${b.name}’s catalog?`,
              body: 'Customers will see “catalog unavailable” at the catalog URL and QR code. Products and data are kept.',
              confirmLabel: 'Deactivate catalog',
              destructive: true,
            },
      )
      if (!ok) return
      const r = await service.setBusinessStatus(b.id, active ? 'active' : 'inactive')
      // A closure request opened after the page loaded (R-W1-3): the server refuses and says why.
      if (!r.ok) return toast.error(r.error.reason === 'closure_pending' ? 'Catalog not activated' : 'Could not update catalog status', r.error.message)
      toast.success(active ? 'Catalog activated' : 'Catalog deactivated')
    },
    /** `productCount` is undefined when the products could not be counted; the dialog then says "all of its products", never a wrong number. */
    async remove(b: Business, productCount: number | undefined, opts?: { after?: string }) {
      const products = productCount === undefined ? 'all of its products' : `${productCount} product${productCount === 1 ? '' : 's'}`
      const ok = await confirm({
        title: `Delete ${b.name}?`,
        body: `This permanently deletes the business, its catalog and ${products}. Printed QR codes will stop working. The owner's sign-in stays, but they lose access. The application that created it shows as 'Business deleted'. This cannot be undone.`,
        confirmLabel: 'Delete business',
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteBusiness(b.id)
      if (!r.ok) {
        toast.error('Could not delete business', r.error.message)
        return false
      }
      if (r.data.failedFiles > 0) toast.info(deletedToast('Business', r.data))
      else toast.success(deletedToast('Business', r.data))
      if (opts?.after) navigate(opts.after)
      return true
    },
  }
}
