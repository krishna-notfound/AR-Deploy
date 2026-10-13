import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { auth } from '@/services'

/**
 * Onboarding step 1 of 2: the name shown in the dashboard. Saved in the account's own Auth metadata,
 * so it survives refreshes and new devices; it grants no permissions. Optional: "Skip" is remembered too.
 * Saving fires the auth listener, which reloads the account and moves the login page on to step 2.
 */
export function DisplayNameStep() {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'save' | 'skip' | null>(null)

  if (!auth) return null
  const authService = auth

  const save = async (value: string | null) => {
    setPending(value === null ? 'skip' : 'save')
    const res = await authService.updateDisplayName(value)
    setPending(null)
    setError(res.ok ? null : res.error.message)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Enter your name, or skip this step.')
    void save(name)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Step 1 of 2</p>
      <h2 className="text-base font-medium">What should we call you?</h2>
      {error && (
        <InlineNotice tone="warning">
          <span role="alert">{error}</span>
        </InlineNotice>
      )}
      <FormField label="Your name" hint="Shown in your dashboard. You can skip this.">
        <Input autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="flex gap-3">
        <Button type="submit" variant="primary" className="flex-1" loading={pending === 'save'} disabled={pending !== null}>
          Continue
        </Button>
        <Button type="button" loading={pending === 'skip'} disabled={pending !== null} onClick={() => void save(null)}>
          Skip
        </Button>
      </div>
    </form>
  )
}
