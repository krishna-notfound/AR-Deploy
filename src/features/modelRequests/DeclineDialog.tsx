// "Decline this request?" (S4 §9.1, R-S4-14). The reason is required and is sent to the business.
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { REQUEST_TEXT_MAX } from '@/domain/modelRequests'
import { useI18n } from '@/i18n/LanguageProvider'
import { tEn } from './copy'

export const DECLINE_HINT = tEn('business.modelRequests.decline.hint')
export const REASON_REQUIRED = tEn('business.modelRequests.decline.reasonRequired')

export function DeclineDialog({ open, onClose, onConfirm, pending }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void; pending?: boolean }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('business.modelRequests.decline.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => {
              const text = reason.trim()
              if (!text) return setMissing(true)
              onConfirm(text)
            }}
          >
            {t('business.modelRequests.decline.confirm')}
          </Button>
        </>
      }
    >
      <FormField label={t('business.modelRequests.decline.reasonLabel')} required hint={t('business.modelRequests.decline.hint')} error={missing ? t('business.modelRequests.decline.reasonRequired') : undefined}>
        <Textarea
          value={reason}
          maxLength={REQUEST_TEXT_MAX}
          onChange={(e) => {
            setReason(e.target.value)
            setMissing(false)
          }}
        />
      </FormField>
    </Modal>
  )
}
