import { useId } from 'react'
import { Link } from 'react-router'
import { Checkbox } from '@/components/ui/Form'
import { useI18n, useMaybeI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/urls'

/**
 * "Privacy" and "Terms" footer links of the public pages (catalog, product, apply, platform footer). English outside
 * a LanguageProvider (the platform footer also sits on English-only pages).
 */
export function LegalLinks({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const i18n = useMaybeI18n()
  const t = i18n ? i18n.t : (key: 'legal.nav' | 'legal.privacy.link' | 'legal.terms.link') => translate('en', key)
  return (
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
      </ul>
    </nav>
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
