import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import {
  LANDING_IMAGE_KEYS,
  type LandingCollection,
  type LandingCollectionLink,
  MAX_COLLECTION_PRODUCTS,
  MAX_COLLECTION_TEXT,
  MAX_COLLECTION_TITLE,
  MAX_LANDING_COLLECTIONS,
  type ProductRef,
} from '@/domain/siteContent'
import { CATEGORIES, type Category } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { slugInput } from '@/lib/slug'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { BUILTIN_COLLECTIONS, builtinAsCollections } from '../marketing/landingBuiltin'
import { LANDING_IMAGES, landingImage } from '../marketing/landingImages'
import { useEditor } from './EditorContext'
import {
  addCollection,
  addCollectionProduct,
  canAddCollection,
  canAddProduct,
  emptyLink,
  moveCollection,
  moveCollectionProduct,
  newCollection,
  removeCollection,
  removeCollectionProduct,
  replaceCollections,
  setCollectionHidden,
  setCollectionTitleEn,
  setFeatured,
  updateCollection,
  withLang,
} from './landingOps'

/** What a card may open: active businesses, and the published products of those. */
interface Choices {
  loading: boolean
  failed: boolean
  businesses: { slug: string; name: string }[]
  products: { value: string; label: string; name: string; businessName: string; image?: string; hasModel: boolean; businessSlug: string; productSlug: string; category: Category }[]
}

