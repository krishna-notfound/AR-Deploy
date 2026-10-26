import { Copy, Share2 } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useI18n } from '@/i18n/LanguageProvider'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'
import { shareableCurrentUrl } from '@/lib/urls'
import { TAP_TARGET } from './tapTarget'

/** Copies the URL of the page the customer is on: a quiet pill (product page hand-off, in-app notice). */
export function CopyLink({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  const { t } = useI18n()
  const toast = useToast()
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full bg-surface font-medium text-ink transition-colors hover:bg-canvas',
        size === 'sm' ? 'h-10 px-4 text-[14px]' : 'h-12 px-5 text-[15px]',
        className,
      )}
      onClick={async () => {
        const ok = await copyText(shareableCurrentUrl())
        if (ok) toast.success(t('product.linkCopied'))
        else toast.error(t('product.copyFailed'))
      }}
    >
      <Copy className="size-4" strokeWidth={1.5} aria-hidden />
      {t('ar.copyLink')}
    </button>
  )
}

/** The quiet pill of the product page's action row ("Open on your phone", Share, the product's own link). */
export const PILL_SOFT =
  'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-subtle px-5 py-2.5 text-center text-[15px] font-medium text-ink transition-[background-color,transform] hover:bg-line/70 motion-safe:duration-200 motion-safe:active:scale-[0.98]'

/** Native share sheet where available; otherwise copies the link. A text button, or a soft pill (`pill`). */
export function ShareButton({ title, className, pill = false }: { title: string; className?: string; pill?: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const onShare = async () => {
    const url = shareableCurrentUrl()
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    const ok = await copyText(url)
    if (ok) toast.success(t('product.linkCopied'))
    else toast.error(t('product.copyFailed'))
  }
  return (
    <button
      type="button"
      onClick={onShare}
      className={cn(pill ? PILL_SOFT : cn(TAP_TARGET, 'inline-flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-accent-ink'), className)}
    >
      <Share2 className="size-4" strokeWidth={1.5} aria-hidden />
      {t('product.share')}
    </button>
  )
}
