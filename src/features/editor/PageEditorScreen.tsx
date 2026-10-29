import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, InputAddon, Switch } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/States'
import { MAX_SLUG_LENGTH, type Lang } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { slugInput } from '@/lib/slug'
import { editorPagesPath } from '@/lib/urls'
import { LEGAL_CONTENT } from '../legal/content.generated'
import { useEditor } from './EditorContext'
import { MarkdownField } from './MarkdownField'
import { footerPages, moveInFooter, removePage, suggestSlug, updatePage } from './pageOps'

const LANGS: Lang[] = ['en', 'pt']

/** /admin/editor/pages/:pageKey: Terms or Privacy (text per language), or one custom page. */
export default function PageEditorScreen() {
  const { pageKey = '' } = useParams()
  const { t } = useI18n()
  const { draft } = useEditor()
  if (pageKey === 'terms' || pageKey === 'privacy') return <BuiltinPageEditor doc={pageKey} />
  if (draft.customPages.some((p) => p.id === pageKey)) return <CustomPageEditor id={pageKey} />
  return (
    <EmptyState
      title={t('editor.page.missing')}
      body={t('editor.page.missingBody')}
      action={
        <Link to={editorPagesPath()} className="underline underline-offset-2">
          {t('editor.page.back')}
        </Link>
      }
    />
  )
}

function BackLink() {
  const { t } = useI18n()
  return (
    <Link to={editorPagesPath()} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-ui-body text-ink-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />
      {t('editor.page.back')}
    </Link>
  )
}

/** Terms and Privacy start from the built-in text; an edit is an override for that language, and Reset removes it. */
function BuiltinPageEditor({ doc }: { doc: 'terms' | 'privacy' }) {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const overrides = draft.builtinPages[doc] ?? {}

  const set = (lang: Lang, value: string) => setDraft((d) => ({ ...d, builtinPages: { ...d.builtinPages, [doc]: { ...d.builtinPages[doc], [lang]: value } } }))
  const reset = (lang: Lang) =>
    setDraft((d) => {
      const { [lang]: _removed, ...rest } = d.builtinPages[doc] ?? {}
      const builtinPages = { ...d.builtinPages }
      if (Object.keys(rest).length) builtinPages[doc] = rest
      else delete builtinPages[doc]
      return { ...d, builtinPages }
    })

  return (
    <div>
      <BackLink />
      <h2 className="font-display text-[length:var(--text-ui-h1)] leading-tight font-medium text-ink">{t(doc === 'terms' ? 'editor.page.terms' : 'editor.page.privacy')}</h2>
      <p className="mt-1 max-w-2xl text-ui-small text-ink-muted">{t('editor.page.builtinHelp')}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {LANGS.map((lang) => {
          const error = errors[`builtinPages.${doc}.${lang}`]
          const edited = overrides[lang] !== undefined
          return (
            <MarkdownField
              key={lang}
              label={t(lang === 'en' ? 'editor.lang.en' : 'editor.lang.pt')}
              lang={lang}
              value={overrides[lang] ?? LEGAL_CONTENT[doc][lang]}
              onChange={(v) => set(lang, v)}
              error={error ? t(`editor.err.${error}` as TranslationKey) : undefined}
              hint={edited ? t('editor.page.edited') : t('editor.page.original')}
              footer={
                edited ? (
                  <Button size="sm" className="self-start" onClick={() => reset(lang)}>
                    {t('editor.page.reset')}
                  </Button>
                ) : null
              }
            />
          )
        })}
      </div>
    </div>
  )
}

