import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Checkbox } from '@/components/ui/Form'

/** The plain-text form of a set of recovery codes, for Copy and the downloaded .txt file. */
export function recoveryCodesText(codes: string[]): string {
  return ['Sanctus recovery codes', 'Each code works once. Keep them somewhere safe.', '', ...codes, ''].join('\n')
}

function download(codes: string[]) {
  const url = URL.createObjectURL(new Blob([recoveryCodesText(codes)], { type: 'text/plain;charset=utf-8' }))
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
 * that unlocks Done. Self-contained (Task 8 setup, regenerate, and the sign-in gate and onboarding through TotpSetup).
 */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Done' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false)
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-ui-body font-semibold text-ink">Save your recovery codes</h3>
        <p className="mt-1 text-ui-small text-ink-muted">
          If you lose your phone, a recovery code lets you sign in. Each code works once. They are shown only now.
        </p>
      </div>
      <ul aria-label="Recovery codes" className="grid max-w-md grid-cols-1 gap-x-6 gap-y-1.5 rounded-[var(--radius-control)] bg-subtle px-4 py-3 font-mono text-ui-body text-ink min-[360px]:grid-cols-2">
        {codes.map((c) => (
          <li key={c} className="tracking-[0.04em] break-all">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={recoveryCodesText(codes)} label="Copy codes" toastTitle="Recovery codes copied" />
        <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={() => download(codes)}>
          Download .txt
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Checkbox label="I saved these codes" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <Button variant="primary" disabled={!saved} onClick={onDone}>
          {doneLabel}
        </Button>
      </div>
    </div>
  )
}