function useChoices(): Choices {
  const { localized } = useI18n()
  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  const businesses = useServiceQuery(() => service.getBusinesses(), [])
  return useMemo(() => {
    const active = new Map((businesses.data ?? []).filter((b) => b.status === 'active').map((b) => [b.id, b]))
    const list = (products.data ?? [])
      .filter((p) => active.has(p.businessId))
      .map((p) => {
        const b = active.get(p.businessId)!
        return {
          value: `${b.slug}/${p.slug}`,
          label: `${localized(p.name)} · ${b.name}`,
          name: localized(p.name),
          businessName: b.name,
          image: primaryImage(p)?.url,
          hasModel: !!p.models.glb,
          businessSlug: b.slug,
          productSlug: p.slug,
          category: p.category,
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
    return {
      loading: products.status === 'loading' || businesses.status === 'loading',
      failed: products.status === 'error' || businesses.status === 'error',
      businesses: [...active.values()].map((b) => ({ slug: b.slug, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
      products: list,
    }
  }, [products.data, products.status, businesses.data, businesses.status, localized])
}

/** /admin/editor/landing: the cards under "Collections" on the landing page (ADR-0046). */
export default function LandingScreen() {
  const { t } = useI18n()
  const { draft, setDraft } = useEditor()
  const choices = useChoices()
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
    // Each built-in card opens its own collection page, filled with the published products of that category.
    const cards = builtinAsCollections().map((card) => {
      const category = BUILTIN_COLLECTIONS.find((c) => c.key === card.slug)?.category
      const products = choices.products.filter((p) => p.category === category).slice(0, MAX_COLLECTION_PRODUCTS).map((p) => ({ businessSlug: p.businessSlug, productSlug: p.productSlug }))
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
    <section aria-labelledby="landing-heading" className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="landing-heading" className="text-ui-card font-medium text-ink">
            {t('editor.menu.landing')}
          </h2>
          <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.landing.description', { max: MAX_LANDING_COLLECTIONS })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!canAddCollection(draft) && <span className="text-ui-small text-ink-muted">{t('editor.landing.limit', { max: MAX_LANDING_COLLECTIONS })}</span>}
          <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={add} disabled={!canAddCollection(draft)}>
            {t('editor.landing.add')}
          </Button>
        </div>
      </div>

      <FeaturedPicker choices={choices} />

      {choices.failed && (
        <InlineNotice tone="warning" className="mt-4">
          {t('editor.landing.dataError')}
        </InlineNotice>
      )}

      {list.length === 0 ? (
        <div className="mt-6 border border-dashed border-line-strong bg-surface px-5 py-6">
          <p className="max-w-xl text-ui-body text-ink-muted">{t('editor.landing.empty')}</p>
          <Button className="mt-4" onClick={startFromCurrent} disabled={choices.loading}>
            {t('editor.landing.startFromCurrent')}
          </Button>
        </div>
      ) : (
        <ol aria-label={t('editor.landing.list')} className="mt-6 space-y-3">
          {list.map((c, i) => (
            <CardEditor
              key={c.id}
              card={c}
              index={i}
              count={list.length}
              open={openId === c.id}
              choices={choices}
              onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              onRemove={() => void remove(c)}
            />
          ))}
        </ol>
      )}
      <p className="mt-6 text-ui-small text-ink-muted">{t('editor.landing.previewHint')}</p>
    </section>
  )
}

function CardEditor({
  card,
  index,
  count,
  open,
  choices,
  onToggle,
  onRemove,
}: {
  card: LandingCollection
  index: number
  count: number
  open: boolean
  choices: Choices
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
  const patch = (fn: (c: LandingCollection) => LandingCollection) => setDraft((d) => updateCollection(d, card.id, fn))
  const setText = (lang: 'en' | 'pt', value: string) =>
    patch((c) => {
      const text = withLang(c.text, lang, value)
      const { text: _old, ...rest } = c
      return text.en || text.pt ? { ...rest, text } : rest
    })
  const photo = landingImage(card.image)
  const panelId = `landing-card-${card.id}`

  return (
    <li className={cn('border bg-surface', card.hidden ? 'border-dashed border-line-strong' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        {photo && <img src={photo.src} alt="" width={64} height={48} className="h-12 w-16 shrink-0 object-cover" />}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0">
            <span className="block text-ui-small text-ink-muted">{t('editor.landing.card', { n: index + 1 })}</span>
            <span className="block truncate text-ui-body font-medium text-ink">{name}</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {card.hidden && <Badge tone="warning">{t('editor.landing.hiddenBadge')}</Badge>}
        <span className="flex shrink-0 gap-1">
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

          <FormField label={t('editor.landing.slug')} required error={err('slug')} hint={t('editor.landing.slugHint', { slug: card.slug || '…' })}>
            <Input value={card.slug} maxLength={60} spellCheck={false} onChange={(e) => patch((c) => ({ ...c, slug: slugInput(e.target.value, 60) }))} />
          </FormField>

          <PicturePicker value={card.image} error={err('image')} onChange={(image) => patch((c) => ({ ...c, image }))} />

          <ProductsPicker card={card} choices={choices} error={err('products')} />

          <LinkPicker link={card.link} choices={choices} errors={{ kind: err('link'), business: err('link.businessSlug'), product: err('link.productSlug'), category: err('link.category') }} onChange={(link) => patch((c) => ({ ...c, link }))} />
        </div>
      )}
    </li>
  )
}

function PicturePicker({ value, error, onChange }: { value: string; error?: string; onChange: (key: string) => void }) {
  const { t, lang } = useI18n()
  return (
    <fieldset>
      <legend className="text-ui-small font-medium text-ink">{t('editor.landing.picture')}</legend>
      <p className="mt-0.5 text-ui-small text-ink-muted">{t('editor.landing.pictureHelp')}</p>
      <div role="radiogroup" aria-label={t('editor.landing.picture')} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
              className={cn('relative block overflow-hidden border bg-subtle', selected ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong')}
            >
              <img src={img.src} alt="" width={160} height={120} loading="lazy" className={cn('aspect-[4/3] w-full object-cover', img.focus)} />
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

const KINDS: LandingCollectionLink['kind'][] = ['collection', 'product', 'catalog', 'apply', 'none']

function LinkPicker({
  link,
  choices,
  errors,
  onChange,
}: {
  link: LandingCollectionLink
  choices: Choices
  errors: { kind?: string; business?: string; product?: string; category?: string }
  onChange: (link: LandingCollectionLink) => void
}) {
  const { t } = useI18n()
  const productValue = link.kind === 'product' ? `${link.businessSlug}/${link.productSlug}` : ''
  const productKnown = choices.products.some((p) => p.value === productValue)
  const businessSlug = link.kind === 'catalog' ? link.businessSlug : ''
  const businessKnown = choices.businesses.some((b) => b.slug === businessSlug)
  const gone = !choices.loading && !choices.failed
  return (
    <div className="space-y-4">
      <FormField label={t('editor.landing.link')} error={errors.kind}>
        <Select value={link.kind} onChange={(e) => onChange(emptyLink(e.target.value as LandingCollectionLink['kind']))}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`editor.landing.link.${k}` as TranslationKey)}
            </option>
          ))}
        </Select>
      </FormField>

      {link.kind === 'product' && (
        <FormField
          label={t('editor.landing.product')}
          required
          error={errors.product ?? errors.business ?? (gone && productValue !== '/' && !productKnown ? t('editor.landing.linkMissing', { what: t('editor.landing.linkMissing.product') }) : undefined)}
          hint={gone && choices.products.length === 0 ? t('editor.landing.productEmpty') : undefined}
        >
          <Select
            value={productValue === '/' ? '' : productValue}
            onChange={(e) => {
              const hit = choices.products.find((p) => p.value === e.target.value)
              onChange({ kind: 'product', businessSlug: hit?.businessSlug ?? '', productSlug: hit?.productSlug ?? '' })
            }}
          >
            <option value="">{t('editor.landing.productPick')}</option>
            {!productKnown && productValue !== '/' && <option value={productValue}>{productValue}</option>}
            {choices.products.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      {link.kind === 'catalog' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('editor.landing.business')}
            required
            error={errors.business ?? (gone && businessSlug && !businessKnown ? t('editor.landing.linkMissing', { what: t('editor.landing.linkMissing.business') }) : undefined)}
          >
            <Select value={businessSlug} onChange={(e) => onChange({ kind: 'catalog', businessSlug: e.target.value, ...(link.category ? { category: link.category } : {}) })}>
              <option value="">{t('editor.landing.businessPick')}</option>
              {!businessKnown && businessSlug && <option value={businessSlug}>{businessSlug}</option>}
              {choices.businesses.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('editor.landing.category')} optional={t('common.optional')} error={errors.category}>
            <Select
              value={link.category ?? ''}
              onChange={(e) => onChange({ kind: 'catalog', businessSlug: link.businessSlug, ...(e.target.value ? { category: e.target.value as Category } : {}) })}
            >
              <option value="">{t('editor.landing.categoryAny')}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}` as TranslationKey)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      )}
    </div>
  )
}

/** The thumbnail, name and business of a product, for the pickers. */
function ProductLine({ image, name, businessName, hasModel }: { image?: string; name: string; businessName: string; hasModel?: boolean }) {
  const { t } = useI18n()
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      {image ? <img src={image} alt="" width={40} height={40} className="size-10 shrink-0 bg-subtle object-cover" /> : <span className="size-10 shrink-0 bg-subtle" aria-hidden />}
      <span className="min-w-0">
        <span className="block truncate text-ui-body font-medium text-ink">{name}</span>
        <span className="block truncate text-ui-small text-ink-muted">{businessName}</span>
      </span>
      {hasModel && <Badge tone="success">{t('editor.landing.has3d')}</Badge>}
    </span>
  )
}

/** The products the collection's own page shows: added from the published products of all businesses, reordered, removed. */
function ProductsPicker({ card, choices, error }: { card: LandingCollection; choices: Choices; error?: string }) {
  const { t } = useI18n()
  const { setDraft } = useEditor()
  const known = new Map(choices.products.map((p) => [p.value, p]))
  const keyOf = (r: ProductRef) => `${r.businessSlug}/${r.productSlug}`
  const full = !canAddProduct(card)
  const available = choices.products.filter((p) => !card.products.some((r) => keyOf(r) === p.value))
  const gone = !choices.loading && !choices.failed
  return (
    <fieldset>
      <legend className="text-ui-small font-medium text-ink">{t('editor.landing.products')}</legend>
      <p className="mt-0.5 text-ui-small text-ink-muted">{t('editor.landing.productsHelp', { max: MAX_COLLECTION_PRODUCTS })}</p>
      {card.products.length === 0 ? (
        <p className="mt-3 text-ui-small text-ink-muted">{t('editor.landing.productsNone')}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {card.products.map((r, i) => {
            const hit = known.get(keyOf(r))
            const name = hit?.name ?? keyOf(r)
            return (
              <li key={keyOf(r)} className="flex flex-wrap items-center gap-2 border border-line p-2">
                <ProductLine image={hit?.image} name={name} businessName={hit?.businessName ?? (gone ? t('editor.landing.productsGone') : '')} />
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Select
          aria-label={t('editor.landing.productsAdd')}
          value=""
          disabled={full || available.length === 0}
          onChange={(e) => {
            const hit = choices.products.find((p) => p.value === e.target.value)
            if (hit) setDraft((d) => addCollectionProduct(d, card.id, { businessSlug: hit.businessSlug, productSlug: hit.productSlug }))
          }}
          className="max-w-md"
        >
          <option value="">{t('editor.landing.productsAddPick')}</option>
          {available.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <span className="text-ui-small text-ink-muted">{full ? t('editor.landing.productsFull', { max: MAX_COLLECTION_PRODUCTS }) : t('editor.landing.productsCount', { n: card.products.length, max: MAX_COLLECTION_PRODUCTS })}</span>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** The piece the landing page's "Open a live piece in 3D" opens: a published product that has a 3D model. */
function FeaturedPicker({ choices }: { choices: Choices }) {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const featured = draft.landing.featured
  const value = featured ? `${featured.businessSlug}/${featured.productSlug}` : ''
  const withModel = choices.products.filter((p) => p.hasModel)
  const current = withModel.find((p) => p.value === value)
  const missing = !!featured && !choices.loading && !choices.failed && !current
  const err = errors['landing.featured.businessSlug'] ?? errors['landing.featured.productSlug']
  return (
    <div className="mt-6 border border-line bg-surface p-4">
      <FormField
        label={t('editor.landing.featured')}
        error={err ? t(`editor.err.${err}` as TranslationKey) : missing ? t('editor.landing.featuredGone') : undefined}
        hint={!choices.loading && !choices.failed && withModel.length === 0 ? t('editor.landing.featuredEmpty') : t('editor.landing.featuredHelp')}
      >
        <Select
          value={value}
          onChange={(e) => {
            const hit = withModel.find((p) => p.value === e.target.value)
            setDraft((d) => setFeatured(d, hit ? { businessSlug: hit.businessSlug, productSlug: hit.productSlug } : undefined))
          }}
        >
          <option value="">{t('editor.landing.featuredPick')}</option>
          {missing && <option value={value}>{value}</option>}
          {withModel.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} · {t('editor.landing.has3d')}
            </option>
          ))}
        </Select>
      </FormField>
      {current && (
        <div className="mt-3">
          <ProductLine image={current.image} name={current.name} businessName={current.businessName} hasModel />
        </div>
      )}
    </div>
  )
}
