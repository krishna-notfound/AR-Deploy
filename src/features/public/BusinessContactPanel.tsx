import { Globe, Mail, MapPin, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Business } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { isHttpUrl } from '@/lib/files'
import { Reveal } from './Reveal'

/**
 * "Visit or contact" (ADR-0036 v2): the business's own name, description and the contact fields it filled in, as
 * real links. Hidden entirely when the business has no contact details.
 */
export function BusinessContactPanel({ business: b }: { business: Business }) {
  const { t } = useI18n()
  const { email, phone, address } = b.contact
  const website = b.contact.website && isHttpUrl(b.contact.website) ? b.contact.website : undefined
  if (!email && !phone && !website && !address) return null

  return (
    <section aria-labelledby="catalog-contact" className="mx-auto max-w-[1320px] px-5 pb-4 sm:px-10">
      <div className="grid gap-8 rounded-soft-sm bg-subtle px-6 py-8 sm:rounded-soft sm:px-12 sm:py-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal as="h2" className="font-display text-headline font-normal break-words text-ink">
            <span id="catalog-contact">{t('catalog.contactTitle', { name: b.name })}</span>
          </Reveal>
          {b.description && (
            <Reveal as="p" delay={1} className="mt-4 max-w-md text-[16px] leading-7 text-ink">
              {b.description}
            </Reveal>
          )}
        </div>
        <Reveal delay={2} className="flex flex-col gap-7 lg:justify-center">
          <ul className="grid gap-x-8 gap-y-4 text-[15px] leading-6 text-ink sm:grid-cols-2">
            {address && (
              <Item icon={<MapPin />} label={t('catalog.contactAddress')}>
                <span className="break-words">{address}</span>
              </Item>
            )}
            {phone && (
              <Item icon={<Phone />} label={t('catalog.contactPhone')}>
                <a className="underline-offset-4 hover:underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                  {phone}
                </a>
              </Item>
            )}
            {email && (
              <Item icon={<Mail />} label={t('catalog.contactEmail')}>
                <a className="break-all underline-offset-4 hover:underline" href={`mailto:${email}`}>
                  {email}
                </a>
              </Item>
            )}
            {website && (
              <Item icon={<Globe />} label={t('catalog.contactWebsite')}>
                <a className="break-all underline-offset-4 hover:underline" href={website} target="_blank" rel="noopener noreferrer">
                  {website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </Item>
            )}
          </ul>
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex h-12 items-center justify-center self-start rounded-full bg-ink px-7 text-[15px] font-medium text-canvas motion-safe:transition-transform motion-safe:duration-200 hover:opacity-90 active:scale-[0.97] max-sm:w-full"
            >
              {t('catalog.emailBusiness', { name: b.name })}
            </a>
          )}
        </Reveal>
      </div>
    </section>
  )
}

function Item({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 shrink-0 text-ink-body [&>svg]:size-[18px] [&>svg]:stroke-[1.5]" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}
