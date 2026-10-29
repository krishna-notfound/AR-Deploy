import { useState } from 'react'
import { FormField, Input } from '@/components/ui/Form'
import { SOCIAL_NETWORKS, type SocialNetwork, checkSocialUrl } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { SocialIcon } from '../marketing/SocialIcon'
import { useEditor } from './EditorContext'

/** /admin/editor/social: one optional https link per network; the filled ones become icons in the main site footer. */
export default function SocialScreen() {
  const { t } = useI18n()
  const { draft, setDraft } = useEditor()
  // What is being typed. The draft keeps the clean link (https:// added) as soon as the text is valid, so the box must not rewrite while typing.
  const [typing, setTyping] = useState<Partial<Record<SocialNetwork, string>>>({})

  const shown = (n: SocialNetwork) => typing[n] ?? draft.social[n] ?? ''

  const change = (n: SocialNetwork, raw: string) => {
    setTyping((s) => ({ ...s, [n]: raw }))
    const text = raw.trim()
    const check = checkSocialUrl(n, text)
    setDraft((d) => {
      const social = { ...d.social }
      if (!text) delete social[n]
      else social[n] = check.ok ? check.url : text
      return { ...d, social }
    })
  }
  const leave = (n: SocialNetwork) =>
    setTyping((s) => {
      const { [n]: _done, ...rest } = s
      return rest
    })

  const filled = SOCIAL_NETWORKS.filter((n) => draft.social[n] && checkSocialUrl(n, draft.social[n]!).ok)

  return (
    <section aria-labelledby="social-heading" className="max-w-xl">
      <h2 id="social-heading" className="text-ui-card font-medium text-ink">
        {t('editor.menu.social')}
      </h2>
      <p className="mt-1 text-ui-small text-ink-muted">{t('editor.social.description')}</p>
      <div className="mt-6 space-y-5">
        {SOCIAL_NETWORKS.map((n) => {
          const value = shown(n)
          const check = value.trim() ? checkSocialUrl(n, value.trim()) : null
          return (
            <FormField
              key={n}
              label={t(`site.social.${n}`)}
              optional={t('common.optional')}
              error={check && !check.ok ? t(`editor.err.${check.error}` as TranslationKey) : undefined}
              hint={t('editor.social.example', { url: `https://${n === 'youtube' ? 'youtube.com/@' : `${n}.com/`}sanctus` })}
            >
              <Input
                type="url"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
                value={value}
                onChange={(e) => change(n, e.target.value)}
                onBlur={() => leave(n)}
              />
            </FormField>
          )
        })}
      </div>
      <div className="mt-8 border-t border-line pt-5">
        <p className="text-ui-small font-medium text-ink-muted">{t('editor.social.preview')}</p>
        {filled.length === 0 ? (
          <p className="mt-2 text-ui-body text-ink-muted">{t('editor.social.previewEmpty')}</p>
        ) : (
          <ul aria-label={t('editor.social.preview')} className="mt-2 flex flex-wrap gap-4 text-ink">
            {filled.map((n) => (
              <li key={n} title={t(`site.social.${n}`)} className="flex items-center gap-2 text-ui-small">
                <SocialIcon network={n} />
                <span>{t(`site.social.${n}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
