// The Landing tab's "Sections" block (ADR-0061): one row per section under the hero, in page order, with move, hide/show, edit and
// (own sections only) delete. "Add section" offers three designs. Built-in sections keep their wording in the Texts block; the QR
// and About rows open their pictures. Edits go through sectionOps; every colour is a token.
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, ImageIcon, Plus, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import {
  type ContentErrors,
  type LandingAbout,
  type LandingSection,
  MAX_IMAGE_ALT,
  MAX_LANDING_SECTIONS,
  MAX_OWN_SECTIONS,
  MAX_SECTION_BODY,
  MAX_SECTION_BUTTON,
  MAX_SECTION_EYEBROW,
  MAX_SECTION_SUBTITLE,
  MAX_SECTION_TITLE,
  OWN_SECTION_KINDS,
  type OwnSection,
  type OwnSectionKind,
  QR_SIDES,
  type SiteAsset,
  type SiteImage,
} from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { type ImageFrameKey, imageFrame } from '@/lib/imageFrames'
import { slugInput } from '@/lib/slug'
import { siteAssetUrl } from '@/services'
import { EditPictureButton } from './EditPictureButton'
import { useEditor } from './EditorContext'
import { UploadButton } from './UploadButton'
import {
  addSection,
  canAddSection,
  isOwnSection,
  moveSection,
  nextSectionId,
  removeSection,
  sectionsOf,
  setAboutAlt,
  setAboutImage,
  setQrImage,
  setQrImageAlt,
  setQrSide,
  setSectionAnchor,
  setSectionButton,
  setSectionHidden,
  setSectionImage,
  setSectionImageAlt,
  setSectionImageSide,
  setSectionText,
} from './sectionOps'

type Lang = 'en' | 'pt'
type Pair = { en: string; pt?: string }
const key = (k: string) => k as TranslationKey

/** The text a person recognises a section by. */
function useSectionName() {
  const { t } = useI18n()
  return (s: LandingSection): string => (s.kind === 'builtin' ? t(key(`editor.sections.builtin.${s.id}`)) : titleOf(s)?.trim() || t('editor.sections.untitled'))
}
const titleOf = (s: OwnSection): string | undefined => (s.kind === 'banner' ? s.title?.en : s.title.en)