function CustomPageEditor({ id }: { id: string }) {
  const { t } = useI18n()
  const { draft, published, setDraft, errors } = useEditor()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const touch = (field: string) => setTouched((s) => new Set(s).add(field))

  const index = draft.customPages.findIndex((p) => p.id === id)
  const page = draft.customPages[index]!
  const live = published?.customPages.find((p) => p.id === id)
  const patch = (fn: (p: typeof page) => typeof page) => setDraft((d) => updatePage(d, id, fn))

  /** A field error; "required" waits until the field has been visited so a new page does not start red. */
  const problem = (field: string): string | undefined => {
    const key = errors[`customPages.${index}.${field}`]
    if (!key || (key === 'required' && !touched.has(field))) return undefined
    return t(`editor.err.${key}` as TranslationKey)
  }

  const setTitleEn = (value: string) =>
    patch((p) => {
      // The address follows the title until it has been typed by hand, and never once the page is live (its links would break).
      const follows = !live && (p.slug === '' || p.slug === suggestSlug(draft, p.title.en, id))
      return { ...p, title: { ...p.title, en: value }, slug: follows ? suggestSlug(draft, value, id) : p.slug }
    })

  const remove = async () => {
    const yes = await confirm({
      title: t('editor.page.deleteTitle', { name: page.title.en.trim() || t('editor.page.untitled') }),
      body: live ? t('editor.page.deleteLiveBody') : t('editor.page.deleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!yes) return
    setDraft((d) => removePage(d, id))
    navigate(editorPagesPath())
  }

  const inFooter = footerPages(draft)
  const position = inFooter.findIndex((p) => p.id === id)

  return (
    <div>
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 font-display text-[length:var(--text-ui-h1)] leading-tight font-medium break-words text-ink">{page.title.en.trim() || t('editor.page.untitled')}</h2>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => void remove()}>
          {t('editor.page.delete')}
        </Button>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <FormField label={t('editor.field.titleEn')} required error={problem('title.en')}>
          <Input value={page.title.en} maxLength={120} onChange={(e) => setTitleEn(e.target.value)} onBlur={() => touch('title.en')} />
        </FormField>
        <FormField label={t('editor.field.titlePt')} optional={t('common.optional')} error={problem('title.pt')} hint={t('editor.page.ptFallback')}>
          <Input lang="pt" value={page.title.pt ?? ''} maxLength={120} onChange={(e) => patch((p) => ({ ...p, title: { ...p.title, pt: e.target.value } }))} />
        </FormField>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <FormField
          label={t('editor.field.slug')}
          required
          error={problem('slug')}
          hint={live && live.slug !== page.slug ? <span className="text-warning">{t('editor.page.slugChanged')}</span> : t('editor.page.slugHint')}
        >
          <InputAddon addon="/pages/">
            <Input
              value={page.slug}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(e) => patch((p) => ({ ...p, slug: slugInput(e.target.value, MAX_SLUG_LENGTH) }))}
              onBlur={() => touch('slug')}
            />
          </InputAddon>
        </FormField>
        <div className="space-y-3">
          <Switch
            label={t('editor.page.showInFooter')}
            description={t('editor.page.showInFooterHelp')}
            checked={page.showInFooter}
            onChange={(on) => patch((p) => ({ ...p, showInFooter: on }))}
          />
          {page.showInFooter && position >= 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ui-small text-ink-muted">{t('editor.page.footerPosition', { n: position + 1, total: inFooter.length })}</span>
              <Button size="sm" aria-label={t('editor.footer.moveUp', { name: page.title.en.trim() || t('editor.page.untitled') })} disabled={position === 0} onClick={() => setDraft((d) => moveInFooter(d, id, -1))}>
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button size="sm" aria-label={t('editor.footer.moveDown', { name: page.title.en.trim() || t('editor.page.untitled') })} disabled={position === inFooter.length - 1} onClick={() => setDraft((d) => moveInFooter(d, id, 1))}>
                <ArrowDown className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {LANGS.map((l) => (
          <MarkdownField
            key={l}
            label={t(l === 'en' ? 'editor.field.bodyEn' : 'editor.field.bodyPt')}
            lang={l}
            value={page.body[l] ?? ''}
            onChange={(v) => patch((p) => ({ ...p, body: { ...p.body, [l]: v } }))}
            error={errors[`customPages.${index}.body.${l}`] ? t(`editor.err.${errors[`customPages.${index}.body.${l}`]}` as TranslationKey) : undefined}
            hint={l === 'pt' ? t('editor.page.ptFallback') : undefined}
          />
        ))}
      </div>
    </div>
  )
}
