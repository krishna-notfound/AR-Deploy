// The Site tab's "Sign-in pages panel" (ADR-0067): the picture and text on the left of the sign-in style pages (sign-in, application,
// invitations, password reset, demo). One text set in English and Portuguese, shared by every page (an empty box keeps the original,
// shown in grey inside it), and each page's own picture (cropped tall on upload, original kept; Remove goes back to the page's built-in
// photograph). Part of the draft; goes live with Publish.
import { ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { SIGN_IN_PAGES, SIGN_IN_TEXT_KEYS, SIGN_IN_TEXT_LIMITS, type SignInPage, type SignInTextKey } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { siteAssetUrl } from '@/services'
import { SIGN_IN_PHOTOS } from '../auth/signInPanel'
import { EditPictureButton } from './EditPictureButton'
import { useEditor } from './EditorContext'
import { UploadButton } from './UploadButton'
import { setSignInPicture, setSignInText } from './siteOps'

const shape = imageFrame('signInPanel')

function TextRow({ textKey }: { textKey: SignInTextKey }) {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const value = draft.chrome?.signIn?.texts?.[textKey] ?? {}
  const name = t(`editor.site.signIn.text.${textKey}`)
  const max = SIGN_IN_TEXT_LIMITS[textKey]
  return (
    <div className="space-y-2" data-text-key={textKey}>
      <p className="text-ui-body font-medium text-ink">{name}</p>
      <div className="grid gap-3 md:grid-cols-2">
      {(['en', 'pt'] as const).map((l) => {
        const code = errors[`chrome.signIn.texts.${textKey}.${l}`]
        const langName = t(`editor.lang.${l}`)
        const props = {
          lang: l,
          'aria-label': `${name} (${langName})`,
          value: value[l] ?? '',
          placeholder: translate(l, `auth.panel.${textKey}`),
          maxLength: max,
          onChange: (e: { target: { value: string } }) => setDraft((d) => setSignInText(d, textKey, l, e.target.value)),
        }
        return (
          <FormField key={l} label={langName} error={code ? t(`editor.err.${code}` as TranslationKey) : undefined} hint={t('editor.landing.texts.limit', { max })}>
            {textKey === 'body' ? <Textarea rows={3} {...props} /> : <Input {...props} />}
          </FormField>
        )
      })}
      </div>
    </div>
  )
}

function PagePicture({ page }: { page: SignInPage }) {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const own = draft.chrome?.signIn?.pictures?.[page]
  const url = own ? siteAssetUrl(own) : ''
  const sessionOnly = !!own && !url
  const name = t(`editor.site.signIn.page.${page}`)
  const alt = t('editor.site.signIn.current', { page: name })
  const prefix = `chrome.signIn.pictures.${page}`
  const error = Object.entries(errors).find(([path]) => path === prefix || path.startsWith(`${prefix}.`))?.[1]
  const headingId = `site-signin-page-${page}`
  return (
    <div role="group" aria-labelledby={headingId} className="flex min-w-0 gap-4 border border-line bg-canvas p-3">
      <div className={cn('w-20 shrink-0 overflow-hidden border border-line bg-subtle sm:w-24', shape.aspectClass)}>
        {sessionOnly ? (
          <span className="flex size-full items-center justify-center text-ink-muted" title={t('editor.showcase.sessionOnly')}>
            <ImageIcon className="size-5" aria-label={t('editor.showcase.sessionOnly')} />
          </span>
        ) : (
          <img src={url || SIGN_IN_PHOTOS[page].src} alt={alt} className={cn('size-full', shape.fitClass)} style={url ? undefined : { objectPosition: SIGN_IN_PHOTOS[page].position }} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p id={headingId} className="text-ui-body font-medium text-ink [overflow-wrap:anywhere]">
          {name}
        </p>
        <p className="mt-0.5 text-ui-small text-ink-muted">{own ? (sessionOnly ? t('editor.showcase.sessionOnly') : t('editor.site.signIn.own')) : t('editor.site.signIn.builtin')}</p>
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <UploadButton
            kind="image"
            frame="signInPanel"
            label={t(own ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')}
            onUploaded={(asset) => setDraft((d) => setSignInPicture(d, page, asset))}
          />
          {own && !sessionOnly && <EditPictureButton image={own} frame="signInPanel" label={t('editor.crop.editFor', { name })} onEdited={(asset) => setDraft((d) => setSignInPicture(d, page, asset))} />}
          {own && (
            <Button size="sm" aria-label={`${t('editor.showcase.remove')}: ${alt}`} onClick={() => setDraft((d) => setSignInPicture(d, page, undefined))}>
              {t('editor.showcase.remove')}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-ui-small text-danger">
            {t(`editor.err.${error}` as TranslationKey)}
          </p>
        )}
      </div>
    </div>
  )
}

export function SignInPanelBlock() {
  const { t } = useI18n()
  return (
    <section aria-labelledby="site-signin-heading" className="border border-line bg-surface p-4 sm:p-5">
      <h3 id="site-signin-heading" className="text-ui-card font-medium text-ink">
        {t('editor.site.signIn.title')}
      </h3>
      <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.site.signIn.help')}</p>

      <h4 className="mt-5 text-ui-body font-medium text-ink">{t('editor.site.signIn.texts')}</h4>
      <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.site.signIn.textsHelp')}</p>
      <div className="mt-4 space-y-5">
        {SIGN_IN_TEXT_KEYS.map((key) => (
          <TextRow key={key} textKey={key} />
        ))}
      </div>

      <h4 className="mt-6 text-ui-body font-medium text-ink">{t('editor.site.signIn.pictures')}</h4>
      <p className="mt-1 max-w-xl text-ui-small text-ink-muted">
        {t('editor.site.signIn.hint')} {t('editor.crop.hint')}
      </p>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {SIGN_IN_PAGES.map((page) => (
          <PagePicture key={page} page={page} />
        ))}
      </div>
    </section>
  )
}
