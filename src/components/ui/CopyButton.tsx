import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { copyText } from '@/lib/clipboard'
import { Button, type ButtonSize, type ButtonVariant } from './Button'
import { useToast } from './ToastProvider'

export function CopyButton({
  text,
  label,
  toastTitle,
  variant = 'secondary',
  size = 'sm',
  iconOnly,
  className,
}: {
  text: string
  label?: string
  toastTitle?: string
  variant?: ButtonVariant
  size?: ButtonSize
  iconOnly?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast.success(toastTitle ?? t('ui.copy.linkCopied'))
    } else {
      toast.error(t('ui.copy.failed'), t('ui.copy.failedBody'))
    }
  }
  const text0 = label ?? t('ui.copy.link')
  const icon = copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />
  return (
    <Button variant={variant} size={size} onClick={onClick} icon={icon} aria-label={iconOnly ? text0 : undefined} className={className}>
      {iconOnly ? null : copied ? t('ui.copy.copied') : text0}
    </Button>
  )
}
