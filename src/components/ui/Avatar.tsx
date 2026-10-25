import { useState } from 'react'
import { initials } from '@/auth/accounts'
import { cn } from '@/lib/cn'

const SIZES = {
  32: 'size-8 text-[12px]',
  40: 'size-10 text-[14px]',
  48: 'size-12 text-[16px]',
} as const

/**
 * A person's photo, or their initials when there is none (or it fails to load). Decorative: the name is always
 * shown or announced next to it, so the avatar itself is hidden from assistive technology.
 */
export function Avatar({
  name,
  src,
  size = 40,
  tone = 'light',
  className,
}: {
  name: string
  src?: string | null
  size?: 32 | 40 | 48
  /** `dark`: on the obsidian sidebar. */
  tone?: 'light' | 'dark'
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const photo = src && failed !== src ? src : null
  return (
    <span
      aria-hidden
      data-avatar
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden border font-[family-name:var(--font-ui)] leading-none font-medium select-none',
        tone === 'dark' ? 'border-chalk/25 text-chalk' : 'border-line-strong/50 bg-surface text-ink',
        SIZES[size],
        className,
      )}
    >
      {photo ? <img src={photo} alt="" className="size-full object-cover" onError={() => setFailed(photo)} /> : initials(name) || '?'}
    </span>
  )
}
