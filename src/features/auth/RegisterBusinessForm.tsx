import { Store } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { isValidSlug, slugify } from '@/lib/slug'
import { catalogPublicUrl } from '@/lib/urls'
import { auth } from '@/services'

/**
 * Registers a NEW business for the signed-in account. The database makes it a draft that only a platform
 * admin can activate (register_business), so nothing here is a security boundary.
 * On success the account reloads with its new role and the login page forwards to the dashboard.
 */
export function RegisterBusinessForm() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const address = slugEdited ? slug : slugify(name)

  if (!auth) return null
  const authService = auth

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Enter your business name.')
    if (!isValidSlug(address)) return setSlugError('Use lowercase letters, numbers and single hyphens.')
    setPending(true)
    const res = await authService.registerBusiness(name.trim(), address)
    setPending(false)
    if (res.ok) return
    setSlugError(res.error.fieldErrors?.slug ?? null)
    setError(res.error.fieldErrors?.slug ? null : res.error.message)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h2 className="text-base font-medium">Register a new business</h2>
      <p className="text-sm text-ink-muted">It stays private until the platform team approves it. You can add products in the meantime.</p>
      {error && (
        <InlineNotice tone="warning">
          <span role="alert">{error}</span>
        </InlineNotice>
      )}
      <FormField label="Business name">
        <Input autoComplete="organization" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Catalog address" hint={address ? catalogPublicUrl({ slug: address }) : 'Lowercase letters, numbers and hyphens.'} error={slugError ?? undefined}>
        <Input
          autoComplete="off"
          maxLength={63}
          value={address}
          onChange={(e) => {
            setSlugEdited(true)
            setSlugError(null)
            setSlug(e.target.value.toLowerCase())
          }}
        />
      </FormField>
      <Button type="submit" variant="primary" className="w-full" loading={pending} icon={<Store className="size-4" aria-hidden />} disabled={!name.trim()}>
        Register business
      </Button>
    </form>
  )
}
