import { Info, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, InputAddon, Select, Textarea } from '@/components/ui/Form'
import { LogoUpload } from '@/components/ui/LogoUpload'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { type Business, type BusinessStatus, CURRENCIES, type Currency } from '@/domain/types'
import { errorText, fieldText } from '@/i18n/errorText'
import type { FieldError } from '@/i18n/fieldMessage'
import { useI18n } from '@/i18n/LanguageProvider'
import { slugInput, slugify } from '@/lib/slug'
import { BUSINESS_SLUG_MAX } from '@/lib/slug'
import { PUBLIC_URLS_ARE_LIVE, PUBLIC_URL_MODE, ROOT_DOMAIN, catalogPublicUrl } from '@/lib/urls'
import { service } from '@/services'
import type { BusinessInput } from '@/services/catalogService'
import { BUSINESS_LIMITS, validateBusiness } from '@/services/validation'
import { BusinessIdentityPreview } from './BusinessIdentityPreview'

export type BusinessFormMode = 'create' | 'edit' | 'owner'

const ACCENTS = ['#B4441A', '#36564A', '#7A5C45', '#2F5D62', '#4F6B3A', '#5A4636', '#3F4E6B', '#7A3E48']

function toInput(b: Business | null): BusinessInput {
  return b
    ? { name: b.name, slug: b.slug, logoUrl: b.logoUrl, description: b.description, contact: { ...b.contact }, status: b.status, branding: { ...b.branding }, defaultCurrency: b.defaultCurrency }
    : { name: '', slug: '', logoUrl: undefined, description: '', contact: {}, status: 'draft', branding: { accentColor: ACCENTS[0]! }, defaultCurrency: 'EUR' }
}

const OWNER_FIELDS: (keyof BusinessInput)[] = ['name', 'logoUrl', 'description', 'contact']
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The fields of `next` that differ from `base`. Edits send only these, so a value the form never touched
 * (e.g. the status just changed from the page header) is never written back stale.
 */
export function changedBusinessFields(next: BusinessInput, base: BusinessInput, fields: (keyof BusinessInput)[] = Object.keys(next) as (keyof BusinessInput)[]): Partial<BusinessInput> {
  return Object.fromEntries(fields.filter((k) => !same(next[k], base[k])).map((k) => [k, next[k]])) as Partial<BusinessInput>
}

/**
 * Shared business profile form.
 * - create/edit: Super Admin (slug, status, branding editable)
 * - owner: Business Admin (name, logo, description, contact only; address is read-only)
 */
