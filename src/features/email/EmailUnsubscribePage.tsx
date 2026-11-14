import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { InlineNotice } from '@/components/ui/States'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { emailTypeOfToken } from '@/lib/emailUnsubscribe'
import { useNoIndex } from '@/lib/pageMeta'
import { EMAIL_PREFERENCES_PATH } from '@/lib/urls'
import { notifications } from '@/services'
import { AuthHeading, AuthLayout } from '../auth/AuthLayout'

type Step = { name: 'confirm' } | { name: 'working' } | { name: 'done' } | { name: 'error'; reason: string }

/**
 * The page behind an email's Unsubscribe link (ADR-0078). Opening it changes nothing: link scanners open every link in an email,
 * so the person presses the button, and only then does the Edge Function switch that one email type off. No sign-in needed:
 * the signed token in the link is the credential. A link that cannot be read, or that the server refuses (invalid, expired), gets a
 * plain message and the way to the email preferences.
 */
export default function EmailUnsubscribePage() {
  const { t } = useI18n()
  useDocumentTitle(t('emailUnsub.eyebrow'))
  useNoIndex()
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const type = emailTypeOfToken(token)
  const [step, setStep] = useState<Step>(type ? { name: 'confirm' } : { name: 'error', reason: 'invalid_token' })
  const typeLabel = type ? t(`emailUnsub.type.${type}` as TranslationKey) : ''

  const unsubscribe = async () => {
    setStep({ name: 'working' })
    const r = await notifications.unsubscribeEmail(token)
    setStep(r.ok ? { name: 'done' } : { name: 'error', reason: r.error.reason ?? 'unknown' })
  }

  const preferences = (
    <ButtonLink to={EMAIL_PREFERENCES_PATH} variant={step.name === 'done' ? 'primary' : 'secondary'} className="mt-8">
      {t('emailUnsub.preferences')}
    </ButtonLink>
  )

  let body
  if (step.name === 'confirm' || step.name === 'working') {
    body = (
      <>
        <AuthHeading eyebrow={t('emailUnsub.eyebrow')} title={t('emailUnsub.confirm.title', { type: typeLabel })}>
          <p>{t('emailUnsub.confirm.body')}</p>
        </AuthHeading>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" disabled={step.name === 'working'} onClick={() => void unsubscribe()}>
            {step.name === 'working' ? t('emailUnsub.working') : t('emailUnsub.confirm.button')}
          </Button>
          <ButtonLink to={EMAIL_PREFERENCES_PATH} variant="secondary">
            {t('emailUnsub.preferences')}
          </ButtonLink>
        </div>
      </>
    )
  } else if (step.name === 'done') {
    body = (
      <>
        <AuthHeading eyebrow={t('emailUnsub.eyebrow')} title={t('emailUnsub.done.title')}>
          <p role="status">{t('emailUnsub.done.body', { type: typeLabel })}</p>
        </AuthHeading>
        {preferences}
      </>
    )
  } else {
    const expired = step.reason === 'expired_token'
    const retryable = step.reason === 'rate_limited' || step.reason === 'unknown'
    body = (
      <>
        <AuthHeading eyebrow={t('emailUnsub.eyebrow')} title={expired ? t('emailUnsub.expired.title') : retryable ? t('emailUnsub.eyebrow') : t('emailUnsub.invalid.title')}>
          {!retryable && <p>{expired ? t('emailUnsub.expired.body') : t('emailUnsub.invalid.body')}</p>}
        </AuthHeading>
        {retryable && (
          <InlineNotice tone="warning" className="mt-6">
            {step.reason === 'rate_limited' ? t('emailUnsub.rateLimited') : t('emailUnsub.failed')}
          </InlineNotice>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          {retryable && (
            <Button variant="primary" onClick={() => void unsubscribe()}>
              {t('emailUnsub.confirm.button')}
            </Button>
          )}
          <ButtonLink to={EMAIL_PREFERENCES_PATH} variant="secondary">
            {t('emailUnsub.preferences')}
          </ButtonLink>
        </div>
      </>
    )
  }

  return <AuthLayout page="resetPassword">{body}</AuthLayout>
}
