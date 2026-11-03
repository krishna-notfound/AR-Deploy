import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, ImageIcon, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import {
  LANDING_IMAGE_KEYS,
  type LandingCollection,
  MAX_COLLECTION_PRODUCTS,
  MAX_COLLECTION_TEXT,
  MAX_COLLECTION_TITLE,
  MAX_LANDING_COLLECTIONS,
  type SiteAsset,
  isSiteAsset,
} from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { slugInput } from '@/lib/slug'
import { siteAssetUrl } from '@/services'
import { BUILTIN_COLLECTIONS, builtinAsCollections } from '../marketing/landingBuiltin'
import { LANDING_IMAGES, collectionImage } from '../marketing/landingImages'
import { useEditor } from './EditorContext'
import { NoPiecesPrompt, PieceChecklist, PieceThumb } from './PiecePicker'
import { UploadButton } from './UploadButton'
import {
  addCollection,
  canAddCollection,
  canAddProduct,
  moveCollection,
  moveCollectionProduct,
  newCollection,
  removeCollection,
  removeCollectionProduct,
  replaceCollections,
  setCollectionHidden,
  setCollectionTitleEn,
  toggleCollectionProduct,
  updateCollection,
  withLang,
} from './landingOps'
import type { ShowcasePiece } from './useShowcasePieces'

