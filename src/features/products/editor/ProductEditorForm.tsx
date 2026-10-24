import { AlertCircle, ExternalLink, Eye, EyeOff, Save, Trash2 } from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate } from 'react-router'
import { type Crumb, PageHeader } from '@/components/layout/PageHeader'
import { ProductStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { FormField, Input, InputAddon, SegmentedControl, Select } from '@/components/ui/Form'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { type Business, CATEGORIES, CURRENCIES, type Category, type Currency, type Product, type ProductStatus } from '@/domain/types'
import { cn } from '@/lib/cn'
import { PRODUCT_SLUG_MAX, slugInput, slugify } from '@/lib/slug'
import { PUBLIC_URLS_ARE_LIVE, productLocalPath, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import { validateForPublish } from '@/services/validation'
import { primaryImage } from '@/lib/product'
import { type EditorScope, editPath, useProductActions } from '../useProductActions'
import { type EditorForm, convertDims, emptyForm, formFromProduct, toInput } from './formModel'
import { LocalizedField } from './LocalizedField'
import { ModelSection } from './ModelSection'
import { VariantsEditor } from './VariantsEditor'

const SECTIONS = [
  { id: 'basics', label: 'Basic information' },
  { id: 'images', label: 'Images' },
  { id: 'models', label: '3D models' },
  { id: 'specs', label: 'Dimensions & specs' },
  { id: 'cta', label: 'Call to action' },
] as const

const FIELD_SECTION: Record<string, (typeof SECTIONS)[number]['id']> = {
  businessId: 'basics',
  'name.en': 'basics',
  slug: 'basics',
  price: 'basics',
  images: 'images',
  'dimensions.width': 'specs',
  'dimensions.height': 'specs',
  'dimensions.depth': 'specs',
  weight: 'specs',
  variants: 'specs',
  'cta.url': 'cta',
}

type Errors = Record<string, string>
/** Router state handed to the edit route after a new product's first save. */
type NavState = { justPublished?: boolean; publishErrors?: Errors } | null

const DIMS = ['width', 'height', 'depth'] as const

/** The form value behind an error key, to tell which flagged fields the user has changed. */
function fieldValue(f: EditorForm, key: string): string {
  if (key === 'price') return f.priceText
  if (key === 'weight') return `${f.weightText} ${f.input.weight?.unit ?? ''}`
  if (key === 'name.en') return f.input.name.en
  if (key === 'cta.url') return f.input.cta.url ?? ''
  if (key.startsWith('dimensions.')) return f.dims[key.slice(11) as (typeof DIMS)[number]] ?? ''
  if (key === 'images') return JSON.stringify(f.input.images.filter((i) => i.kind === 'gallery').map((i) => i.id))
  if (key === 'variants') return JSON.stringify(f.input.variants)
  if (key === 'businessId' || key === 'slug') return f.input[key]
  return ''
}

/** Every client-side rule in one pass: `errors` block saving, `publish` only block publishing. */
function checkForm(f: EditorForm) {
  const { input, errors } = toInput(f)
  if (!input.businessId) errors.businessId = 'Choose the business this product belongs to.'
  if (!input.name.en) errors['name.en'] = 'Product name (English) is required.'
  if (!input.slug) errors.slug = 'Product URL slug is required.'
  const publish: Errors = {}
  for (const [k, msg] of Object.entries(validateForPublish(input as Product))) if (!errors[k]) publish[k] = msg
  return { input, errors, publish }
}

/** Identical messages (the three dimensions) count and show once. */
const issueCount = (e: Errors) => new Set(Object.values(e)).size

export function ProductEditorForm({
  scope,
  product,
  currentStatus,
  businesses,
  fixedBusiness,
  preselectBusinessId,
  breadcrumbs,
}: {
  scope: EditorScope
  product: Product | null
  currentStatus: ProductStatus
  businesses: Business[]
  fixedBusiness?: Business
  preselectBusinessId?: string
  breadcrumbs: Crumb[]
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const actions = useProductActions(scope)
  const isNew = !product

  const initialForm = useMemo<EditorForm>(() => {
    if (product) return formFromProduct(product)
    const pre = fixedBusiness ?? businesses.find((b) => b.id === preselectBusinessId)
    return emptyForm(pre)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [form, setForm] = useState<EditorForm>(initialForm)
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initialForm))
  const navState = location.state as NavState
  const [errors, setErrors] = useState<Errors>(() => navState?.publishErrors ?? {})
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'unpublish' | 'preview' | 'delete'>(null)
  const [publishedOpen, setPublishedOpen] = useState(() => navState?.justPublished === true)
  /** The last saved version: its slug drives the published dialog and Preview after a slug change. */
  const [latest, setLatest] = useState<Product | null>(product)
  const [pendingUnit, setPendingUnit] = useState<'cm' | 'in' | null>(null)
  /** The dimensions before the last conversion, so converting back restores them exactly (AR-10). */
  const [dimsBefore, setDimsBefore] = useState<{ unit: 'cm' | 'in'; dims: EditorForm['dims'] } | undefined>(undefined)
  const skipBlock = useRef(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const prevForm = useRef(form)
  const dimErrId = useId()

  const dirty = JSON.stringify(form) !== snapshot
  const business = businesses.find((b) => b.id === form.input.businessId) ?? fixedBusiness
  // Files uploaded to Storage live under {businessId}/: switching business would make the save fail
  // (storage-folder check) and orphan the files, so the choice is locked once files are stored.
  const hasStoredUploads =
    form.input.images.some((i) => i.storagePath) ||
    !!form.input.models.glb?.storagePath ||
    !!form.input.models.usdz?.storagePath ||
    form.input.variants.some((v) => v.images?.some((i) => i.storagePath) || !!v.models?.glb?.storagePath || !!v.models?.usdz?.storagePath)
  const base = scope === 'admin' ? '/admin/products' : '/dashboard/products'

  // ---- unsaved-changes guard ----
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !skipBlock.current && dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!navState) return
    window.history.replaceState({ ...window.history.state, usr: null }, '')
    if (navState.publishErrors) requestAnimationFrame(() => summaryRef.current?.focus())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // A flagged field is checked again as soon as it changes, so a fixed value loses its error straight away.
  useEffect(() => {
    const prev = prevForm.current
    prevForm.current = form
    if (prev === form) return
    setErrors((current) => {
      const changed = Object.keys(current).filter((k) => k in FIELD_SECTION && fieldValue(prev, k) !== fieldValue(form, k))
      if (!changed.length) return current
      const now = checkForm(form)
      const next = { ...current }
      for (const k of changed) {
        const msg = now.errors[k] ?? (now.publish[k] === current[k] ? now.publish[k] : undefined)
        if (msg) next[k] = msg
        else delete next[k]
      }
      return next
    })
  }, [form])

  // ---- field helpers ----
  const setInput = (patch: Partial<EditorForm['input']>) => setForm((f) => ({ ...f, input: { ...f.input, ...patch } }))
  const err = (k: string) => errors[k]
  const updateImages = (update: (images: EditorForm['input']['images']) => EditorForm['input']['images']) =>
    setForm((f) => ({ ...f, input: { ...f.input, images: update(f.input.images) } }))

  const showErrors = (e: Errors) => {
    setErrors(e)
    requestAnimationFrame(() => summaryRef.current?.focus())
  }

  /** Saves (create or update). Returns the saved product or null. */
  const save = async (): Promise<Product | null> => {
    const { input, errors: local } = checkForm(form)
    if (Object.keys(local).length) {
      showErrors(local)
      return null
    }
    const res = product ? await service.updateProduct(product.id, input) : await service.createProduct(input)
    if (!res.ok) {
      showErrors(res.error.fieldErrors ?? { _: res.error.message })
      toast.error('Could not save product', res.error.message)
      return null
    }
    setErrors({})
    setSnapshot(JSON.stringify(form))
    setLatest(res.data)
    return res.data
  }

  const goToEdit = (p: Product, state?: NavState) => {
    skipBlock.current = true
    navigate(editPath(scope, p), { replace: true, state })
  }

  const onSaveDraft = async () => {
    setBusy('save')
    const saved = await save()
    setBusy(null)
    if (!saved) return
    toast.success(isNew ? 'Draft saved' : 'Changes saved', isNew ? 'You can keep editing or publish when ready.' : undefined)
    if (isNew) goToEdit(saved)
  }

  /** Lists every missing requirement at once; a new product's draft keeps them across the redirect. */
  const publishBlocked = (e: Errors, saved?: Product) => {
    showErrors(e)
    const n = issueCount(e)
    toast.error('Cannot publish yet', n === 1 ? 'Fix the issue listed at the top of the form.' : `Fix the ${n} issues listed at the top of the form.`)
    if (isNew && saved) goToEdit(saved, { publishErrors: e })
  }

  const onPublish = async () => {
    const check = checkForm(form)
    if (Object.keys(check.errors).length) return publishBlocked({ ...check.errors, ...check.publish })
    setBusy('publish')
    const saved = dirty || isNew ? await save() : latest
    if (!saved) return setBusy(null)
    if (Object.keys(check.publish).length) {
      setBusy(null)
      return publishBlocked(check.publish, saved)
    }
    const res = await service.publishProduct(saved.id)
    setBusy(null)
    if (!res.ok) return publishBlocked(res.error.fieldErrors ?? { _: res.error.message }, saved)
    setLatest(res.data)
    if (isNew) goToEdit(res.data, { justPublished: true })
    else setPublishedOpen(true)
  }

  const onUnpublish = async () => {
    if (!latest) return
    setBusy('unpublish')
    await actions.unpublish({ ...latest, status: currentStatus })
    setBusy(null)
  }

  const onPreview = async () => {
    let target = latest
    if (dirty || isNew) {
      setBusy('preview')
      target = await save()
      setBusy(null)
      if (!target) return
      toast.info('Saved before previewing')
    }
    if (!target || !business) return
    window.open(productLocalPath(business, target, { preview: currentStatus !== 'published' }), '_blank', 'noopener')
    if (isNew) goToEdit(target)
  }

  const onDelete = async () => {
    if (!latest || busy) return
    setBusy('delete')
    skipBlock.current = true
    const deleted = await actions.remove(latest, { after: base })
    if (!deleted) {
      skipBlock.current = false
      setBusy(null)
    }
  }

  // Values are stored in the chosen unit, so switching with values entered asks whether to convert them.
  const unit = form.input.dimensions.unit
  const onUnit = (next: 'cm' | 'in') => {
    if (next === unit) return
    if (DIMS.some((k) => form.dims[k].trim())) return setPendingUnit(next)
    setInput({ dimensions: { ...form.input.dimensions, unit: next } })
  }
  const applyUnit = (convert: boolean) => {
    const next = pendingUnit
    if (!next) return
    const before = dimsBefore
    setDimsBefore(convert ? { unit: form.input.dimensions.unit, dims: form.dims } : undefined)
    setForm((f) => ({
      ...f,
      dims: convert ? convertDims(f.dims, f.input.dimensions.unit, next, before) : f.dims,
      input: { ...f.input, dimensions: { ...f.input.dimensions, unit: next } },
    }))
    setPendingUnit(null)
  }
  const dimsText = (d: EditorForm['dims'], u: string) => `${DIMS.map((k) => d[k].trim() || '?').join(' × ')} ${u}`

  const errorList = Object.entries(errors)
  /** One summary line per distinct message, linked to the first field that has it. */
  const issues = [...errorList.reduce((m, [k, msg]) => (m.has(msg) ? m : m.set(msg, k)), new Map<string, string>())]
  const dimError = DIMS.map((k) => err(`dimensions.${k}`)).find(Boolean)
  const poster = primaryImage({ images: form.input.images } as Product)?.url

  return (
    <>
      <PageHeader
        title={isNew ? 'Add product' : form.input.name.en || 'Untitled product'}
        breadcrumbs={breadcrumbs}
        meta={
          <>
            <ProductStatusBadge status={isNew ? 'draft' : currentStatus} />
            {business && <span className="text-[13px] text-ink-muted">{business.name}</span>}
            {dirty && <span className="text-[13px] text-warning">Unsaved changes</span>}
          </>
        }
        actions={
          !isNew && (
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={onDelete} loading={busy === 'delete'} disabled={!!busy} className="text-danger hover:bg-danger-soft">
              Delete
            </Button>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="Editor sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5 text-[13px]">
            {SECTIONS.map((s) => {
              const hasError = errorList.some(([k]) => FIELD_SECTION[k] === s.id)
              return (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={cn('flex items-center justify-between rounded-md px-2.5 py-1.5 hover:bg-subtle', hasError ? 'text-danger' : 'text-ink-muted hover:text-ink')}>
                    {s.label}
                    {hasError && <AlertCircle className="size-3.5" aria-label="Has errors" />}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6 pb-28">
          {errorList.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft px-4 py-3 outline-none">
              <p className="text-sm font-semibold text-danger">Fix {issues.length === 1 ? 'this issue' : `these ${issues.length} issues`} to continue</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-danger">
                {issues.map(([msg, k]) => (
                  <li key={k}>{FIELD_SECTION[k] ? <a href={`#${FIELD_SECTION[k]}`} className="underline">{msg}</a> : msg}</li>
                ))}
              </ul>
            </div>
          )}

          <Section id="basics" title="Basic information">
            {scope === 'admin' && (
              <FormField
                label="Business"
                required
                error={err('businessId')}
                hint={
                  !isNew
                    ? 'A product stays in the catalog it was created in.'
                    : hasStoredUploads
                      ? 'Uploaded files are stored in this business’s folder. Remove them to choose another business.'
                      : 'The product is published in this business’s catalog.'
                }
              >
                <Select
                  value={form.input.businessId}
                  disabled={!isNew || hasStoredUploads}
                  onChange={(e) => {
                    const b = businesses.find((x) => x.id === e.target.value)
                    setInput({ businessId: e.target.value, currency: b?.defaultCurrency ?? form.input.currency })
                  }}
                >
                  <option value="">Choose a business…</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <LocalizedField
              label="Product name"
              required
              maxLength={100}
              value={form.input.name}
              error={err('name.en')}
              onChange={(name) =>
                setForm((f) => ({ ...f, input: { ...f.input, name, slug: f.slugTouched ? f.input.slug : slugify(name.en) } }))
              }
            />
            <FormField
              label="Product URL"
              required
              error={err('slug')}
              hint={business ? `${PUBLIC_URLS_ARE_LIVE ? 'URL' : 'Demo URL'}: ${productPublicUrl(business, { slug: form.input.slug || 'product-name' })}` : 'Lowercase letters, numbers and hyphens.'}
            >
              <InputAddon addon="/products/">
                <Input maxLength={PRODUCT_SLUG_MAX} value={form.input.slug} onChange={(e) => setForm((f) => ({ ...f, slugTouched: true, input: { ...f.input, slug: slugInput(e.target.value) } }))} />
              </InputAddon>
            </FormField>
            <LocalizedField label="Short description" value={form.input.shortDescription} onChange={(shortDescription) => setInput({ shortDescription })} maxLength={160} hint="One sentence shown under the price." />
            <LocalizedField label="Full description" multiline rows={5} value={form.input.description} onChange={(description) => setInput({ description })} />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Category">
                <Select value={form.input.category} onChange={(e) => setInput({ category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c[0]?.toUpperCase()}
                      {c.slice(1)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Price" error={err('price')} hint="Required to publish.">
                <Input inputMode="decimal" placeholder="0.00" value={form.priceText} onChange={(e) => setForm((f) => ({ ...f, priceText: e.target.value }))} />
              </FormField>
              <FormField label="Currency">
                <Select value={form.input.currency} onChange={(e) => setInput({ currency: e.target.value as Currency })}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </Section>

          <Section id="images" title="Images" description="Product photos for the gallery. At least one is required to publish." error={err('images')}>
            <ImageUpload label="Upload product images" kind="gallery" businessId={form.input.businessId} images={form.input.images} onChange={updateImages} />
            <div className="border-t border-line pt-5">
              <h3 className="mb-1 text-sm font-semibold">Additional photos</h3>
              <p className="mb-3 text-xs text-ink-muted">Room shots, details and close-ups shown lower on the product page.</p>
              <ImageUpload label="Upload additional photos" kind="additional" businessId={form.input.businessId} allowPrimary={false} images={form.input.images} onChange={updateImages} />
            </div>
          </Section>

          <Section id="models" title="3D models" description="Optional. Products without a model show photos only. Colours and options can have their own photos and models (under Colours and variants).">
            <ModelSection
              businessId={form.input.businessId}
              models={form.input.models}
              onChange={(format, asset) => setForm((f) => ({ ...f, input: { ...f.input, models: { ...f.input.models, [format]: asset } } }))}
              dimensions={toInput(form).input.dimensions}
              poster={poster}
              name={form.input.name.en || 'product'}
            />
          </Section>

          <Section id="specs" title="Dimensions & specifications" description="Use the real outer dimensions. They are shown to customers and used to check the 3D model’s scale.">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Measured in</span>
              <SegmentedControl
                label="Dimension unit"
                value={unit}
                onChange={onUnit}
                options={[
                  { value: 'cm', label: 'Centimetres' },
                  { value: 'in', label: 'Inches' },
                ]}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-end gap-4">
                {DIMS.map((k) => {
                  // The shared dimension message is shown once under the row, not under each field.
                  const e = err(`dimensions.${k}`)
                  const shared = !!e && e === dimError
                  return (
                    <FormField key={k} label={k[0]!.toUpperCase() + k.slice(1)} error={shared ? undefined : e} className="w-[calc(50%-0.5rem)] sm:w-32">
                      <InputAddon side="right" addon={unit}>
                        <Input
                          inputMode="decimal"
                          {...(shared ? { 'aria-invalid': true, 'aria-describedby': dimErrId } : {})}
                          value={form.dims[k]}
                          onChange={(ev) => setForm((f) => ({ ...f, dims: { ...f.dims, [k]: ev.target.value } }))}
                        />
                      </InputAddon>
                    </FormField>
                  )
                })}
              </div>
              {dimError && (
                <p id={dimErrId} className="mt-1.5 text-xs font-medium text-danger">
                  {dimError}
                </p>
              )}
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-[1fr_14rem] [&>*:last-child]:sm:pt-3">
              <LocalizedField label="Material" value={form.input.material} onChange={(material) => setInput({ material })} placeholder="e.g. Solid oak, linen upholstery" />
              <FormField label="Weight" optional error={err('weight')}>
                <div className="flex gap-2">
                  <Input inputMode="decimal" value={form.weightText} onChange={(e) => setForm((f) => ({ ...f, weightText: e.target.value }))} />
                  <Select
                    aria-label="Weight unit"
                    className="w-20 shrink-0"
                    value={form.input.weight?.unit ?? 'kg'}
                    onChange={(e) => setInput({ weight: { value: form.input.weight?.value ?? 0, unit: e.target.value as 'kg' | 'lb' } })}
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </Select>
                </div>
              </FormField>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Colours and variants</h3>
              {err('variants') && <p className="mb-2 text-xs font-medium text-danger">{err('variants')}</p>}
              <VariantsEditor
                variants={form.input.variants}
                onChange={(update) => setForm((f) => ({ ...f, input: { ...f.input, variants: update(f.input.variants) } }))}
                currency={form.input.currency}
                businessId={form.input.businessId}
                dimensions={toInput(form).input.dimensions}
                poster={poster}
              />
            </div>
          </Section>

          <Section id="cta" title="Call to action" description="The main button on the product page, for example a contact form or WhatsApp link.">
            <div className="grid items-start gap-4 sm:grid-cols-2 [&>*:last-child]:sm:pt-3">
              <LocalizedField label="Button label" value={form.input.cta.label} onChange={(label) => setInput({ cta: { ...form.input.cta, label } })} maxLength={40} />
              <FormField label="Button link" optional error={err('cta.url')} hint="If empty, the button shows the store’s contact details.">
                <Input type="url" placeholder="https://" value={form.input.cta.url ?? ''} onChange={(e) => setInput({ cta: { ...form.input.cta, url: e.target.value } })} />
              </FormField>
            </div>
          </Section>
        </div>
      </div>

      {/* Sticky publishing bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur-sm lg:left-[var(--sidebar-w,0)]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          <div className="mr-auto hidden items-center gap-2 text-[13px] text-ink-muted sm:flex">
            <ProductStatusBadge status={isNew ? 'draft' : currentStatus} />
            {dirty ? 'Unsaved changes' : isNew ? 'Not saved yet' : 'All changes saved'}
          </div>
          <Button onClick={onPreview} loading={busy === 'preview'} disabled={!!busy || !business} icon={<ExternalLink className="size-4" aria-hidden />}>
            Preview
          </Button>
          <Button onClick={onSaveDraft} loading={busy === 'save'} disabled={!!busy || (!dirty && !isNew)} icon={<Save className="size-4" aria-hidden />}>
            {currentStatus === 'published' && !isNew ? 'Save changes' : 'Save draft'}
          </Button>
          {currentStatus === 'published' && !isNew ? (
            <Button variant="secondary" onClick={onUnpublish} loading={busy === 'unpublish'} disabled={!!busy} icon={<EyeOff className="size-4" aria-hidden />}>
              Unpublish
            </Button>
          ) : (
            <Button variant="primary" onClick={onPublish} loading={busy === 'publish'} disabled={!!busy} icon={<Eye className="size-4" aria-hidden />}>
              Publish
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={publishedOpen && !!latest && !!business}
        onClose={() => setPublishedOpen(false)}
        title="Product published"
        description={
          business?.status === 'active'
            ? 'It now appears in the business catalog.'
            : 'The catalog is not active yet: customers will see this product once the business is activated.'
        }
        footer={
          <>
            <Button onClick={() => setPublishedOpen(false)}>Keep editing</Button>
            {latest && business && (
              <Button variant="primary" icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(productLocalPath(business, latest, { preview: business.status !== 'active' }), '_blank', 'noopener')}>
                Open product page
              </Button>
            )}
          </>
        }
      >
        {latest && business && (
          <div>
            <p className="text-[13px] font-medium">Product URL</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[13px]">{productPublicUrl(business, latest)}</code>
              <CopyButton text={productPublicUrl(business, latest)} label="Copy" toastTitle="Product URL copied" />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && (
              <p className="mt-2 text-xs text-ink-muted">
                Demo URL built from the business and product slugs. The domain itself is not configured yet. In this demo the page opens at {productLocalPath(business, latest)}.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!pendingUnit}
        onClose={() => setPendingUnit(null)}
        title={`Switch to ${pendingUnit === 'in' ? 'inches' : 'centimetres'}?`}
        description={`The dimensions are ${dimsText(form.dims, unit)}. Convert them, or keep the numbers if they were already measured in ${pendingUnit === 'in' ? 'inches' : 'centimetres'}.`}
        size="sm"
        footer={
          <>
            <Button onClick={() => applyUnit(false)}>Keep the numbers</Button>
            <Button variant="primary" onClick={() => applyUnit(true)} data-autofocus>
              Convert to {pendingUnit ? dimsText(convertDims(form.dims, unit, pendingUnit, dimsBefore), pendingUnit) : ''}
            </Button>
          </>
        }
      />

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="You have unsaved changes to this product. They will be lost if you leave."
        size="sm"
        footer={
          <>
            <Button onClick={() => blocker.reset?.()} data-autofocus>
              Stay on page
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Leave page
            </Button>
          </>
        }
      />
    </>
  )
}

function Section({ id, title, description, children, error }: { id: string; title: string; description?: string; children: ReactNode; error?: string }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </Card>
  )
}
