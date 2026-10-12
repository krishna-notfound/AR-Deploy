import { useNavigate } from 'react-router'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'

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
      if (!r.ok) return toast.error('Could not update catalog status', r.error.message)
      toast.success(active ? 'Catalog activated' : 'Catalog deactivated', 'Status changed in the demo.')
    },
    async remove(b: Business, productCount: number, opts?: { after?: string }) {
      const ok = await confirm({
        title: `Delete ${b.name}?`,
        body: `This permanently deletes the business, its catalog and ${productCount} product${productCount === 1 ? '' : 's'} from the demo. Printed QR codes will stop working. This cannot be undone.`,
        confirmLabel: 'Delete business',
        destructive: true,
      })
      if (!ok) return false
      const r = await service.deleteBusiness(b.id)
      if (!r.ok) {
        toast.error('Could not delete business', r.error.message)
        return false
      }
      toast.success('Business deleted')
      if (opts?.after) navigate(opts.after)
      return true
    },
  }
}