/** The "Collections" block of the Landing tab: the cards under "Collections" on the landing page (ADR-0046, ADR-0047). */
export function CollectionsBlock({ pieces }: { pieces: ShowcasePiece[] }) {
  const { t } = useI18n()
  const { draft, setDraft } = useEditor()
  const confirm = useConfirm()
  const list = draft.landing.collections
  const [openId, setOpenId] = useState<string | null>(null)
  const nameOf = (c: LandingCollection) => c.title.en.trim() || t('editor.landing.untitled')

  const add = () => {
    const card = newCollection()
    setDraft((d) => addCollection(d, card))
    setOpenId(card.id)
  }
  const startFromCurrent = () => {
    // Each built-in card opens its own collection page, filled with the showcase pieces of that category.
    const cards = builtinAsCollections().map((card) => {
      const category = BUILTIN_COLLECTIONS.find((c) => c.key === card.slug)?.category
      const products = pieces
        .filter((p) => p.published && p.category === category)
        .slice(0, MAX_COLLECTION_PRODUCTS)
        .map((p) => p.ref)
      return { ...card, products }
    })
    setDraft((d) => replaceCollections(d, cards))
    setOpenId(cards[0]?.id ?? null)
  }
  const remove = async (c: LandingCollection) => {
    const yes = await confirm({ title: t('editor.landing.removeTitle'), body: t('editor.landing.removeBody', { name: nameOf(c) }), confirmLabel: t('editor.landing.removeConfirm'), destructive: true })
    if (yes) setDraft((d) => removeCollection(d, c.id))
  }

  return (
    <section aria-labelledby="landing-collections-heading" className="border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="landing-collections-heading" className="text-ui-card font-medium text-ink">
            {t('editor.landing.collections.title')}
          </h3>
          <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.landing.collections.help', { max: MAX_LANDING_COLLECTIONS })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!canAddCollection(draft) && <span className="text-ui-small text-ink-muted">{t('editor.landing.limit', { max: MAX_LANDING_COLLECTIONS })}</span>}
          <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={add} disabled={!canAddCollection(draft)}>
            {t('editor.landing.add')}
          </Button>
        </div>
      </div>

      {pieces.length === 0 && (
        <div className="mt-4">
          <NoPiecesPrompt />
        </div>
      )}

      {list.length === 0 ? (
        <div className="mt-4 border border-dashed border-line-strong px-5 py-6">
          <p className="max-w-xl text-ui-body text-ink-muted">{t('editor.landing.empty')}</p>
          <Button className="mt-4" onClick={startFromCurrent}>
            {t('editor.landing.startFromCurrent')}
          </Button>
        </div>
      ) : (
        <ol aria-label={t('editor.landing.list')} className="mt-4 space-y-3">
          {list.map((c, i) => (
            <CardEditor
              key={c.id}
              card={c}
              index={i}
              count={list.length}
              open={openId === c.id}
              pieces={pieces}
              onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              onRemove={() => void remove(c)}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function CardEditor({
  card,
  index,
  count,
  open,
  pieces,
  onToggle,
  onRemove,
}: {
  card: LandingCollection
  index: number
  count: number
  open: boolean
  pieces: ShowcasePiece[]
  onToggle: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const { setDraft, errors } = useEditor()
  const name = card.title.en.trim() || t('editor.landing.untitled')
  const err = (path: string) => {
    const key = errors[`landing.collections.${index}.${path}`]
    return key ? t(`editor.err.${key}` as TranslationKey) : undefined
  }
  // A card always opens its own collection page (ADR-0047): editing one also settles an older link kind to that.
  const patch = (fn: (c: LandingCollection) => LandingCollection) => setDraft((d) => updateCollection(d, card.id, (c) => ({ ...fn(c), link: { kind: 'collection' } })))
  const setText = (lang: 'en' | 'pt', value: string) =>
    patch((c) => {
      const text = withLang(c.text, lang, value)
      const { text: _old, ...rest } = c
      return text.en || text.pt ? { ...rest, text } : rest
    })
  const photo = collectionImage(card.image)
  const panelId = `landing-card-${card.id}`

  return (
    <li className={cn('border bg-surface', card.hidden ? 'border-dashed border-line-strong' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        {photo ? <img src={photo.src} alt="" width={64} height={48} className="h-12 w-16 shrink-0 object-cover" /> : <PieceThumb piece={{}} className="h-12 w-16 shrink-0" />}
        <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="flex min-h-11 min-w-0 flex-1 basis-40 items-center gap-2 text-left">
          <span className="min-w-0">
            <span className="block text-ui-small text-ink-muted">{t('editor.landing.card', { n: index + 1 })}</span>
            <span className="block truncate text-ui-body font-medium text-ink">{name}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {card.hidden && <Badge tone="warning">{t('editor.landing.hiddenBadge')}</Badge>}
        <span className="ml-auto flex shrink-0 gap-1">
          <Button size="sm" aria-label={t('editor.landing.moveUp', { name })} disabled={index === 0} onClick={() => setDraft((d) => moveCollection(d, card.id, -1))}>
            <ArrowUp className="size-4" aria-hidden />
          </Button>
          <Button size="sm" aria-label={t('editor.landing.moveDown', { name })} disabled={index === count - 1} onClick={() => setDraft((d) => moveCollection(d, card.id, 1))}>
            <ArrowDown className="size-4" aria-hidden />
          </Button>
          <Button size="sm" aria-label={t(card.hidden ? 'editor.landing.show' : 'editor.landing.hide', { name })} onClick={() => setDraft((d) => setCollectionHidden(d, card.id, !card.hidden))}>
            {card.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </Button>
          <Button size="sm" variant="danger" aria-label={t('editor.landing.remove', { name })} onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </span>
      </div>

      {open && (
        <div id={panelId} className="space-y-6 border-t border-line p-4">
          <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <PictureArea value={card.image} error={err('image')} onChange={(image) => patch((c) => ({ ...c, image }))} />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('editor.field.titleEn')} required error={err('title.en')} hint={t('editor.landing.titleLimit', { max: MAX_COLLECTION_TITLE })}>
                  <Input value={card.title.en} onChange={(e) => setDraft((d) => setCollectionTitleEn(d, card.id, e.target.value))} />
                </FormField>
                <FormField label={t('editor.field.titlePt')} optional={t('common.optional')} error={err('title.pt')} hint={t('editor.landing.ptHint')}>
                  <Input value={card.title.pt ?? ''} onChange={(e) => patch((c) => ({ ...c, title: withLang(c.title, 'pt', e.target.value) }))} />
                </FormField>
                <FormField label={t('editor.field.bodyEn')} optional={t('common.optional')} error={err('text.en')} hint={t('editor.landing.textHint', { max: MAX_COLLECTION_TEXT })}>
                  <Textarea rows={2} value={card.text?.en ?? ''} onChange={(e) => setText('en', e.target.value)} />
                </FormField>
                <FormField label={t('editor.field.bodyPt')} optional={t('common.optional')} error={err('text.pt')}>
                  <Textarea rows={2} value={card.text?.pt ?? ''} onChange={(e) => setText('pt', e.target.value)} />
                </FormField>
              </div>
              <details open={!!err('slug')} className="text-ui-small">
                <summary className="min-h-11 cursor-pointer py-2.5 font-medium text-ink-body">{t('editor.landing.slug')}</summary>
                <FormField label={t('editor.landing.slug')} required error={err('slug')} hint={t('editor.landing.slugHint', { slug: card.slug || '…' })}>
                  <Input value={card.slug} maxLength={60} spellCheck={false} onChange={(e) => patch((c) => ({ ...c, slug: slugInput(e.target.value, 60) }))} />
                </FormField>
              </details>
            </div>
          </div>

          <PiecesSection card={card} pieces={pieces} error={err('products')} />
        </div>
      )}
    </li>
  )
}

/** The card's picture: a large preview, with Upload, Choose built-in and Remove (an uploaded picture goes back to a built-in one). */
function PictureArea({ value, error, onChange }: { value: string | SiteAsset; error?: string; onChange: (image: string | SiteAsset) => void }) {
  const { t, lang } = useI18n()
  const [choosing, setChoosing] = useState(false)
  const photo = collectionImage(value)
  const uploaded = isSiteAsset(value)
  const sessionOnly = uploaded && !siteAssetUrl(value)
  return (
    <fieldset>
      <legend className="text-ui-small font-medium text-ink">{t('editor.landing.picture')}</legend>
      <div className="mt-2 aspect-[4/3] w-full overflow-hidden border border-line bg-subtle">
        {photo && !sessionOnly ? (
          <img src={photo.src} alt={t('editor.landing.pictureCurrent')} className={cn('size-full object-cover', photo.focus)} />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-ui-small text-ink-muted">
            <ImageIcon className="size-5" aria-hidden />
            {sessionOnly ? t('editor.showcase.sessionOnly') : t('editor.landing.pictureNone')}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <UploadButton kind="image" label={t(uploaded ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')} onUploaded={onChange} />
        <Button size="sm" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
          {t('editor.landing.chooseBuiltin')}
        </Button>
        {uploaded && (
          <Button size="sm" onClick={() => onChange('hero-living')}>
            {t('editor.showcase.remove')}
          </Button>
        )}
      </div>
      <p className="mt-1 text-ui-small text-ink-muted">{t('editor.showcase.pictureHint')}</p>
      {choosing && (
        <div role="radiogroup" aria-label={t('editor.landing.chooseBuiltin')} className="mt-3 grid grid-cols-3 gap-2">
          {LANDING_IMAGE_KEYS.map((key) => {
            const img = LANDING_IMAGES[key]
            const selected = value === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={img.alt[lang]}
                title={img.alt[lang]}
                onClick={() => onChange(key)}
                className={cn('relative block min-h-11 overflow-hidden border bg-subtle', selected ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong')}
              >
                <img src={img.src} alt="" width={160} height={120} loading="lazy" className={cn('aspect-[4/3] w-full object-cover', img.focus)} />
              </button>
            )
          })}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** The pieces the collection's own page shows: ticked from a grid of the showcase pieces, then ordered or removed in the list below. */
function PiecesSection({ card, pieces, error }: { card: LandingCollection; pieces: ShowcasePiece[]; error?: string }) {
  const { t } = useI18n()
  const { setDraft } = useEditor()
  const known = new Map(pieces.map((p) => [`${p.ref.businessSlug}/${p.ref.productSlug}`, p]))
  const keyOf = (r: LandingCollection['products'][number]) => `${r.businessSlug}/${r.productSlug}`
  const full = !canAddProduct(card)
  return (
    <fieldset>
      <legend className="text-ui-small font-medium text-ink">{t('editor.landing.products')}</legend>
      <p className="mt-0.5 text-ui-small text-ink-muted">{t('editor.landing.productsHelp', { max: MAX_COLLECTION_PRODUCTS })}</p>
      <div className="mt-3">
        {pieces.length > 0 && <PieceChecklist label={t('editor.landing.productsAdd')} pieces={pieces} selected={card.products} full={full} onToggle={(ref) => setDraft((d) => toggleCollectionProduct(d, card.id, ref))} />}
      </div>
      <p className="mt-2 text-ui-small text-ink-muted">{full ? t('editor.landing.productsFull', { max: MAX_COLLECTION_PRODUCTS }) : t('editor.landing.productsCount', { n: card.products.length, max: MAX_COLLECTION_PRODUCTS })}</p>

      {card.products.length === 0 ? (
        <p className="mt-3 text-ui-small text-ink-muted">{t('editor.landing.productsNone')}</p>
      ) : (
        <ol aria-label={t('editor.landing.productsOrder')} className="mt-3 space-y-2">
          {card.products.map((r, i) => {
            const hit = known.get(keyOf(r))
            const name = hit?.name ?? r.productSlug
            return (
              <li key={keyOf(r)} className="flex flex-wrap items-center gap-2 border border-line p-2">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <PieceThumb piece={hit ?? {}} className="size-10 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate text-ui-body font-medium text-ink">{name}</span>
                    {!hit && <span className="block text-ui-small text-danger">{t('editor.landing.pieceGone')}</span>}
                    {hit && !hit.published && <span className="block text-ui-small text-warning">{t('editor.landing.pieceDraftShort')}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" aria-label={t('editor.landing.productMoveUp', { name })} disabled={i === 0} onClick={() => setDraft((d) => moveCollectionProduct(d, card.id, r, -1))}>
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button size="sm" aria-label={t('editor.landing.productMoveDown', { name })} disabled={i === card.products.length - 1} onClick={() => setDraft((d) => moveCollectionProduct(d, card.id, r, 1))}>
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button size="sm" variant="danger" aria-label={t('editor.landing.productRemove', { name })} onClick={() => setDraft((d) => removeCollectionProduct(d, card.id, r))}>
                    <X className="size-4" aria-hidden />
                  </Button>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}
