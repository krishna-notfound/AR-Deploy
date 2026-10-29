import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import type { CustomAnswer } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { pickLocalized } from '@/i18n/translate'

/**
 * The answers to the questions the client added to the application form ("Extra questions" on the detail page). It reads
 * the snapshot stored with the application, so it stays correct after the question is edited or removed. Choices show the
 * option labels as they were on the day, in the reviewer's language (English when there is no Portuguese). Renders
 * nothing when the application has no extra answers.
 */
export function ExtraQuestionsCard({ custom }: { custom?: CustomAnswer[] | null }) {
  const { t, lang } = useI18n()
  if (!custom?.length) return null
  const text = (v: { en: string; pt?: string }) => pickLocalized(v, lang).text
  const answerOf = (a: CustomAnswer): string => {
    if (typeof a.value === 'boolean') return t(a.value ? 'common.yes' : 'common.no')
    if (a.valueLabels?.length) return a.valueLabels.map(text).join(', ')
    return Array.isArray(a.value) ? a.value.join(', ') : a.value
  }
  return (
    <Card>
      <PanelHeader title={t('applications.extra.title')} description={t('applications.extra.description')} />
      <CardBody>
        <dl className="divide-y divide-subtle">
          {custom.map((a) => (
            <div key={a.id} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
              <dt className="text-ui-body text-ink-muted">{text(a.label)}</dt>
              <dd className="text-ui-body break-words whitespace-pre-line text-ink">{answerOf(a) || <span className="text-ink-muted italic">{t('applications.extra.notGiven')}</span>}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  )
}
