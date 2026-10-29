// "Deliver the 3D model" confirmation (S4 §9.1, R-S4-13) and the toast wording for every staff outcome.
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import type { ModelRequestOutcome } from '@/domain/modelRequests'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { hasTranslation } from '@/i18n/translate'
import { type T, tEn } from './copy'

export const NO_USDZ_WARNING = tEn('business.modelRequests.deliver.noUsdz')

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
  const { t } = useI18n()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('business.modelRequests.deliver.title', { name: productName })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={pending} onClick={onConfirm}>
            {t('business.modelRequests.deliver.confirm')}
          </Button>
        </>
      }
    >
      <p>{optionName ? t('business.modelRequests.deliver.bodyOption', { name: optionName }) : t('business.modelRequests.deliver.bodyProduct')}</p>
      {!hasUsdz && <p className="mt-3 text-warning">{t('business.modelRequests.deliver.noUsdz')}</p>}
    </Modal>
  )
}

/** Fixed copy for the email reason codes we know; unknown (provider) text is never shown. */
function knownReason(code: string | undefined, t: T): string | undefined {
  if (!code) return undefined
  const key = `business.modelRequests.emailReason.${code}`
  return hasTranslation(key) ? t(key as TranslationKey) : undefined
}

/**
 * The toast for a start, delivery or decline outcome (§9.1); the tone is an error only when the email failed.
 * Pass `t` from `useI18n()`; without it the title is English.
 */
export function reviewToast(action: 'start' | 'deliver' | 'decline', o: ModelRequestOutcome, t: T = tEn): { tone: 'success' | 'error'; title: string } {
  const cleanup = o.cleanup === 'partial' ? ` ${t('business.modelRequests.toast.cleanupPartial')}` : ''
  if (action === 'start') return { tone: 'success', title: `${t('business.modelRequests.toast.started')}${cleanup}` }
  const done = t(action === 'deliver' ? 'business.modelRequests.toast.delivered' : 'business.modelRequests.toast.declined')
  const email = o.email
  if (!email) return { tone: 'success', title: `${t('business.modelRequests.toast.plain', { done })}${cleanup}` }
  switch (email.status) {
    case 'accepted':
      return { tone: 'success', title: `${t('business.modelRequests.toast.emailAccepted', { done })}${cleanup}` }
    case 'skipped':
      return { tone: 'success', title: `${t('business.modelRequests.toast.emailSkipped', { done })}${cleanup}` }
    case 'demo':
      return { tone: 'success', title: `${t('business.modelRequests.toast.emailDemo', { done })}${cleanup}` }
    case 'failed':
    case 'blocked': {
      const why = (knownReason(email.error, t) ?? t('business.modelRequests.emailReason.unknown')).replace(/\.$/, '')
      return { tone: 'error', title: `${t('business.modelRequests.toast.emailFailed', { done, why })}${cleanup}` }
    }
  }
}
