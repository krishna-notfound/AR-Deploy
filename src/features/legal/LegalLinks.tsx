import { useId } from 'react'
import { Link } from 'react-router'
import { Checkbox } from '@/components/ui/Form'
import { useI18n } from '@/i18n/LanguageProvider'
import { PRIVACY_PATH, TERMS_PATH, customPagePath } from '@/lib/urls'
import { useSiteContent } from '../marketing/SiteContentProvider'
import { SocialLinks } from '../marketing/SocialLinks'

/**
 * "Privacy" and "Terms" footer links of the public pages (catalog, product, apply, platform footer), then the custom pages
 * the client published with "In footer" on, in the client's order. While the footer content loads, when it failed, and
 * before anything is published, only Privacy and Terms show. One component serves every public footer.
 * `social` adds the social media icons under the links; only the footer that has no SiteFooter of its own (the Apply page's
 * AuthLayout footer) asks for it. Business catalogue footers never do.
 */
export function LegalLinks({ className, linkClassName, social }: { className?: string; linkClassName?: string; social?: boolean }) {
  const { t, localized, lang } = useI18n()
  const { chrome } = useSiteContent()
  return (
    <>
      <nav aria-label={t('legal.nav')} className={className}>
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <li>
          <Link to={PRIVACY_PATH} className={linkClassName}>
            {t('legal.privacy.link')}
          </Link>
        </li>
        <li>
          <Link to={TERMS_PATH} className={linkClassName}>
            {t('legal.terms.link')}
          </Link>
        </li>
        {chrome?.footerPages.map((p) => (
          <li key={p.slug}>
            <Link to={customPagePath(p.slug)} className={linkClassName} lang={p.title[lang] ? undefined : 'en'}>
              {localized(p.title)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
    {social && <SocialLinks className="mt-2 -ml-3" />}
    </>
  )
}

/**
 * The "I agree to the Terms and the Privacy Policy" tick of the apply form and the owner's password step. Both links
 * open in a new tab so the form keeps its answers. Nothing about the acceptance is stored yet (accepted version and
 * time are a later item, docs/legal/drafts/README.md "What the app must do", 3 and 5).
 */
export function TermsAgreement({ checked, onChange, error }: { checked: boolean; onChange: (checked: boolean) => void; error?: string | null }) {
  const { t } = useI18n()
  const errorId = useId()
  const link = (to: string, label: string) => (
    <Link
      to={to}
      target="_blank"
      rel="noopener"
      aria-label={`${label} ${t('legal.agree.newTab')}`}
      className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-ink"
    >
      {label}
    </Link>
  )
  return (
    <div className="space-y-2">
      <Checkbox
        className="items-start [&>input]:mt-0.5 [&>input]:shrink-0"
        label={
          <span>
            {t('legal.agree.prefix')} {link(TERMS_PATH, t('legal.agree.terms'))} {t('legal.agree.and')} {link(PRIVACY_PATH, t('legal.agree.privacy'))}
          </span>
        }
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
