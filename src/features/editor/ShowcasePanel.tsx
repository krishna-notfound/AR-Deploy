import { Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import {
  type LandingShowcase,
  MAX_SHOWCASE_DIMENSIONS,
  MAX_SHOWCASE_EYEBROW,
  MAX_SHOWCASE_MATERIALS,
  MAX_SHOWCASE_TEXT,
  MAX_SHOWCASE_TITLE,
  type SiteAsset,
  type SiteAssetKind,
} from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { content, siteAssetUrl } from '@/services'
import { useEditor } from './EditorContext'
import { clearShowcase, setShowcaseProduct, updateShowcase, withLang } from './landingOps'

export interface ShowcaseProductChoice {
  value: string
  label: string
  businessSlug: string
  productSlug: string
}

const ACCEPT: Record<SiteAssetKind, string> = { image: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', glb: '.glb,model/gltf-binary', usdz: '.usdz' }

/** One upload button with its own "Uploading..." and error state. */
export function UploadButton({ kind, label, onUploaded }: { kind: SiteAssetKind; label: string; onUploaded: (asset: SiteAsset) => void }) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    const r = await content.uploadSiteAsset(file, kind)
    setBusy(false)
    if (r.ok) onUploaded(r.data)
    else setError(r.error.message)
  }
  return (
    <div>
      <input ref={input} type="file" accept={ACCEPT[kind]} className="sr-only" tabIndex={-1} aria-label={label} data-testid={`upload-${kind}`} onChange={(e) => void pick(e.target.files?.[0])} />
      <Button size="sm" icon={<Upload className="size-4" aria-hidden />} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? t('editor.showcase.uploading') : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** The landing page's 3D showcase: the Owner/Admin's own picture and 3D model, texts and price (owner decision 2026-11-03). */
export function ShowcasePanel({ products, productsLoading }: { products: ShowcaseProductChoice[]; productsLoading: boolean }) {
  const { t } = useI18n()
  const { draft, setDraft, errors } = useEditor()
  const sc = draft.landing.showcase
  const err = (path: string) => {
    const key = errors[`landing.showcase.${path}`]
    return key ? t(`editor.err.${key}` as TranslationKey) : undefined
  }
  const patch = (fn: (s: LandingShowcase) => LandingShowcase) => setDraft((d) => updateShowcase(d, fn))
  const setLang = (field: 'eyebrow' | 'text' | 'materials', lang: 'en' | 'pt', value: string) =>
    patch((s) => {
      const next = withLang(s[field], lang, value)
      const { [field]: _old, ...rest } = s
      return next.en || next.pt ? { ...rest, [field]: next } : rest
    })
  const productValue = sc?.product ? `${sc.product.businessSlug}/${sc.product.productSlug}` : ''
  const productMissing = !!sc?.product && !productsLoading && !products.some((p) => p.value === productValue)
  const imageUrl = sc?.image ? siteAssetUrl(sc.image) : ''

  return (
    <section aria-labelledby="showcase-heading" className="mt-6 border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="showcase-heading" className="text-ui-card font-medium text-ink">
            {t('editor.showcase.title')}
          </h3>
          <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.showcase.help')}</p>
        </div>
        {sc && (
          <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setDraft((d) => clearShowcase(d))}>
            {t('editor.showcase.clear')}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-ui-small font-medium text-ink">{t('editor.showcase.picture')}</p>
          {sc?.image && imageUrl && <img src={imageUrl} alt={t('editor.showcase.pictureAlt')} width={160} height={120} className="mt-2 aspect-[4/3] w-40 border border-line bg-subtle object-cover" />}
          {sc?.image && !imageUrl && <p className="mt-2 text-ui-small text-ink-muted">{t('editor.showcase.sessionOnly')}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UploadButton kind="image" label={t(sc?.image ? 'editor.showcase.replacePicture' : 'editor.showcase.uploadPicture')} onUploaded={(image) => patch((s) => ({ ...s, image }))} />
            {sc?.image && (
              <Button
                size="sm"
                onClick={() =>
                  patch((s) => {
                    const { image: _i, ...rest } = s
                    return rest
                  })
                }
              >
                {t('editor.showcase.remove')}
              </Button>
            )}
          </div>
          <p className="mt-1 text-ui-small text-ink-muted">{t('editor.showcase.pictureHint')}</p>
          {err('image') && <p role="alert" className="mt-1 text-ui-small text-danger">{err('image')}</p>}
        </div>
        <div>
          <p className="text-ui-small font-medium text-ink">{t('editor.showcase.model')}</p>
          {sc?.model && <p className="mt-2 break-all text-ui-small text-ink">{t('editor.showcase.modelSet', { name: sc.model.glb.path.replace('landing/', '') })}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <UploadButton kind="glb" label={t(sc?.model ? 'editor.showcase.replaceModel' : 'editor.showcase.uploadModel')} onUploaded={(glb) => patch((s) => ({ ...s, model: { ...s.model, glb } }))} />
            {sc?.model && (
              <Button
                size="sm"
                onClick={() =>
                  patch((s) => {
                    const { model: _m, ...rest } = s
                    return rest
                  })
                }
              >
                {t('editor.showcase.remove')}
              </Button>
            )}
          </div>
          <p className="mt-1 text-ui-small text-ink-muted">{t('editor.showcase.modelHint')}</p>
          {(err('model.glb') ?? err('model.glb.path')) && <p role="alert" className="mt-1 text-ui-small text-danger">{err('model.glb') ?? err('model.glb.path')}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <FormField label={t('editor.showcase.eyebrowEn')} optional={t('common.optional')} error={err('eyebrow.en')} hint={t('editor.landing.titleLimit', { max: MAX_SHOWCASE_EYEBROW })}>
          <Input value={sc?.eyebrow?.en ?? ''} onChange={(e) => setLang('eyebrow', 'en', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.eyebrowPt')} optional={t('common.optional')} error={err('eyebrow.pt')}>
          <Input value={sc?.eyebrow?.pt ?? ''} onChange={(e) => setLang('eyebrow', 'pt', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.titleEn')} required error={err('title.en')} hint={t('editor.landing.titleLimit', { max: MAX_SHOWCASE_TITLE })}>
          <Input value={sc?.title.en ?? ''} onChange={(e) => patch((s) => ({ ...s, title: { ...s.title, en: e.target.value } }))} />
        </FormField>
        <FormField label={t('editor.showcase.titlePt')} optional={t('common.optional')} error={err('title.pt')}>
          <Input value={sc?.title.pt ?? ''} onChange={(e) => patch((s) => ({ ...s, title: withLang(s.title, 'pt', e.target.value) }))} />
        </FormField>
        <FormField label={t('editor.showcase.textEn')} optional={t('common.optional')} error={err('text.en')} hint={t('editor.landing.titleLimit', { max: MAX_SHOWCASE_TEXT })}>
          <Textarea rows={3} value={sc?.text?.en ?? ''} onChange={(e) => setLang('text', 'en', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.textPt')} optional={t('common.optional')} error={err('text.pt')}>
          <Textarea rows={3} value={sc?.text?.pt ?? ''} onChange={(e) => setLang('text', 'pt', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.materialsEn')} optional={t('common.optional')} error={err('materials.en')} hint={t('editor.landing.titleLimit', { max: MAX_SHOWCASE_MATERIALS })}>
          <Input value={sc?.materials?.en ?? ''} onChange={(e) => setLang('materials', 'en', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.materialsPt')} optional={t('common.optional')} error={err('materials.pt')}>
          <Input value={sc?.materials?.pt ?? ''} onChange={(e) => setLang('materials', 'pt', e.target.value)} />
        </FormField>
        <FormField label={t('editor.showcase.dimensions')} optional={t('common.optional')} error={err('dimensions')} hint={t('editor.showcase.dimensionsHint', { max: MAX_SHOWCASE_DIMENSIONS })}>
          <Input value={sc?.dimensions ?? ''} onChange={(e) => patch((s) => ({ ...s, dimensions: e.target.value }))} />
        </FormField>
        <FormField label={t('editor.showcase.price')} optional={t('common.optional')} error={err('price.amount') ?? err('price.currency')}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={sc?.price ? String(sc.price.amount) : ''}
            onChange={(e) =>
              patch((s) => {
                const { price: _p, ...rest } = s
                const n = Number(e.target.value)
                return e.target.value !== '' && Number.isFinite(n) ? { ...rest, price: { amount: n, currency: 'EUR' } } : rest
              })
            }
          />
        </FormField>
      </div>

      <div className="mt-6">
        <FormField
          label={t('editor.showcase.product')}
          optional={t('common.optional')}
          error={err('product.businessSlug') ?? err('product.productSlug') ?? (productMissing ? t('editor.landing.featuredGone') : undefined)}
          hint={t('editor.showcase.productHelp')}
        >
          <Select value={productValue} onChange={(e) => setDraft((d) => setShowcaseProduct(d, products.find((p) => p.value === e.target.value)))}>
            <option value="">{t('editor.showcase.productNone')}</option>
            {productMissing && <option value={productValue}>{productValue}</option>}
            {products.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      {!sc && <InlineNotice tone="info" className="mt-4">{t('editor.showcase.empty')}</InlineNotice>}
    </section>
  )
}