export function BusinessForm({ business, mode, onSaved }: { business: Business | null; mode: BusinessFormMode; onSaved?: (b: Business) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { t } = useI18n()
  // Creating a live business needs businesses.status (R-W3-3; the database refuses it too); otherwise only a draft.
  const can = useCan()
  const canCreateActive = can('businesses.status')
  const [data, setData] = useState<BusinessInput>(() => toInput(business))
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(toInput(business)))
  const [slugTouched, setSlugTouched] = useState(mode !== 'create')
  const [errors, setErrors] = useState<Record<string, FieldError>>({})
  const fx = (field: string) => fieldText(errors[field], t)
  const [busy, setBusy] = useState<null | 'draft' | 'create' | 'save'>(null)
  const skipBlock = useRef(false)
  const dirty = JSON.stringify(data) !== snapshot

  useEffect(() => {
    if (!business) return
    const next = toInput(business)
    const base = JSON.parse(snapshot) as BusinessInput
    // Keep the user's unsaved edits, but take the stored value for every field they have not touched
    // (e.g. a status change made from the page header), so the form never shows or resends a stale value.
    // Decided inside the updater, against the latest state, so a keystroke between render and effect is never lost.
    setData((d) => ({ ...d, ...changedBusinessFields(next, base, (Object.keys(next) as (keyof BusinessInput)[]).filter((k) => same(d[k], base[k]))) }))
    setSnapshot(JSON.stringify(next))
  }, [business?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const blocker = useBlocker(({ currentLocation, nextLocation }) => !skipBlock.current && dirty && currentLocation.pathname !== nextLocation.pathname)

  const set = (patch: Partial<BusinessInput>) => setData((d) => ({ ...d, ...patch }))
  const setContact = (patch: Partial<BusinessInput['contact']>) => setData((d) => ({ ...d, contact: { ...d.contact, ...patch } }))

  const submit = async (intent: 'draft' | 'create' | 'save') => {
    const payload: BusinessInput = {
      ...data,
      name: data.name.trim(),
      contact: Object.fromEntries(Object.entries(data.contact).map(([k, v]) => [k, v?.trim() || undefined])) as BusinessInput['contact'],
      status: intent === 'draft' ? 'draft' : intent === 'create' ? 'active' : data.status,
    }
    // Field limits are checked here too, so an over-long value (pasted, or stored before a limit) gets its field error
    // without a service call (R-W3-7). The slug conflict check stays with the service.
    const local = validateBusiness(payload, [])
    if (Object.keys(local).length) {
      setErrors(local)
      toast.error(t(business ? 'admin.businesses.form.saveFailed' : 'admin.businesses.form.createFailed'), t('admin.businesses.form.fixFields'))
      return
    }
    const patch = business ? changedBusinessFields(payload, JSON.parse(snapshot) as BusinessInput, mode === 'owner' ? OWNER_FIELDS : undefined) : null
    if (business && patch?.slug !== undefined && patch.slug !== business.slug) {
      const ok = await confirm({
        title: t('admin.businesses.form.changeAddressTitle'),
        body: (
          <>
            <p>
              {t('admin.businesses.form.moveFrom')} <strong className="font-medium text-ink break-all">{catalogPublicUrl(business)}</strong> {t('admin.businesses.form.moveTo')}{' '}
              <strong className="font-medium text-ink break-all">{catalogPublicUrl({ slug: patch.slug })}</strong>.
            </p>
            <p className="mt-2">{t('admin.businesses.form.moveWarning')}</p>
          </>
        ),
        confirmLabel: t('admin.businesses.form.changeAddress'),
        destructive: true,
      })
      if (!ok) return
    }
    setBusy(intent)
    const res = business && patch ? await service.updateBusiness(business.id, patch) : await service.createBusiness(payload)
    setBusy(null)
    if (!res.ok) {
      setErrors(res.error.fieldErrors ?? {})
      toast.error(t(business ? 'admin.businesses.form.saveFailed' : 'admin.businesses.form.createFailed'), errorText(res.error, t))
      return
    }
    setErrors({})
    setSnapshot(JSON.stringify(toInput(res.data)))
    setData(toInput(res.data))
    if (!business && 'logoMoveFailed' in res.data) {
      toast.info(t('admin.businesses.form.created'), t('admin.businesses.form.logoMoveFailed'))
      skipBlock.current = true
    } else if (!business) {
      toast.success(
        t(intent === 'draft' ? 'admin.businesses.form.savedDraft' : 'admin.businesses.form.created'),
        PUBLIC_URLS_ARE_LIVE ? t('admin.businesses.form.addressToast', { url: catalogPublicUrl(res.data) }) : t('admin.businesses.form.demoAddressToast'),
      )
      skipBlock.current = true
    } else toast.success(t('admin.businesses.form.changesSaved'))
    onSaved?.(res.data)
  }

  const isOwner = mode === 'owner'
  const previewBusiness = { ...data, slug: data.slug || 'your-business' }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit(business ? 'save' : canCreateActive ? 'create' : 'draft')
      }}
      noValidate
      className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader title={t('admin.businesses.form.profile')} />
          <div className="space-y-5 px-6 pb-6">
            <FormField label={t('admin.businesses.form.name')} required error={fx('name')}>
              <Input
                value={data.name}
                maxLength={BUSINESS_LIMITS.name}
                autoComplete="organization"
                onChange={(e) => {
                  const name = e.target.value
                  setData((d) => ({ ...d, name, slug: slugTouched ? d.slug : slugify(name) }))
                }}
              />
            </FormField>
            <FormField label={t('admin.businesses.form.logo')}>
              <LogoUpload value={data.logoUrl} onChange={(logoUrl) => set({ logoUrl })} name={data.name} businessId={business?.id} />
            </FormField>
            <FormField label={t('admin.businesses.form.description')} hint={t('admin.businesses.form.descriptionHint')} error={fx('description')}>
              <Textarea value={data.description} maxLength={BUSINESS_LIMITS.description} rows={3} onChange={(e) => set({ description: e.target.value })} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('admin.businesses.form.contact')} description={t('admin.businesses.form.contactHint')} />
          <div className="grid gap-5 px-6 pb-6 sm:grid-cols-2">
            <FormField label={t('common.email')} optional error={fx('contact.email')}>
              <Input type="email" autoComplete="email" maxLength={BUSINESS_LIMITS.email} value={data.contact.email ?? ''} onChange={(e) => setContact({ email: e.target.value })} />
            </FormField>
            <FormField label={t('admin.businesses.form.phone')} optional error={fx('contact.phone')}>
              <Input type="tel" autoComplete="tel" maxLength={BUSINESS_LIMITS.phone} value={data.contact.phone ?? ''} onChange={(e) => setContact({ phone: e.target.value })} />
            </FormField>
            <FormField label={t('admin.businesses.form.website')} optional error={fx('contact.website')}>
              <Input type="url" placeholder="https://" value={data.contact.website ?? ''} onChange={(e) => setContact({ website: e.target.value })} />
            </FormField>
            <FormField label={t('admin.businesses.form.address')} optional error={fx('contact.address')}>
              <Input autoComplete="street-address" maxLength={BUSINESS_LIMITS.address} value={data.contact.address ?? ''} onChange={(e) => setContact({ address: e.target.value })} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('admin.businesses.form.catalog')} />
          <div className="space-y-5 px-6 pb-6">
            {isOwner ? (
              <div>
                <p className="text-ui-body font-medium">{t('admin.businesses.form.catalogAddress')}</p>
                <p className="mt-1.5 flex min-h-10 items-center rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-ui-body" title={catalogPublicUrl(data)}>
                  <span className="min-w-0 truncate">{catalogPublicUrl(data)}</span>
                </p>
                <InlineNotice className="mt-3" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
                  {t('admin.businesses.form.ownerAddressNotice')}
                </InlineNotice>
              </div>
            ) : (
              <>
                <FormField
                  label={t(PUBLIC_URL_MODE === 'path' ? 'admin.businesses.form.catalogAddress' : 'admin.businesses.form.catalogAddressSub')}
                  required
                  error={fx('slug')}
                  hint={
                    mode === 'edit'
                      ? t(PUBLIC_URLS_ARE_LIVE ? 'admin.businesses.form.slugEditHint' : 'admin.businesses.form.slugEditHintDemo')
                      : PUBLIC_URLS_ARE_LIVE
                        ? t('admin.businesses.form.slugUrlHint', { url: catalogPublicUrl(previewBusiness) })
                        : t('admin.businesses.form.slugDemoHint', { url: catalogPublicUrl(previewBusiness) })
                  }
                >
                  <InputAddon side={PUBLIC_URL_MODE === 'path' ? 'left' : 'right'} addon={PUBLIC_URL_MODE === 'path' ? '/catalog/' : `.${ROOT_DOMAIN}`}>
                    <Input
                      value={data.slug}
                      maxLength={BUSINESS_SLUG_MAX}
                      onChange={(e) => {
                        setSlugTouched(true)
                        set({ slug: slugInput(e.target.value, BUSINESS_SLUG_MAX) })
                      }}
                    />
                  </InputAddon>
                </FormField>
                <div className="grid gap-5 sm:grid-cols-2">
                  {mode === 'edit' && can('businesses.status') && (
                    <FormField label={t('admin.businesses.form.status')} hint={t('admin.businesses.form.statusHint')}>
                      <Select value={data.status} onChange={(e) => set({ status: e.target.value as BusinessStatus })}>
                        <option value="active">{t('admin.businesses.status.active')}</option>
                        <option value="inactive">{t('admin.businesses.status.inactive')}</option>
                        <option value="draft">{t('admin.businesses.status.draft')}</option>
                      </Select>
                    </FormField>
                  )}
                  <FormField label={t('admin.businesses.form.currency')} hint={t('admin.businesses.form.currencyHint')}>
                    <Select value={data.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value as Currency })}>
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <fieldset>
                  <legend className="text-ui-body font-medium">{t('admin.businesses.form.accent')}</legend>
                  <p className="mt-1 text-ui-small text-ink-muted">{t('admin.businesses.form.accentHint')}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={t('admin.businesses.form.accentAria', { color: c })}
                        aria-pressed={data.branding.accentColor.toLowerCase() === c.toLowerCase()}
                        onClick={() => set({ branding: { accentColor: c } })}
                        className="size-8 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ink"
                        style={{ background: c }}
                      />
                    ))}
                    <label className="ml-1 inline-flex items-center gap-2 text-ui-small text-ink-muted">
                      {t('admin.businesses.form.custom')}
                      <input type="color" value={data.branding.accentColor} onChange={(e) => set({ branding: { accentColor: e.target.value.toUpperCase() } })} className="size-8 cursor-pointer rounded border border-line-strong bg-surface p-0.5" />
                    </label>
                  </div>
                  {fx('branding.accentColor') && <p className="mt-1 text-ui-small font-medium text-danger">{fx('branding.accentColor')}</p>}
                </fieldset>
              </>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          {business ? (
            <Button type="submit" variant="primary" loading={busy === 'save'} disabled={!!busy || !dirty} icon={<Save className="size-4" aria-hidden />}>
              {t('admin.businesses.form.save')}
            </Button>
          ) : (
            <>
              <Button variant={canCreateActive ? 'secondary' : 'primary'} onClick={() => void submit('draft')} loading={busy === 'draft'} disabled={!!busy}>
                {t('admin.businesses.form.saveDraft')}
              </Button>
              {canCreateActive && (
                <Button type="submit" variant="primary" loading={busy === 'create'} disabled={!!busy}>
                  {t('admin.businesses.form.create')}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
        <BusinessIdentityPreview business={previewBusiness} />
      </aside>

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title={t('admin.businesses.form.leaveTitle')}
        description={t('admin.businesses.form.leaveBody')}
        size="sm"
        footer={
          <>
            <Button onClick={() => blocker.reset?.()} data-autofocus>
              {t('admin.businesses.form.stay')}
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              {t('admin.businesses.form.leave')}
            </Button>
          </>
        }
      />
    </form>
  )
}
