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
  // Creating a live business needs businesses.status (R-W3-3; the database refuses it too); otherwise only a draft.
  const can = useCan()
  const canCreateActive = can('businesses.status')
  const [data, setData] = useState<BusinessInput>(() => toInput(business))
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(toInput(business)))
  const [slugTouched, setSlugTouched] = useState(mode !== 'create')
  const [errors, setErrors] = useState<Record<string, string>>({})
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
      toast.error(business ? 'Could not save changes' : 'Could not create business', 'Please fix the highlighted fields.')
      return
    }
    const patch = business ? changedBusinessFields(payload, JSON.parse(snapshot) as BusinessInput, mode === 'owner' ? OWNER_FIELDS : undefined) : null
    if (business && patch?.slug !== undefined && patch.slug !== business.slug) {
      const ok = await confirm({
        title: 'Change the catalog address?',
        body: (
          <>
            <p>
              The catalog moves from <strong className="font-medium text-ink break-all">{catalogPublicUrl(business)}</strong> to{' '}
              <strong className="font-medium text-ink break-all">{catalogPublicUrl({ slug: patch.slug })}</strong>.
            </p>
            <p className="mt-2">Printed QR codes and shared links to the old address will stop working. You will need to print new QR codes.</p>
          </>
        ),
        confirmLabel: 'Change address',
        destructive: true,
      })
      if (!ok) return
    }
    setBusy(intent)
    const res = business && patch ? await service.updateBusiness(business.id, patch) : await service.createBusiness(payload)
    setBusy(null)
    if (!res.ok) {
      setErrors(res.error.fieldErrors ?? {})
      toast.error(business ? 'Could not save changes' : 'Could not create business', res.error.message)
      return
    }
    setErrors({})
    setSnapshot(JSON.stringify(toInput(res.data)))
    setData(toInput(res.data))
    if (!business) {
      toast.success(
        intent === 'draft' ? 'Business saved as draft' : 'Business created',
        PUBLIC_URLS_ARE_LIVE ? `Catalog address: ${catalogPublicUrl(res.data)}` : 'Demo address only: a real subdomain and SSL certificate need deployment setup.',
      )
      skipBlock.current = true
    } else toast.success('Changes saved')
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
          <CardHeader title="Business profile" />
          <div className="space-y-5 px-6 pb-6">
            <FormField label="Business name" required error={errors.name}>
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
            <FormField label="Logo">
              <LogoUpload value={data.logoUrl} onChange={(logoUrl) => set({ logoUrl })} name={data.name} businessId={business?.id} />
            </FormField>
            <FormField label="Description" hint="Shown at the top of the public catalog." error={errors.description}>
              <Textarea value={data.description} maxLength={BUSINESS_LIMITS.description} rows={3} onChange={(e) => set({ description: e.target.value })} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact" description="Shown to customers when a product has no call-to-action link." />
          <div className="grid gap-5 px-6 pb-6 sm:grid-cols-2">
            <FormField label="Email" optional error={errors['contact.email']}>
              <Input type="email" autoComplete="email" maxLength={BUSINESS_LIMITS.email} value={data.contact.email ?? ''} onChange={(e) => setContact({ email: e.target.value })} />
            </FormField>
            <FormField label="Phone" optional error={errors['contact.phone']}>
              <Input type="tel" autoComplete="tel" maxLength={BUSINESS_LIMITS.phone} value={data.contact.phone ?? ''} onChange={(e) => setContact({ phone: e.target.value })} />
            </FormField>
            <FormField label="Website" optional error={errors['contact.website']}>
              <Input type="url" placeholder="https://" value={data.contact.website ?? ''} onChange={(e) => setContact({ website: e.target.value })} />
            </FormField>
            <FormField label="Address" optional error={errors['contact.address']}>
              <Input autoComplete="street-address" maxLength={BUSINESS_LIMITS.address} value={data.contact.address ?? ''} onChange={(e) => setContact({ address: e.target.value })} />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardHeader title="Catalog" />
          <div className="space-y-5 px-6 pb-6">
            {isOwner ? (
              <div>
                <p className="text-ui-body font-medium">Catalog address</p>
                <p className="mt-1.5 flex min-h-10 items-center rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-ui-body" title={catalogPublicUrl(data)}>
                  <span className="min-w-0 truncate">{catalogPublicUrl(data)}</span>
                </p>
                <InlineNotice className="mt-3" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
                  Changing your catalog address requires platform support. Editing your profile does not change the address.
                </InlineNotice>
              </div>
            ) : (
              <>
                <FormField
                  label={PUBLIC_URL_MODE === 'path' ? 'Catalog address' : 'Catalog address (subdomain)'}
                  required
                  error={errors.slug}
                  hint={
                    mode === 'edit'
                      ? `Changing this breaks printed QR codes and shared links.${PUBLIC_URLS_ARE_LIVE ? '' : ' Demo only: no DNS or SSL is configured.'}`
                      : PUBLIC_URLS_ARE_LIVE
                        ? `Catalog URL: ${catalogPublicUrl(previewBusiness)}`
                        : `Demo URL: ${catalogPublicUrl(previewBusiness)}. No DNS or SSL is configured in this demo.`
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
                    <FormField label="Catalog status" hint="Inactive catalogs are hidden from customers.">
                      <Select value={data.status} onChange={(e) => set({ status: e.target.value as BusinessStatus })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="draft">Draft</option>
                      </Select>
                    </FormField>
                  )}
                  <FormField label="Default currency" hint="Used for new products.">
                    <Select value={data.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value as Currency })}>
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <fieldset>
                  <legend className="text-ui-body font-medium">Catalog accent colour</legend>
                  <p className="mt-1 text-ui-small text-ink-muted">Used for buttons and links on the public catalog.</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Accent ${c}`}
                        aria-pressed={data.branding.accentColor.toLowerCase() === c.toLowerCase()}
                        onClick={() => set({ branding: { accentColor: c } })}
                        className="size-8 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ink"
                        style={{ background: c }}
                      />
                    ))}
                    <label className="ml-1 inline-flex items-center gap-2 text-ui-small text-ink-muted">
                      Custom
                      <input type="color" value={data.branding.accentColor} onChange={(e) => set({ branding: { accentColor: e.target.value.toUpperCase() } })} className="size-8 cursor-pointer rounded border border-line-strong bg-surface p-0.5" />
                    </label>
                  </div>
                  {errors['branding.accentColor'] && <p className="mt-1 text-ui-small font-medium text-danger">{errors['branding.accentColor']}</p>}
                </fieldset>
              </>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          {business ? (
            <Button type="submit" variant="primary" loading={busy === 'save'} disabled={!!busy || !dirty} icon={<Save className="size-4" aria-hidden />}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant={canCreateActive ? 'secondary' : 'primary'} onClick={() => void submit('draft')} loading={busy === 'draft'} disabled={!!busy}>
                Save as draft
              </Button>
              {canCreateActive && (
                <Button type="submit" variant="primary" loading={busy === 'create'} disabled={!!busy}>
                  Create business
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
        title="Leave without saving?"
        description="Your changes to this business have not been saved."
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
    </form>
  )
}