export function SectionsBlock() {
  const { t } = useI18n()
  const { draft, setDraft } = useEditor()
  const confirm = useConfirm()
  const nameOf = useSectionName()
  const list = sectionsOf(draft)
  const [openId, setOpenId] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)

  const add = (design: OwnSectionKind) => {
    const id = nextSectionId(draft)
    setDraft((d) => addSection(d, design, id))
    setOpenId(id)
    setChoosing(false)
  }
  const remove = async (s: LandingSection) => {
    const yes = await confirm({ title: t('editor.sections.removeTitle'), body: t('editor.sections.removeBody', { name: nameOf(s) }), confirmLabel: t('editor.sections.removeConfirm'), destructive: true })
    if (!yes) return
    setDraft((d) => removeSection(d, s.id))
    setOpenId((id) => (id === s.id ? null : id))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ui-small text-ink-muted">{t('editor.sections.limit', { max: MAX_LANDING_SECTIONS, own: MAX_OWN_SECTIONS })}</p>
        <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} aria-expanded={choosing} disabled={!canAddSection(draft)} onClick={() => setChoosing((v) => !v)}>
          {t('editor.sections.add')}
        </Button>
      </div>

      {choosing && (
        <fieldset className="mt-4 border border-line bg-canvas p-3 sm:p-4">
          <legend className="px-1 text-ui-small font-medium text-ink">{t('editor.sections.addChoose')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {OWN_SECTION_KINDS.map((design) => (
              <button
                key={design}
                type="button"
                onClick={() => add(design)}
                className="flex min-h-11 flex-col items-start gap-1 border border-line bg-surface p-3 text-left transition-colors hover:border-ink hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
              >
                <span className="text-ui-body font-medium text-ink">{t(key(`editor.sections.design.${design}`))}</span>
                <span className="text-ui-small text-ink-muted">{t(key(`editor.sections.design.${design}Help`))}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Button size="sm" onClick={() => setChoosing(false)}>
              {t('editor.sections.addCancel')}
            </Button>
          </div>
        </fieldset>
      )}

      <ol aria-label={t('editor.sections.list')} className="mt-4 space-y-3">
        {list.map((s, i) => (
          <SectionRow
            key={s.id}
            section={s}
            index={i}
            count={list.length}
            open={openId === s.id}
            onToggle={() => setOpenId((id) => (id === s.id ? null : s.id))}
            onRemove={() => void remove(s)}
          />
        ))}
      </ol>
    </div>
  )
}

const hasPanel = (s: LandingSection) => isOwnSection(s) || s.id === 'qr' || s.id === 'about'

function SectionRow({ section, index, count, open, onToggle, onRemove }: { section: LandingSection; index: number; count: number; open: boolean; onToggle: () => void; onRemove: () => void }) {
  const { t } = useI18n()
  const { setDraft } = useEditor()
  const nameOf = useSectionName()
  const name = nameOf(section)
  const own = isOwnSection(section)
  const panelId = `landing-section-${section.id}`
  return (
    <li className={cn('border bg-surface', section.hidden ? 'border-dashed border-line-strong' : 'border-line')} data-section-id={section.id}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center bg-subtle text-ui-small text-ink-muted" aria-hidden>
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-ui-small text-ink-muted">{own ? t(key(`editor.sections.design.${section.kind}`)) : t('editor.sections.builtinTag')}</span>
            <span className="block truncate text-ui-body font-medium text-ink">{name}</span>
          </span>
        </div>
        {section.hidden && <Badge tone="warning">{t('editor.sections.hiddenBadge')}</Badge>}
        <span className="ml-auto flex shrink-0 flex-wrap gap-1">
          <Button size="sm" aria-label={t('editor.sections.moveUp', { name })} disabled={index === 0} onClick={() => setDraft((d) => moveSection(d, section.id, -1))}>
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button size="sm" aria-label={t('editor.sections.moveDown', { name })} disabled={index === count - 1} onClick={() => setDraft((d) => moveSection(d, section.id, 1))}>
            <ArrowDown className="size-4" aria-hidden />
          </Button>
          <Button size="sm" aria-label={t(section.hidden ? 'editor.sections.show' : 'editor.sections.hide', { name })} onClick={() => setDraft((d) => setSectionHidden(d, section.id, !section.hidden))}>
            {section.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </Button>
          {hasPanel(section) && (
            <Button size="sm" aria-expanded={open} aria-controls={panelId} aria-label={t('editor.sections.edit', { name })} onClick={onToggle}>
              <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            </Button>
          )}
          {own && (
            <Button size="sm" variant="danger" aria-label={t('editor.sections.remove', { name })} onClick={onRemove}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </span>
      </div>
      {open && (
        <div id={panelId} className="space-y-6 border-t border-line p-4 sm:p-5">
          {own ? <OwnEditor section={section} index={index} /> : section.id === 'qr' ? <QrPanel /> : <AboutPanel />}
        </div>
      )}
    </li>
  )
}

// ---- shared fields --------------------------------------------------------------------------------------------------
/** English and Portuguese boxes of one text. The Portuguese is optional: empty shows the English. */
function LangFields({
  label,
  value,
  max,
  multiline,
  required,
  errorEn,
  errorPt,
  onChange,
}: {
  label: string
  value: Pair | undefined
  max: number
  multiline?: boolean
  required?: boolean
  errorEn?: string
  errorPt?: string
  onChange: (lang: Lang, text: string) => void
}) {
  const { t } = useI18n()
  return (
    <fieldset className="min-w-0">
      <legend className="text-ui-small font-medium text-ink">{label}</legend>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {(['en', 'pt'] as const).map((l) => {
          const props = {
            lang: l,
            'aria-label': `${label} (${t(key(`editor.lang.${l}`))})`,
            value: value?.[l] ?? '',
            maxLength: max,
            onChange: (e: { target: { value: string } }) => onChange(l, e.target.value),
          }
          return (
            <FormField key={l} label={t(key(`editor.lang.${l}`))} required={required && l === 'en'} error={l === 'en' ? errorEn : errorPt} hint={t('editor.sections.field.limit', { max })}>
              {multiline ? <Textarea rows={4} {...props} /> : <Input {...props} />}
            </FormField>
          )
        })}
      </div>
    </fieldset>
  )
}

/** A picture with its preview in its frame, Upload / Edit picture / Remove and the description in both languages. */
function PictureField({
  legend,
  frame,
  image,
  builtinPreview,
  builtinNote,
  emptyText,
  removeLabel,
  error,
  altErrorEn,
  altErrorPt,
  onUploaded,
  onRemove,
  onAlt,
  help,
}: {
  legend: string
  /** The picture's frame (src/lib/imageFrames.ts): the crop dialog's shape and the preview's. */
  frame: ImageFrameKey
  image: SiteImage | undefined
  builtinPreview?: string
  builtinNote?: string
  /** What the empty preview says when there is no built-in picture and the picture is optional. */
  emptyText?: string
  removeLabel: string
  error?: string
  altErrorEn?: string
  altErrorPt?: string
  onUploaded: (asset: SiteAsset) => void
  onRemove: () => void
  onAlt: (lang: Lang, text: string) => void
  help?: ReactNode
}) {
  const { t } = useI18n()
  const has = !!image?.path
  const url = has ? siteAssetUrl({ path: image!.path }) : ''
  const sessionOnly = has && !url
  const shape = imageFrame(frame)
  return (
    <fieldset className="min-w-0">
      <legend className="text-ui-small font-medium text-ink">{legend}</legend>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className={cn('grid w-full place-items-center overflow-hidden border border-line bg-subtle', shape.aspectClass)}>
            {sessionOnly ? (
              <span className="flex flex-col items-center gap-2 px-4 text-center text-ui-small text-ink-muted">
                <ImageIcon className="size-5" aria-hidden />
                {t('editor.showcase.sessionOnly')}
              </span>
            ) : url || builtinPreview ? (
              <img src={url || builtinPreview} alt={t('editor.sections.pictureCurrent')} className={cn('size-full', shape.fitClass)} />
            ) : (
              <span className="px-4 text-center text-ui-small text-ink-muted">{emptyText ?? t('editor.sections.pictureNone')}</span>
            )}
          </div>
          {!has && builtinNote && <p className="mt-2 text-ui-small text-ink-muted">{builtinNote}</p>}
          <div className="mt-3 flex flex-wrap items-start gap-2">
            <UploadButton kind="image" frame={frame} label={t(has ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')} onUploaded={onUploaded} />
            {has && !sessionOnly && <EditPictureButton image={image!} frame={frame} label={t('editor.crop.editFor', { name: legend })} onEdited={onUploaded} />}
            {has && (
              <Button size="sm" aria-label={removeLabel} onClick={onRemove}>
                {t('editor.showcase.remove')}
              </Button>
            )}
          </div>
          <p className="mt-1 text-ui-small text-ink-muted">
            {t('editor.showcase.pictureHint')} {t('editor.crop.hint')}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-ui-small text-danger">
              {error}
            </p>
          )}
        </div>
        {has && (
          <div className="min-w-0 space-y-2">
            <p className="text-ui-small text-ink-muted">{help ?? t('editor.sections.altHelp')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t('editor.sections.altEn')} error={altErrorEn} hint={t('editor.sections.field.limit', { max: MAX_IMAGE_ALT })}>
                <Input lang="en" value={image!.alt.en} maxLength={MAX_IMAGE_ALT} onChange={(e) => onAlt('en', e.target.value)} />
              </FormField>
              <FormField label={t('editor.sections.altPt')} optional={t('common.optional')} error={altErrorPt} hint={t('editor.landing.ptHint')}>
                <Input lang="pt" value={image!.alt.pt ?? ''} maxLength={MAX_IMAGE_ALT} onChange={(e) => onAlt('pt', e.target.value)} />
              </FormField>
            </div>
          </div>
        )}
      </div>
    </fieldset>
  )
}

/** An error of the document at `base` + path, as a sentence. */
function useErr(errors: ContentErrors, base: string) {
  const { t } = useI18n()
  return (path: string): string | undefined => {
    const k = errors[`${base}.${path}`]
    if (!k) return undefined
    return path === 'button.href' && k === 'invalid_link' ? t('editor.sections.err.href') : t(key(`editor.err.${k}`))
  }
}

// ---- own sections -----------------------------------------------------------------------------------------------------
function OwnEditor({ section, index }: { section: OwnSection; index: number }) {
  const { t } = useI18n()
  const { setDraft, errors } = useEditor()
  const err = useErr(errors, `landing.sections.${index}`)
  const id = section.id
  const text = (field: 'eyebrow' | 'title' | 'subtitle' | 'body', lang: Lang, value: string) => setDraft((d) => setSectionText(d, id, field, lang, value))
  const withEyebrow = section.kind !== 'banner'
  const titleOptional = section.kind === 'banner'
  return (
    <>
      {withEyebrow && (
        <LangFields label={t('editor.sections.field.eyebrow')} value={section.eyebrow} max={MAX_SECTION_EYEBROW} errorEn={err('eyebrow.en')} errorPt={err('eyebrow.pt')} onChange={(l, v) => text('eyebrow', l, v)} />
      )}
      <LangFields
        label={t(titleOptional ? 'editor.sections.field.titleOptional' : 'editor.sections.field.title')}
        value={section.title}
        max={MAX_SECTION_TITLE}
        required={!titleOptional}
        errorEn={err('title.en')}
        errorPt={err('title.pt')}
        onChange={(l, v) => text('title', l, v)}
      />
      {section.kind === 'text' && (
        <LangFields label={t('editor.sections.field.subtitle')} value={section.subtitle} max={MAX_SECTION_SUBTITLE} errorEn={err('subtitle.en')} errorPt={err('subtitle.pt')} onChange={(l, v) => text('subtitle', l, v)} />
      )}
      <LangFields label={t('editor.sections.field.body')} value={section.body} max={MAX_SECTION_BODY} multiline errorEn={err('body.en')} errorPt={err('body.pt')} onChange={(l, v) => text('body', l, v)} />

      {section.kind !== 'text' && (
        <PictureField
          legend={t('editor.sections.picture')}
          frame={section.kind === 'banner' ? 'banner' : 'imageText'}
          image={section.image.path ? section.image : undefined}
          removeLabel={`${t('editor.showcase.remove')}: ${t('editor.sections.picture')}`}
          error={err('image')}
          altErrorEn={err('image.alt.en')}
          altErrorPt={err('image.alt.pt')}
          onUploaded={(asset) => setDraft((d) => setSectionImage(d, id, asset))}
          onRemove={() => setDraft((d) => setSectionImage(d, id, undefined))}
          onAlt={(l, v) => setDraft((d) => setSectionImageAlt(d, id, l, v))}
        />
      )}
      {section.kind === 'imageText' && (
        <fieldset className="min-w-0">
          <legend className="text-ui-small font-medium text-ink">{t('editor.sections.side')}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('editor.sections.side')}>
            {(['left', 'right'] as const).map((side) => (
              <label key={side} className={cn('flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-ui-body text-ink', section.imageSide === side ? 'border-ink bg-subtle' : 'border-line bg-surface')}>
                <input type="radio" name={`side-${id}`} className="accent-[var(--color-accent-ink)]" checked={section.imageSide === side} onChange={() => setDraft((d) => setSectionImageSide(d, id, side))} />
                {t(key(`editor.sections.side.${side}`))}
              </label>
            ))}
          </div>
          {err('imageSide') && (
            <p role="alert" className="mt-2 text-ui-small text-danger">
              {err('imageSide')}
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-ui-small font-medium text-ink">{t('editor.sections.button')}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label={t('editor.sections.buttonLabelEn')} error={err('button.label.en')} hint={t('editor.sections.field.limit', { max: MAX_SECTION_BUTTON })}>
            <Input lang="en" value={section.button?.label.en ?? ''} maxLength={MAX_SECTION_BUTTON} onChange={(e) => setDraft((d) => setSectionButton(d, id, 'labelEn', e.target.value))} />
          </FormField>
          <FormField label={t('editor.sections.buttonLabelPt')} optional={t('common.optional')} error={err('button.label.pt')} hint={t('editor.landing.ptHint')}>
            <Input lang="pt" value={section.button?.label.pt ?? ''} maxLength={MAX_SECTION_BUTTON} onChange={(e) => setDraft((d) => setSectionButton(d, id, 'labelPt', e.target.value))} />
          </FormField>
        </div>
        <FormField label={t('editor.sections.buttonHref')} error={err('button.href')} hint={t('editor.sections.buttonHrefHint')}>
          <Input value={section.button?.href ?? ''} maxLength={300} inputMode="url" autoCapitalize="none" spellCheck={false} onChange={(e) => setDraft((d) => setSectionButton(d, id, 'href', e.target.value))} />
        </FormField>
      </fieldset>

      <FormField label={t('editor.sections.anchor')} optional={t('common.optional')} error={err('anchor')} hint={t('editor.sections.anchorHint', { example: section.anchor || id })}>
        <Input value={section.anchor ?? ''} maxLength={60} spellCheck={false} autoCapitalize="none" onChange={(e) => setDraft((d) => setSectionAnchor(d, id, slugInput(e.target.value)))} />
      </FormField>
    </>
  )
}

// ---- QR section -------------------------------------------------------------------------------------------------------
function QrPanel() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const err = useErr(errors, 'landing.qr')
  const qr = draft.landing.qr
  const side = qr?.imageSide ?? 'none'
  return (
    <>
      <p className="max-w-xl text-ui-small text-ink-muted">{t('editor.sections.qr.help')}</p>
      <p className="max-w-xl text-ui-small text-ink-muted">{t('editor.sections.textsNote')}</p>
      <PictureField
        legend={t('editor.sections.picture')}
        frame="qr"
        image={qr?.image}
        builtinNote={t('editor.sections.qr.noPicture')}
        removeLabel={`${t('editor.showcase.remove')}: ${t('editor.sections.qr.title')}`}
        error={err('image')}
        altErrorEn={err('image.alt.en')}
        altErrorPt={err('image.alt.pt')}
        onUploaded={(asset) => setDraft((d) => setQrImage(d, asset))}
        onRemove={() => setDraft((d) => setQrImage(d, undefined))}
        onAlt={(l, v) => setDraft((d) => setQrImageAlt(d, l, v))}
      />
      <fieldset className="min-w-0">
        <legend className="text-ui-small font-medium text-ink">{t('editor.sections.qr.layout')}</legend>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t('editor.sections.qr.layout')}>
          {QR_SIDES.map((s) => (
            <label
              key={s}
              className={cn('flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-ui-body text-ink', side === s ? 'border-ink bg-subtle' : 'border-line bg-surface', s !== 'none' && !qr?.image && 'cursor-not-allowed opacity-55')}
            >
              <input
                type="radio"
                name="qr-side"
                className="accent-[var(--color-accent-ink)]"
                checked={side === s}
                disabled={s !== 'none' && !qr?.image}
                onChange={() => setDraft((d) => setQrSide(d, s))}
              />
              {t(key(`editor.sections.qr.layout.${s}`))}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}

// ---- About pictures ---------------------------------------------------------------------------------------------------
const ABOUT_BUILTIN = { image: '/images/sanctus/v2/coffee-table.webp', detail: '/images/sanctus/v2/detail-joinery.webp' } as const
const ABOUT_FRAME = { image: 'aboutMain', detail: 'aboutDetail', third: 'aboutThird' } as const satisfies Record<keyof LandingAbout, ImageFrameKey>

function AboutPanel() {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const err = useErr(errors, 'landing.about')
  const about = draft.landing.about
  return (
    <>
      <p className="max-w-xl text-ui-small text-ink-muted">{t('editor.sections.about.help')}</p>
      <p className="max-w-xl text-ui-small text-ink-muted">{t('editor.sections.textsNote')}</p>
      {(['image', 'detail', 'third'] as const).map((which) => (
        <PictureField
          key={which}
          legend={t(key(`editor.sections.about.${which}`))}
          frame={ABOUT_FRAME[which]}
          image={about?.[which]}
          {...(which === 'third' ? { emptyText: t('editor.sections.about.thirdNone') } : { builtinPreview: ABOUT_BUILTIN[which], builtinNote: t('editor.sections.about.builtin') })}
          removeLabel={which === 'third' ? t('editor.sections.about.thirdRemove') : `${t('editor.sections.about.reset')}: ${t(key(`editor.sections.about.${which}`))}`}
          error={err(which)}
          altErrorEn={err(`${which}.alt.en`)}
          altErrorPt={err(`${which}.alt.pt`)}
          onUploaded={(asset) => setDraft((d) => setAboutImage(d, which, asset))}
          onRemove={() => setDraft((d) => setAboutImage(d, which, undefined))}
          onAlt={(l, v) => setDraft((d) => setAboutAlt(d, which, l, v))}
        />
      ))}
    </>
  )
}
