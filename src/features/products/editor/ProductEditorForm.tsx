import { useCan } from '@/auth/usePermission'
import { AlertCircle, ExternalLink, EyeOff, Trash2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useLocation, useNavigate } from 'react-router'
import { type Crumb, PageHeader } from '@/components/layout/PageHeader'
import { ProductStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { Skeleton } from '@/components/ui/Skeleton'
import { FormField, Input, InputAddon, Select } from '@/components/ui/Form'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import { OPEN_REQUEST_STATUSES } from '@/domain/modelRequests'
import { type Business, CATEGORIES, CURRENCIES, type Category, type Currency, type Product, type ProductStatus } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText, fieldTexts } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { PRODUCT_SLUG_MAX, slugInput, slugify } from '@/lib/slug'
import { PUBLIC_URLS_ARE_LIVE, modelRequestAdminPath, needsPreview, productLocalPath, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import { MEDIA_REFRESH_MS, type ServiceError } from '@/services/catalogService'
import { useRefreshWhenStale } from '@/services/hooks'
import { validateForPublish } from '@/services/validation'
import { primaryImage } from '@/lib/product'
import { useModelRequests } from '@/features/modelRequests/hooks'
import { modelRequestStatusLabel } from '@/features/modelRequests/ModelRequestStatusBadge'
import { type EditorScope, editPath, useProductActions } from '../useProductActions'
import { type EditorForm, convertDims, emptyForm, formFromProduct, toInput, withFreshModelUrls, withStoredModels } from './formModel'
import { LocalizedField } from './LocalizedField'
import { ModelFilesReadOnly } from './ModelFilesReadOnly'
import { ModelRequestPanel } from './ModelRequestPanel'
import { ModelSection } from './ModelSection'
import { Segmented } from './Segmented'
import { VariantsEditor } from './VariantsEditor'

const SECTIONS = [
  { id: 'basics', labelKey: 'products.editor.sections.basics' },
  { id: 'images', labelKey: 'products.editor.sections.images' },
  { id: 'models', labelKey: 'products.editor.sections.models' },
  { id: 'specs', labelKey: 'products.editor.sections.specs' },
  { id: 'cta', labelKey: 'products.editor.sections.cta' },
] as const satisfies readonly { id: string; labelKey: TranslationKey }[]

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
  'cta.label': 'cta',
}

type Errors = Record<string, string>
type T = (key: TranslationKey, vars?: Vars) => string
/** Router state handed to the edit route after a new product's first save. */
type NavState = { justPublished?: boolean; publishErrors?: Errors } | null

const DIMS = ['width', 'height', 'depth'] as const

/** The form value behind an error key, to tell which flagged fields the user has changed. */
function fieldValue(f: EditorForm, key: string): string {
  if (key === 'price') return f.priceText
  if (key === 'weight') return `${f.weightText} ${f.input.weight?.unit ?? ''}`
  if (key === 'name.en') return f.input.name.en
  if (key === 'cta.url') return f.input.cta.url ?? ''
  if (key === 'cta.label') return f.input.cta.label.en
  if (key.startsWith('dimensions.')) return f.dims[key.slice(11) as (typeof DIMS)[number]] ?? ''
  if (key === 'images') return JSON.stringify(f.input.images.filter((i) => i.kind === 'gallery').map((i) => i.id))
  if (key === 'variants') return JSON.stringify(f.input.variants)
  if (key === 'businessId' || key === 'slug') return f.input[key]
  return ''
}

/** Every client-side rule in one pass: `errors` block saving, `publish` only block publishing. */
function checkForm(f: EditorForm, t: T) {
  const { input, errors } = toInput(f, t)
  if (!input.businessId) errors.businessId = t('common.validation.product.businessRequired')
  if (!input.name.en) errors['name.en'] = t('common.validation.product.nameRequired')
  if (!input.slug) errors.slug = t('common.validation.product.slugRequired')
  const publish: Errors = {}
  for (const [k, m] of Object.entries(validateForPublish(input as Product))) if (!errors[k]) publish[k] = t(m.key, m.vars)
  return { input, errors, publish }
}

const hasModels = (m: Product['models'] | undefined) => !!m?.glb || !!m?.usdz

/** Identical messages (the three dimensions) count and show once. */
const issueCount = (e: Errors) => new Set(Object.values(e)).size

