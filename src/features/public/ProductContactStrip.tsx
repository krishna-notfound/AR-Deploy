import { Mail } from 'lucide-react'
import type { Business } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { Reveal } from './Reveal'
import { TAP_TARGET } from './tapTarget'

/** mailto: link for a question about one piece (the piece's name as the subject). */
export const mailtoFor = (email: string, subject: string) => `mailto:${email}?subject=${encodeURIComponent(subject)}`
export const telFor = (phone: string) => `tel:${phone.replace(/\s/g, '')}`

/**
 * "Questions about this piece?" (ADR-0036 v2): the business's own email and phone as links, and a dark "Email
 * <business>" pill. Only the filled-in fields; hidden when the business has neither an email nor a phone.
 */
export function ProductContactStrip({ business, subject, className }: { business: Business; subject: string; className?: string }) {
  const { t } = useI18n()
  const { email, phone } = business.contact
  if (!email && !phone) return null
  const link = cn(TAP_TARGET, 'min-w-0 break-all text-ink underline-offset-4 transition-colors hover:text-accent-ink hover:underline')
  return (
    <Reveal className={className}>
      <section aria-labelledby="questions-h" className="flex flex-col gap-5 rounded-soft-sm bg-subtle px-6 py-6 sm:rounded-soft sm:px-10 lg:flex-row lg:items-center lg:gap-10">
        <h2 id="questions-h" className="font-display text-[1.75rem] leading-tight font-normal text-ink">
          {t('product.questions')}
        </h2>
        <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-[15px] leading-6">
          {email && (
            <a href={mailtoFor(email, subject)} className={link}>
              {email}
            </a>
          )}
          {phone && (
            <a href={telFor(phone)} className={cn(link, 'tabular-nums')}>
              {phone}
            </a>
          )}
        </p>
        {email && (
          <a
            href={mailtoFor(email, subject)}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2.5 rounded-full bg-ink px-6 text-[15px] font-medium text-canvas transition-[background-color,transform] hover:bg-umber motion-safe:duration-200 motion-safe:active:scale-[0.98]"
          >
            <Mail className="size-4" strokeWidth={1.5} aria-hidden />
            {t('product.emailBusiness', { business: business.name })}
          </a>
        )}
      </section>
    </Reveal>
  )
}
