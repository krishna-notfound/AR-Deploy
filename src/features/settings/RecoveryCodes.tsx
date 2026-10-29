import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Checkbox } from '@/components/ui/Form'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { type Vars, translate } from '@/i18n/translate'

/** The plain-text form of a set of recovery codes, for Copy and the downloaded .txt file. */
export function recoveryCodesText(
  codes: string[],
  account?: string | null,
  created: Date = new Date(),
  t: (key: TranslationKey, vars?: Vars) => string = (key, vars) => translate('en', key, vars),
): string {
  return [
    t('settings.recovery.fileTitle'),
    ...(account ? [t('settings.recovery.fileAccount', { account })] : []),
    t('settings.recovery.fileCreated', { date: created.toISOString().slice(0, 10) }),
    t('settings.recovery.fileNote'),
    '',
    ...codes,
    '',
  ].join('\n')
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'sanctus-recovery-codes.txt'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * A freshly made set of recovery codes, shown once: the list, Copy, Download (.txt) and an "I saved these codes" tick
 * that unlocks Done. Its heading takes focus when it appears. `account` (the email) is written into the copied text and
 * the file, so a saved file says which account it belongs to. Self-contained: TotpSetup and Security settings use it.
 */
export function RecoveryCodes({ codes, onDone, doneLabel, account }: { codes: string[]; onDone: () => void; doneLabel?: string; account?: string | null }) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(false)
  // One timestamp per set, so Copy and Download carry the same date.
  const [created] = useState(() => new Date())
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  const text = recoveryCodesText(codes, account, created, t)
  return (
    <div className="space-y-4">
      <div>
        <h3 ref={heading} tabIndex={-1} className="text-ui-body font-semibold text-ink outline-none">
          {t('settings.recovery.title')}
        </h3>
        <p className="mt-1 text-ui-small text-ink-muted">
          {t('settings.recovery.body')}
        </p>
      </div>
      <ul aria-label={t('settings.recovery.listLabel')} className="grid max-w-md grid-cols-1 gap-x-6 gap-y-1.5 rounded-[var(--radius-control)] bg-subtle px-4 py-3 font-mono text-ui-body text-ink min-[360px]:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="tracking-[0.04em] break-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} label={t('settings.recovery.copy')} toastTitle={t('settings.recovery.copied')} />
        <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => download(text)}>
          {t('settings.recovery.download')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Checkbox label={t('settings.recovery.saved')} checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          {doneLabel ?? t('settings.recovery.done')}
        </Button>
      </div>
    </div>
  )
}
