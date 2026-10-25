// TEMP STUB (Task 8): replaced by Task 6's ActionCodeDialog at merge
// Same signature as Task 6's contract; just enough (send on open, code input, confirm) for Task 8 to compile and test.
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import type { ActionPurpose } from '@/domain/types'
import { account } from '@/services'
import type { Result } from '@/services/catalogService'

export function ActionCodeDialog({
  open,
  purpose,
  title,
  description,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  open: boolean
  purpose: ActionPurpose
  title: string
  description?: string
  confirmLabel: string
  destructive?: boolean
  onClose: () => void
  onConfirm: (code: string) => Promise<Result<unknown>>
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCode('')
    setError(null)
    void account.sendActionCode(purpose)
  }, [open, purpose])

  const confirm = async () => {
    setBusy(true)
    const r = await onConfirm(code.trim())
    setBusy(false)
    if (!r.ok) setError(r.error.message)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} loading={busy} disabled={!/^\d{6}$/.test(code.trim())} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <FormField label="Code" error={error ?? undefined}>
        <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
      </FormField>
    </Modal>
  )
}
