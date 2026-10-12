import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/lib/clipboard'
import { Button, type ButtonSize, type ButtonVariant } from './Button'
import { useToast } from './ToastProvider'

export function CopyButton({
  text,
  label = 'Copy link',
  toastTitle = 'Link copied',
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
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast.success(toastTitle)
    } else {
      toast.error('Copy failed', 'Your browser blocked clipboard access. Select the text and copy it manually.')
    }
  }
  const icon = copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />
  return (
    <Button variant={variant} size={size} onClick={onClick} icon={icon} aria-label={iconOnly ? label : undefined} className={className}>
      {iconOnly ? null : copied ? 'Copied' : label}
    </Button>
  )
}
