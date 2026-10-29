import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { LEGAL_CONTENT } from '../legal/content.generated'
import { countPlaceholders } from './problems'
import type { DraftEditor } from './useDraftEditor'

const GROUPS = [
  ['pages', 'editor.summary.pages'],
  ['footer', 'editor.summary.footer'],
  ['applicationTexts', 'editor.summary.applicationTexts'],
  ['applicationSteps', 'editor.summary.applicationSteps'],
  ['applicationFields', 'editor.summary.applicationFields'],
  ['questions', 'editor.summary.questions'],
  ['social', 'editor.summary.social'],
] as const satisfies readonly (readonly [string, TranslationKey])[]

/** "Publish N changes to the live site?": the counts by group and the placeholders still to be completed. */
export function PublishDialog({ editor, onClose }: { editor: DraftEditor; onClose: () => void }) {
  const { t, tn } = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const placeholders = useMemo(() => countPlaceholders(editor.draft, LEGAL_CONTENT), [editor.draft])
  const { changes } = editor

  const publish = async () => {
    setBusy(true)
    setProblem(null)
    const r = await editor.publish()
    setBusy(false)
    if (r.ok) {
      toast.success(t('editor.publish.done', { n: r.data.version }))
      onClose()
    } else if (r.error.reason === 'draft_conflict' || r.error.code === 'CONFLICT') setProblem(t('editor.publish.conflict'))
    else setProblem(errorText(r.error, t))
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={tn('editor.publish.confirmTitle', changes.total)}
      description={t('editor.publish.confirmBody')}
      size="sm"
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void publish()} loading={busy}>
            {t('editor.publish')}
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-line border-y border-line text-ui-body" aria-label={t('editor.publish.summaryLabel')}>
        {GROUPS.filter(([k]) => changes[k] > 0).map(([k, label]) => (
          <li key={k} className="flex items-center justify-between gap-4 py-2">
            <span>{t(label)}</span>
            <span className="font-medium tabular-nums text-ink">{changes[k]}</span>
          </li>
        ))}
      </ul>
      {placeholders > 0 && (
        <p role="note" className="mt-4 border border-warning/40 bg-warning-soft px-3 py-2 text-ui-small text-warning">
          {tn('editor.publish.placeholders', placeholders)}
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-4 text-ui-small text-danger">
          {problem}
        </p>
      )}
    </Modal>
  )
}
