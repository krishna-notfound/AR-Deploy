import { ArrowRight, Check, CircleCheck, Copy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, arrowLinkClasses } from '@/components/ui/Button'
import { InlineNotice } from '@/components/ui/States'
import { cn } from '@/lib/cn'
import { isDemoMode } from '@/services'
import type { ApplyTexts } from './applyText'

export type Done = { reference: string; email: string }

/**
 * The thank-you screen. `onRestart` is left out in the Editor's preview, where "start another application" would do nothing.
 * Texts come through `tx`, so the Editor's wording shows. The reference always appears (the override must keep `{ref}`).
 */
export function ApplyDone({ done, tx, onRestart }: { done: Done; tx: ApplyTexts; onRestart?: () => void }) {
  const t = tx.text
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(done.reference)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <div role="status">
        <CircleCheck className="mx-auto size-10 text-success" strokeWidth={1.4} aria-hidden />
        <h1 className="mt-6 text-headline">{t('apply.done.title')}</h1>
        <p className="mt-5 text-[15px] leading-7 text-ink-muted">{t('apply.done.body')}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <p className="text-label text-ink">{t('apply.done.reference', { ref: done.reference })}</p>
        <Button size="sm" onClick={() => void copy()} icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}>
          {copied ? t('apply.done.copied') : t('apply.done.copy')}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-ink-muted">{t('apply.done.keepReference')}</p>
      <div className="mt-8 border border-line bg-surface p-6 text-left">
        <h2 className="font-display text-[1.4rem] leading-tight font-normal">{t('apply.done.nextTitle')}</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-ink-body">
          <li>{t('apply.done.next1')}</li>
          <li>{done.email ? t('apply.done.next2', { email: done.email }) : t('apply.done.next2NoEmail')}</li>
          <li>{t('apply.done.next3')}</li>
        </ol>
        {isDemoMode && (
          <InlineNotice tone="neutral" className="mt-5">
            {t('apply.done.demo')}
          </InlineNotice>
        )}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
        <Link to="/" className={cn(arrowLinkClasses, 'text-ink')}>
          {t('apply.done.home')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        {onRestart && (
          <button type="button" onClick={onRestart} className="text-sm text-ink-muted underline-offset-4 hover:underline">
            {t('apply.done.another')}
          </button>
        )}
      </div>
    </div>
  )
}
