import { Copy, Share2 } from 'lucide-react'
import { Button, type ButtonSize } from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useI18n } from '@/i18n/LanguageProvider'
import { copyText } from '@/lib/clipboard'
import { shareableCurrentUrl } from '@/lib/urls'

/** Copies the URL of the page the customer is on. */
export function CopyLink({ size = 'md' }: { size?: ButtonSize }) {
  const { t } = useI18n()
  const toast = useToast()
  return (
    <Button
      size={size}
      icon={<Copy className="size-4" aria-hidden />}
      onClick={async () => {
        const ok = await copyText(shareableCurrentUrl())
        if (ok) toast.success(t('product.linkCopied'))
        else toast.error(t('product.copyFailed'))
      }}
    >
      {t('ar.copyLink')}
    </Button>
  )
}

/** Native share sheet where available; otherwise copies the link. */
export function ShareButton({ title }: { title: string }) {
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
    <Button variant="ghost" icon={<Share2 className="size-4" aria-hidden />} onClick={onShare}>
      {t('product.share')}
    </Button>
  )
}
