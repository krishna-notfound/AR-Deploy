// "Decline this request?" (S4 §9.1, R-S4-14). The reason is required and is sent to the business.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { REQUEST_TEXT_MAX } from '@/domain/modelRequests'

export const DECLINE_HINT = 'For example: the photos are too dark. Please send a new request with photos taken in daylight.'
export const REASON_REQUIRED = 'Write a reason. It is sent to the business.'

export function DeclineDialog({ open, onClose, onConfirm, pending }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; pending?: boolean }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Decline this request?"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const text = reason.trim()
              if (!text) return setError(REASON_REQUIRED)
              onConfirm(text)
            }}
          >
            Decline request
          </Button>
        </>
      }
    >
      <FormField label="Reason (sent to the business)" required hint={DECLINE_HINT} error={error ?? undefined}>
        <Textarea
          value={reason}
          maxLength={REQUEST_TEXT_MAX}
          onChange={(e) => {
            setReason(e.target.value)
            setError(null)
          }}
        />
      </FormField>
    </Modal>
  )
}
