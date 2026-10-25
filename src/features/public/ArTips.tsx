import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/i18n/LanguageProvider'

export const AR_TIPS_KEY = 'arfurn:arTipsDismissed'

export function arTipsDismissed(): boolean {
  try {
    return localStorage.getItem(AR_TIPS_KEY) === '1'
  } catch {
    return false
  }
}

/** First-time AR guidance. Shown before AR starts unless dismissed. */
export function ArTips({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart?: () => void }) {
  const { t } = useI18n()
  const [dontShow, setDontShow] = useState(false)
  const persist = () => {
    if (!dontShow) return
    try {
      localStorage.setItem(AR_TIPS_KEY, '1')
    } catch {
      // Storage blocked (private mode): tips show again next time; AR must still start.
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        persist()
        onClose()
      }}
      title={t('ar.tipsTitle')}
      size="sm"
      closeLabel={t('common.close')}
      footer={
        onStart ? (
          <Button
            variant="brand"
            className="w-full sm:w-auto"
            data-autofocus
            onClick={() => {
              persist()
              onStart()
            }}
          >
            {t('ar.tipsStart')}
          </Button>
        ) : (
          <Button
            onClick={() => {
              persist()
              onClose()
            }}
          >
            {t('ar.tipsClose')}
          </Button>
        )
      }
    >
      <ol className="space-y-3">
        {(['ar.tip1', 'ar.tip2', 'ar.tip3', 'ar.tip4'] as const).map((k, i) => (
          <li key={k} className="flex gap-3 text-sm leading-6">
            <span className="grid size-6 shrink-0 place-items-center rounded-[2px] border border-line font-display text-[15px] leading-none text-accent-ink tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            {t(k)}
          </li>
        ))}
      </ol>
      {onStart && <Checkbox className="mt-5" label={t('ar.tipsDontShow')} checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />}
    </Modal>
  )
}
