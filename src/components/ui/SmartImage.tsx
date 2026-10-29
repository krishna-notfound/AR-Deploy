import { ImageOff } from 'lucide-react'
import { type ImgHTMLAttributes, useEffect, useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'

/** <img> with a neutral fallback when the source is missing or fails to load. */
export function SmartImage({ src, alt, className, fallbackLabel, ...rest }: ImgHTMLAttributes<HTMLImageElement> & { fallbackLabel?: string }) {
  const { t } = useI18n()
  const [failed, setFailed] = useState(!src)
  useEffect(() => setFailed(!src), [src])
  if (failed) {
    return (
      <div role="img" aria-label={alt || fallbackLabel || t('ui.image.unavailable')} className={cn('flex items-center justify-center bg-subtle text-ink-faint', className)}>
        <ImageOff className="size-5" aria-hidden />
      </div>
    )
  }
  return <img src={src} alt={alt ?? ''} className={cn('bg-subtle object-cover', className)} onError={() => setFailed(true)} loading="lazy" decoding="async" {...rest} />
}

export function Thumb({ src, alt, size = 'md' }: { src?: string; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-8 rounded-md', md: 'size-10 rounded-lg', lg: 'size-14 rounded-lg' }[size]
  return <SmartImage src={src} alt={alt} className={cn(s, 'shrink-0')} />
}