/** Below the sticky top bar (56px) plus a 24px gap: the section-index offset and the sections' scroll margin. */
const STICKY_TOP = 80

type SectionId = (typeof SECTIONS)[number]['id']

/**
 * The section being read: the last one whose top has passed the sticky offset, or the last one at the page end.
 * A section picked in the index stays marked until the user scrolls by hand, so a short last section never
 * steals the mark from the one that was clicked.
 */
function useActiveSection(): [SectionId, (id: SectionId) => void] {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id)
  const picked = useRef<SectionId | null>(null)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      if (picked.current) return setActive(picked.current)
      let current: SectionId = SECTIONS[0].id
      for (const s of SECTIONS) {
        const box = document.getElementById(s.id)?.getBoundingClientRect()
        if (box && box.height > 0 && box.top <= STICKY_TOP + 40) current = s.id
      }
      const doc = document.documentElement
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) current = SECTIONS[SECTIONS.length - 1]!.id
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const release = () => {
      picked.current = null
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    window.addEventListener('wheel', release, { passive: true })
    window.addEventListener('touchmove', release, { passive: true })
    window.addEventListener('keydown', release)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('wheel', release)
      window.removeEventListener('touchmove', release)
      window.removeEventListener('keydown', release)
    }
  }, [])
  const pick = (id: SectionId) => {
    picked.current = id
    setActive(id)
  }
  return [active, pick]
}

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
  const { t, tn } = useI18n()
  /** A refused save or publish as text next to the fields; without field errors, the translated sentence for the error (never the service's English message). */
  const failureErrors = (error: ServiceError): Errors => (error.fieldErrors ? fieldTexts(error.fieldErrors, t) : { _: errorText(error, t) })
  const actions = useProductActions(scope)
  // Business owners manage their own products; platform users see what their role allows (ADR-0029).
  const can = useCan()
  const allowed = (need: 'products.publish' | 'products.delete') => scope === 'business' || can(need)
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
  const [activeSection, pickSection] = useActiveSection()
  const chipsRef = useRef<HTMLUListElement>(null)

  // Phones: keep the active chip in view. The row scrolls sideways inside itself; the page never scrolls, because
  // the chip row is usually off-screen while the user reads further down.
  useEffect(() => {
    const row = chipsRef.current
    if (!row || row.scrollWidth <= row.clientWidth || window.matchMedia?.('(min-width: 1024px)').matches) return
    const chip = row.querySelector<HTMLElement>('[aria-current="location"]')?.parentElement
    if (!chip) return
    const pad = 16
    const left = chip.offsetLeft - row.offsetLeft
    if (left - pad < row.scrollLeft) row.scrollTo?.({ left: left - pad, behavior: 'smooth' })
    else if (left + chip.offsetWidth + pad > row.scrollLeft + row.clientWidth) row.scrollTo?.({ left: left + chip.offsetWidth + pad - row.clientWidth, behavior: 'smooth' })
  }, [activeSection])

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
  // S4 R-S4-4: a business owner uploads 3D files only when the business's switch allows it; otherwise the Sanctus
  // team manages them and every save keeps the stored ones. Staff always get the upload controls.
  const ownerUploadsOff = scope === 'business' && business?.allowOwnModels !== true
  const ownerChoice = scope === 'business' && business?.allowOwnModels === true
  const [modelChoice, setModelChoice] = useState<'request' | 'upload'>(() =>
    product && (hasModels(product.models) || product.variants.some((v) => hasModels(v.models))) ? 'upload' : 'request',
  )
  /** The last save was refused because the Sanctus team changed the 3D files meanwhile (R-S4-17). */
  const [staleModels, setStaleModels] = useState(false)
  const [reloading, setReloading] = useState(false)

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
      const now = checkForm(form, t)
      const next = { ...current }
      for (const k of changed) {
        const msg = now.errors[k] ?? (now.publish[k] === current[k] ? now.publish[k] : undefined)
        if (msg) next[k] = msg
        else delete next[k]
      }
      return next
    })
  }, [form, t])

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
    const { input, errors: local } = checkForm(form, t)
    if (Object.keys(local).length) {
      showErrors(local)
      return null
    }
    // The models_changed_at this editor loaded (R-S4-17), sent even when unset, and keepModels when own uploads are off.
    const payload = { ...input, modelsChangedAt: latest?.modelsChangedAt, ...(ownerUploadsOff ? { keepModels: true } : {}) }
    const res = product ? await service.updateProduct(product.id, payload) : await service.createProduct(payload)
    if (!res.ok) {
      setStaleModels(res.error.reason === 'models_changed_elsewhere')
      showErrors(failureErrors(res.error))
      toast.error(t('products.editor.saveFailed'), errorText(res.error, t))
      return null
    }
    setErrors({})
    setStaleModels(false)
    setSnapshot(JSON.stringify(form))
    setLatest(res.data)
    return res.data
  }

  /**
   * Loads the stored product into the editor again (after a delivery, or a save refused as stale). Unsaved edits are
   * kept: a dirty form only takes the stored 3D files and their stamp, and stays unsaved.
   */
  const onReload = async () => {
    if (!latest) return
    setReloading(true)
    const res = await service.getProductById(latest.id)
    setReloading(false)
    if (!res.ok) return toast.error(t('products.editor.reloadFailed'), errorText(res.error, t))
    const stored = formFromProduct(res.data)
    setForm((current) => (JSON.stringify(current) !== snapshot ? withStoredModels(current, res.data) : stored))
    setSnapshot(JSON.stringify(stored))
    setLatest(res.data)
    setErrors({})
    setStaleModels(false)
  }

  /**
   * Fresh signed URLs for the stored 3D files (they expire after MEDIA_URL_TTL_SECONDS): taken into the form and its
   * saved snapshot alike, so the form does not turn unsaved. `latest` is left alone: it carries modelsChangedAt (R-S4-17).
   */
  const latestId = latest?.id
  const onRefreshUrls = useCallback(() => {
    if (!latestId) return
    void service.getProductById(latestId).then((res) => {
      if (!res.ok) return
      setForm((f) => withFreshModelUrls(f, res.data))
      setSnapshot((s) => JSON.stringify(withFreshModelUrls(JSON.parse(s) as EditorForm, res.data)))
    })
  }, [latestId])
  useRefreshWhenStale(onRefreshUrls, MEDIA_REFRESH_MS, latest)

  const goToEdit = (p: Product, state?: NavState) => {
    skipBlock.current = true
    navigate(editPath(scope, p), { replace: true, state })
  }

  const onSaveDraft = async () => {
    setBusy('save')
    const saved = await save()
    setBusy(null)
    if (!saved) return
    toast.success(t(isNew ? 'products.editor.draftSaved' : 'products.editor.changesSaved'), isNew ? t('products.editor.draftSavedBody') : undefined)
    if (isNew) goToEdit(saved)
  }

  /** Lists every missing requirement at once; a new product's draft keeps them across the redirect. */
  const publishBlocked = (e: Errors, saved?: Product) => {
    showErrors(e)
    const n = issueCount(e)
    toast.error(t('products.actions.publishFailed'), tn('products.editor.errors.toast', n))
    if (isNew && saved) goToEdit(saved, { publishErrors: e })
  }

  const onPublish = async () => {
    const check = checkForm(form, t)
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
    if (!res.ok) return publishBlocked(failureErrors(res.error), saved)
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
      toast.info(t('products.editor.savedBeforePreview'))
    }
    if (!target || !business) return
    window.open(productLocalPath(business, target, { preview: needsPreview({ status: currentStatus }, business) }), '_blank', 'noopener')
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

  // Inline from sm; below sm the header's More menu holds it (same handler and gate).
  const canDelete = !isNew && allowed('products.delete')
  const statusText = t(dirty ? 'products.editor.unsaved' : isNew ? 'products.editor.notSavedYet' : 'products.editor.allSaved')

  return (
    // The form column stops at 792px (BRIEF section 6: a 200px index, a 32px gap, then the cards).
    <div className="lg:max-w-[1024px]">
      <PageHeader
        title={isNew ? t('business.products.add') : form.input.name.en || t('products.editor.untitled')}
        breadcrumbs={breadcrumbs}
        meta={
          <>
            <ProductStatusBadge status={isNew ? 'draft' : currentStatus} />
            {business && <span className="text-[13px] text-ink-muted">{business.name}</span>}
            {dirty && (
              <>
                <span aria-hidden className="text-[13px] text-line-strong">
                  ·
                </span>
                <span className="text-[13px] font-medium text-warning">{t('products.editor.unsaved')}</span>
              </>
            )}
          </>
        }
        more={canDelete ? [{ label: t('common.delete'), icon: <Trash2 aria-hidden />, destructive: true, disabled: !!busy, onSelect: () => void onDelete() }] : undefined}
        actions={
          canDelete && (
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={onDelete} loading={busy === 'delete'} disabled={!!busy} className="text-danger! hover:bg-danger-soft max-sm:hidden">
              {t('common.delete')}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        {/* Under lg a scrolling row of chips; from lg a 200px sticky list with a 2px ink bar on the active item. */}
        <nav aria-label={t('products.editor.sectionsNav')} className="-mx-4 min-w-0 sm:-mx-6 lg:mx-0">
          <ul ref={chipsRef} className="-my-1 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:px-6 lg:sticky lg:my-0 lg:py-0 lg:top-20 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
            {SECTIONS.map((s) => {
              const hasError = errorList.some(([k]) => FIELD_SECTION[k] === s.id)
              const active = activeSection === s.id
              return (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    onClick={() => pickSection(s.id)}
                    aria-current={active ? 'location' : undefined}
                    aria-label={hasError ? t('products.editor.sectionHasErrors', { label: t(s.labelKey) }) : undefined}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-[14px] whitespace-nowrap transition-colors max-lg:pointer-coarse:h-11',
                      'lg:h-9 lg:justify-between lg:rounded-none lg:border-0 lg:border-l-2 lg:bg-transparent lg:px-3',
                      hasError
                        ? cn('border-danger/40 text-danger', active ? 'bg-danger-soft font-medium lg:border-danger' : 'bg-surface lg:border-transparent')
                        : active
                          ? 'border-ink bg-ink font-medium text-chalk lg:text-ink'
                          : 'border-line bg-surface text-ink-muted hover:text-ink lg:border-transparent',
                    )}
                  >
                    {t(s.labelKey)}
                    {hasError && <AlertCircle className="size-4 shrink-0" aria-hidden />}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6 pb-16">
          {errorList.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="flex gap-3 rounded-[var(--radius-card)] border border-danger/40 bg-danger-soft p-4 outline-none focus-visible:outline-2 focus-visible:outline-danger sm:px-6">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-danger">{tn('products.editor.errors.title', issues.length)}</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-[1.45] text-danger">
                  {issues.map(([msg, k]) => (
                    <li key={k}>{FIELD_SECTION[k] ? <a href={`#${FIELD_SECTION[k]}`} className="underline underline-offset-2">{msg}</a> : msg}</li>
                  ))}
                </ul>
                {staleModels && latest && (
                  <Button size="sm" className="mt-3" onClick={onReload} loading={reloading}>
                    {t('products.editor.reload')}
                  </Button>
                )}
              </div>
            </div>
          )}

          <Section id="basics" title={t('products.editor.sections.basics')}>
            {scope === 'admin' && (
              <FormField
                label={t('products.table.business')}
                required
                error={err('businessId')}
                hint={
                  !isNew
                    ? t('products.editor.businessHintExisting')
                    : hasStoredUploads
                      ? t('products.editor.businessHintUploads')
                      : t('products.editor.businessHintNew')
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
                  <option value="">{t('products.editor.chooseBusiness')}</option>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <LocalizedField
              label={t('products.editor.name')}
              required
              maxLength={100}
              value={form.input.name}
              error={err('name.en')}
              onChange={(name) =>
                setForm((f) => ({ ...f, input: { ...f.input, name, slug: f.slugTouched ? f.input.slug : slugify(name.en) } }))
              }
            />
            <FormField
              label={t('products.editor.url')}
              required
              error={err('slug')}
              hint={
                business
                  ? t(PUBLIC_URLS_ARE_LIVE ? 'products.editor.urlHint' : 'products.editor.urlHintDemo', { url: productPublicUrl(business, { slug: form.input.slug || 'product-name' }) })
                  : t('products.editor.urlHintNoBusiness')
              }
            >
              <InputAddon addon="/products/">
                <Input maxLength={PRODUCT_SLUG_MAX} value={form.input.slug} onChange={(e) => setForm((f) => ({ ...f, slugTouched: true, input: { ...f.input, slug: slugInput(e.target.value) } }))} />
              </InputAddon>
            </FormField>
            <LocalizedField label={t('products.editor.shortDescription')} value={form.input.shortDescription} onChange={(shortDescription) => setInput({ shortDescription })} maxLength={160} hint={t('products.editor.shortDescriptionHint')} />
            <LocalizedField label={t('products.editor.fullDescription')} multiline rows={5} value={form.input.description} onChange={(description) => setInput({ description })} />
            {/* Below sm: Category on its own row, then Price and a 96px Currency side by side. */}
            <div className="grid grid-cols-[1fr_96px] gap-4 sm:grid-cols-[2fr_1fr_1fr] [&>*:first-child]:max-sm:col-span-2">
              <FormField label={t('products.filters.category')}>
                <Select value={form.input.category} onChange={(e) => setInput({ category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`products.category.${c}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('products.table.price')} error={err('price')} hint={t('products.editor.priceHint')}>
                <Input inputMode="decimal" placeholder="0.00" className="tabular-nums" value={form.priceText} onChange={(e) => setForm((f) => ({ ...f, priceText: e.target.value }))} />
              </FormField>
              <FormField label={t('products.editor.currency')}>
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

          <Section id="images" title={t('products.editor.sections.images')} description={t('products.editor.imagesDescription')} error={err('images')}>
            <ImageUpload label={t('products.editor.uploadImages')} kind="gallery" businessId={form.input.businessId} images={form.input.images} onChange={updateImages} />
            <div className="border-t border-line pt-6">
              <h3 className="text-[14px] leading-5 font-semibold text-ink">{t('products.editor.additionalPhotos')}</h3>
              <p className="mt-0.5 mb-3 text-[13px] leading-[1.45] text-ink-muted">{t('products.editor.additionalPhotosHint')}</p>
              <ImageUpload label={t('products.editor.uploadAdditional')} kind="additional" businessId={form.input.businessId} allowPrimary={false} images={form.input.images} onChange={updateImages} />
            </div>
          </Section>

          <Section id="models" title={t('products.editor.sections.models')} description={t('products.editor.modelsDescription')}>
            {scope === 'admin' && latest && can('models.manage') && <OpenModelRequests productId={latest.id} />}
            {ownerChoice && (
              <Segmented
                kind="radio"
                fill
                label={t('products.editor.modelChoice')}
                value={modelChoice}
                onChange={setModelChoice}
                options={[
                  { value: 'request', label: t('products.editor.modelChoiceRequest') },
                  { value: 'upload', label: t('products.editor.modelChoiceUpload') },
                ]}
              />
            )}
            {ownerUploadsOff &&
              (hasModels(form.input.models) ? (
                <ModelFilesReadOnly models={form.input.models} label={t('products.editor.theProduct')} />
              ) : (
                <p className="text-[13px] leading-[1.45] text-ink-body">{t('products.editor.modelsByTeam')}</p>
              ))}
            {(ownerUploadsOff || (ownerChoice && modelChoice === 'request')) && (
              <ModelRequestPanel
                product={latest ?? undefined}
                formDimensions={toInput(form).input.dimensions}
                saving={busy === 'save'}
                onSaveDraft={() => void onSaveDraft()}
                onReload={() => void onReload()}
              />
            )}
            {(scope === 'admin' || (ownerChoice && modelChoice === 'upload')) && (
              <ModelSection
                businessId={form.input.businessId}
                models={form.input.models}
                onChange={(format, asset) => setForm((f) => ({ ...f, input: { ...f.input, models: { ...f.input.models, [format]: asset } } }))}
                dimensions={toInput(form).input.dimensions}
                poster={poster}
                name={form.input.name.en || 'product'}
                onRefreshUrls={latest ? onRefreshUrls : undefined}
              />
            )}
          </Section>

          <Section id="specs" title={t('products.editor.specsTitle')} description={t('products.editor.specsDescription')}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[14px] font-medium text-ink">{t('products.editor.measuredIn')}</span>
              <Segmented
                kind="radio"
                label={t('products.editor.dimensionUnit')}
                value={unit}
                onChange={onUnit}
                options={[
                  { value: 'cm', label: t('products.editor.centimetres') },
                  { value: 'in', label: t('products.editor.inches') },
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
                    <FormField key={k} label={t(`products.editor.dim.${k}`)} error={shared ? undefined : e} className="w-[calc(50%-0.5rem)] sm:w-32">
                      <InputAddon side="right" addon={unit}>
                        <Input
                          inputMode="decimal"
                          className="tabular-nums"
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
                <p id={dimErrId} className="mt-2 flex items-start gap-1.5 text-[13px] leading-[1.45] text-danger">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {dimError}
                </p>
              )}
            </div>
            {/* The weight label row has no EN/PT switch, so it drops 4px to line its input up with the material's. */}
            <div className="grid items-start gap-4 sm:grid-cols-[2fr_1fr] [&>*:last-child]:sm:pt-1">
              <LocalizedField label={t('products.editor.material')} value={form.input.material} onChange={(material) => setInput({ material })} placeholder={t('products.editor.materialPlaceholder')} />
              <FormField label={t('products.editor.weight')} optional error={err('weight')}>
                <div className="flex gap-2">
                  <Input inputMode="decimal" className="tabular-nums" value={form.weightText} onChange={(e) => setForm((f) => ({ ...f, weightText: e.target.value }))} />
                  <Select
                    aria-label={t('products.editor.weightUnit')}
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
            <div className="border-t border-line pt-5">
              <VariantsEditor
                error={err('variants')}
                variants={form.input.variants}
                onChange={(update) => setForm((f) => ({ ...f, input: { ...f.input, variants: update(f.input.variants) } }))}
                currency={form.input.currency}
                businessId={form.input.businessId}
                dimensions={toInput(form).input.dimensions}
                poster={poster}
                modelsReadOnly={ownerUploadsOff}
                onRefreshUrls={latest ? onRefreshUrls : undefined}
              />
            </div>
          </Section>

          <Section id="cta" title={t('products.editor.sections.cta')} description={t('products.editor.ctaDescription')}>
            <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 [&>*:last-child]:sm:pt-1">
              <LocalizedField label={t('products.editor.ctaLabel')} value={form.input.cta.label} onChange={(label) => setInput({ cta: { ...form.input.cta, label } })} maxLength={40} error={err('cta.label')} />
              <FormField label={t('products.editor.ctaLink')} optional error={err('cta.url')} hint={t('products.editor.ctaLinkHint')}>
                <Input type="url" placeholder="https://" value={form.input.cta.url ?? ''} onChange={(e) => setInput({ cta: { ...form.input.cta, url: e.target.value } })} />
              </FormField>
            </div>
          </Section>
        </div>
      </div>

      {/* Sticky publishing bar (BRIEF section 6): 64px from sm; on phones the status sits above three equal buttons. */}
      <section aria-label={t('products.editor.saveBar')} className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:left-[var(--sidebar-w,0)]">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2.5 px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-0 lg:px-10">
          <p className="flex min-w-0 items-center gap-2.5 text-[13px] text-ink-muted">
            <ProductStatusBadge status={isNew ? 'draft' : currentStatus} />
            <span aria-live="polite" className={cn(dirty && 'max-sm:font-medium max-sm:text-warning')}>
              {statusText}
            </span>
          </p>
          <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:items-center sm:gap-3">
            <Button onClick={onPreview} loading={busy === 'preview'} disabled={!!busy || !business} className="max-sm:px-2">
              {t('products.editor.preview')}
              {busy !== 'preview' && <ExternalLink className="size-4" aria-hidden />}
            </Button>
            <Button onClick={onSaveDraft} loading={busy === 'save'} disabled={!!busy || (!dirty && !isNew)} className="max-sm:px-2">
              {t(currentStatus === 'published' && !isNew ? 'products.editor.saveChanges' : 'products.editor.saveDraft')}
            </Button>
            {!allowed('products.publish') ? null : currentStatus === 'published' && !isNew ? (
              <Button variant="secondary" onClick={onUnpublish} loading={busy === 'unpublish'} disabled={!!busy} icon={<EyeOff className="size-4" aria-hidden />} className="max-sm:px-2">
                {t('products.actions.unpublish')}
              </Button>
            ) : (
              <Button variant="primary" onClick={onPublish} loading={busy === 'publish'} disabled={!!busy} className="max-sm:px-2 sm:px-5">
                {t('products.menu.publish')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <Modal
        open={publishedOpen && !!latest && !!business}
        onClose={() => setPublishedOpen(false)}
        title={t('products.editor.publishedTitle')}
        description={t(business?.status === 'active' ? 'products.editor.publishedActive' : 'products.actions.publishedInactive')}
        footer={
          <>
            <Button onClick={() => setPublishedOpen(false)}>{t('products.editor.keepEditing')}</Button>
            {latest && business && (
              <Button variant="primary" icon={<ExternalLink className="size-4" aria-hidden />} onClick={() => window.open(productLocalPath(business, latest, { preview: needsPreview(latest, business) }), '_blank', 'noopener')}>
                {t('products.menu.open')}
              </Button>
            )}
          </>
        }
      >
        {latest && business && (
          <div>
            <p className="text-[13px] font-medium">{t('products.qr.url')}</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[13px]">{productPublicUrl(business, latest)}</code>
              <CopyButton text={productPublicUrl(business, latest)} label={t('products.editor.copy')} toastTitle={t('products.actions.urlCopied')} />
            </div>
            {!PUBLIC_URLS_ARE_LIVE && (
              <p className="mt-2 text-xs text-ink-muted">
                {t('products.editor.demoUrlNote', { path: productLocalPath(business, latest) })}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!pendingUnit}
        onClose={() => setPendingUnit(null)}
        title={t(pendingUnit === 'in' ? 'products.editor.switchToInches' : 'products.editor.switchToCm')}
        description={t(pendingUnit === 'in' ? 'products.editor.switchBodyInches' : 'products.editor.switchBodyCm', { dims: dimsText(form.dims, unit) })}
        size="sm"
        footer={
          <>
            <Button onClick={() => applyUnit(false)}>{t('products.editor.keepNumbers')}</Button>
            <Button variant="primary" onClick={() => applyUnit(true)} data-autofocus>
              {t('products.editor.convertTo')} {pendingUnit ? dimsText(convertDims(form.dims, unit, pendingUnit, dimsBefore), pendingUnit) : ''}
            </Button>
          </>
        }
      />

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title={t('products.editor.leaveTitle')}
        description={t('products.editor.leaveBody')}
        size="sm"
        footer={
          <>
            <Button onClick={() => blocker.reset?.()} data-autofocus>
              {t('products.editor.stay')}
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              {t('products.editor.leave')}
            </Button>
          </>
        }
      />
    </div>
  )
}

/** Staff: the product's open 3D model requests, each linked to its page (S4 R-S4-4, with models.manage). */
function OpenModelRequests({ productId }: { productId: string }) {
  const { t } = useI18n()
  const q = useModelRequests({ productId, status: [...OPEN_REQUEST_STATUSES] })
  if (q.status === 'loading') return <Skeleton className="h-5 w-56" />
  if (q.status === 'error')
    return (
      <p className="flex flex-wrap items-center gap-2 text-[13px] leading-[1.45] text-danger">
        {t('business.modelRequests.loadError')}
        <Button size="sm" variant="ghost" onClick={q.refetch}>
          {t('business.modelRequests.photo.retry')}
        </Button>
      </p>
    )
  if (!q.data.items.length) return null
  return (
    <ul className="space-y-1">
      {q.data.items.map((r) => (
        <li key={r.id} className="text-[13px] leading-[1.45] text-ink-body">
          <Link to={modelRequestAdminPath(r.id)} className="font-medium text-ink underline underline-offset-2">
            {t('products.editor.openRequest', { status: modelRequestStatusLabel(r.status, t) })}
          </Link>
          {r.variantName && <span className="text-ink-muted"> · {r.variantName.en}</span>}
        </li>
      ))}
    </ul>
  )
}

function Section({ id, title, description, children, error }: { id: string; title: string; description?: string; children: ReactNode; error?: string }) {
  // A flat card: Inter 16/600 title, one muted line, 24px padding and 20px between fields (BRIEF section 6).
  return (
    <Card id={id} aria-labelledby={`${id}-title`} role="region" className="scroll-mt-20 p-4 sm:p-6">
      <div className="mb-5">
        <h2 id={`${id}-title`} className="text-[length:var(--text-ui-card)] leading-[1.4] font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-muted">{description}</p>}
        {error && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-[1.45] text-danger">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  )
}
