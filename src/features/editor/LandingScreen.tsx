import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { LANDING_IMAGE_KEYS, type LandingCollection, type LandingCollectionLink, MAX_COLLECTION_TEXT, MAX_COLLECTION_TITLE, MAX_LANDING_COLLECTIONS } from '@/domain/siteContent'
import { CATEGORIES, type Category } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { builtinAsCollections } from '../marketing/landingBuiltin'
import { LANDING_IMAGES, landingImage } from '../marketing/landingImages'
import { useEditor } from './EditorContext'
import { addCollection, canAddCollection, emptyLink, moveCollection, newCollection, removeCollection, replaceCollections, setCollectionHidden, updateCollection, withLang } from './landingOps'

/** What a card may open: active businesses, and the published products of those. */
interface Choices {
  loading: boolean
  failed: boolean
  businesses: { slug: string; name: string }[]
  products: { value: string; label: string; businessSlug: string; productSlug: string; category: Category }[]
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
        return { value: `${b.slug}/${p.slug}`, label: `${localized(p.name)} · ${b.name}`, businessSlug: b.slug, productSlug: p.slug, category: p.category }
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
    // Each built-in card opens the first catalogue that has that category, as the page does today.
    const cards = builtinAsCollections((c) => {
      const hit = choices.products.find((p) => p.category === c.category) ?? choices.products[0]
      return hit ? { kind: 'catalog', businessSlug: hit.businessSlug, ...(choices.products.some((p) => p.category === c.category) ? { category: c.category } : {}) } : { kind: 'none' }
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
              <Input value={card.title.en} onChange={(e) => patch((c) => ({ ...c, title: withLang(c.title, 'en', e.target.value) }))} />
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

          <PicturePicker value={card.image} error={err('image')} onChange={(image) => patch((c) => ({ ...c, image }))} />

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

const KINDS: LandingCollectionLink['kind'][] = ['product', 'catalog', 'apply', 'none']

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
