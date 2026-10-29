import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { content } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import type { DraftEditor } from './useDraftEditor'

/** Published versions, newest first. Restoring one copies it into the draft; it does not go live until published. */
export function HistoryDialog({ editor, onClose, onRestored }: { editor: DraftEditor; onClose: () => void; onRestored: (version: number) => void }) {
  const { t } = useI18n()
  const format = useFormat()
  const confirm = useConfirm()
  const versions = useServiceQuery(() => content.listContentVersions(), [])
  const [busy, setBusy] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const restore = async (version: number) => {
    const yes = await confirm({
      title: t('editor.history.confirmTitle', { n: version }),
      body: t('editor.history.confirmBody'),
      confirmLabel: t('editor.history.restore'),
    })
    if (!yes) return
    setBusy(version)
    setProblem(null)
    const r = await editor.restore(version)
    setBusy(null)
    if (r.ok) {
      onRestored(version)
      onClose()
    } else setProblem(r.error.reason === 'draft_conflict' ? t('editor.conflict.banner') : errorText(r.error, t))
  }

  return (
    <Modal open onClose={onClose} title={t('editor.history')} description={t('editor.history.description')} closeLabel={t('common.close')} size="md">
      {versions.status === 'loading' && !versions.data && <SkeletonRows rows={3} />}
      {versions.status === 'error' && <ErrorState message={errorText(versions.error, t)} onRetry={versions.refetch} retryLabel={t('common.retry')} />}
      {versions.data && versions.data.length === 0 && <p className="text-ui-body text-ink-muted">{t('editor.history.empty')}</p>}
      {versions.data && versions.data.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {versions.data.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-ui-body text-ink">
                {t('editor.history.row', { n: v.version, date: format.dateTime(v.publishedAt), name: v.publishedByName })}
              </span>
              <Button size="sm" onClick={() => void restore(v.version)} loading={busy === v.version} disabled={busy !== null}>
                {t('editor.history.restore')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="mt-4 text-ui-small text-danger">
          {problem}
        </p>
      )}
    </Modal>
  )
}
