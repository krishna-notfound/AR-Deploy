// "Deliver the 3D model" confirmation (S4 §9.1, R-S4-13) and the toast wording for every staff outcome.
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { ModelRequestOutcome } from '@/domain/modelRequests'
import { emailReason } from '@/features/applications/labels'
import { DEMO_NO_EMAIL } from './copy'

export const NO_USDZ_WARNING = "There's no USDZ file. iPhone AR then depends on the phone converting the GLB, which isn't guaranteed."

export function DeliverDialog({
  open,
  onClose,
  onConfirm,
  pending,
  productName,
  optionName,
  hasUsdz,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  pending?: boolean
  productName: string
  /** Set when the request is for one of the product's options. */
  optionName?: string
  hasUsdz: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Deliver the 3D model for ${productName}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            Deliver model
          </Button>
        </>
      }
    >
      <p>
        These files replace the current 3D files of {optionName ? `the option ${optionName}` : 'the product'}. If the product is published, customers see the 3D view and AR right away. The business owner is emailed.
      </p>
      {!hasUsdz && <p className="mt-3 text-warning">{NO_USDZ_WARNING}</p>}
    </Modal>
  )
}

/** The toast for a start, delivery or decline outcome (§9.1); the tone is an error only when the email failed. */
export function reviewToast(action: 'start' | 'deliver' | 'decline', o: ModelRequestOutcome): { tone: 'success' | 'error'; title: string } {
  const cleanup = o.cleanup === 'partial' ? " Some old files couldn't be removed." : ''
  if (action === 'start') return { tone: 'success', title: `Work started.${cleanup}` }
  const done = action === 'deliver' ? 'Model delivered' : 'Request declined'
  const email = o.email
  if (!email) return { tone: 'success', title: `${done}.${cleanup}` }
  switch (email.status) {
    case 'accepted':
      return { tone: 'success', title: `${done}. The business owner was emailed.${cleanup}` }
    case 'skipped':
      return { tone: 'success', title: `${done}. The business has no owner, so no email was sent.${cleanup}` }
    case 'demo':
      return { tone: 'success', title: `${done}. ${DEMO_NO_EMAIL}${cleanup}` }
    case 'failed':
    case 'blocked': {
      const why = (emailReason(email.error) ?? 'the email service did not take it').replace(/\.$/, '')
      return { tone: 'error', title: `${done}, but the email was not sent: ${why}.${cleanup}` }
    }
  }
}
