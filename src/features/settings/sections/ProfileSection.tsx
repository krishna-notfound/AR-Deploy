// Profile: the person's name and photo (spec section 8). Both show in the sidebar at once (useMyProfile), and on
// Team & Access for platform staff. The photo is cropped and resized in the browser before upload (lib/image.ts).
import { Trash2, Upload } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useAccount } from '@/auth/AccountProvider'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Input } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { MB } from '@/lib/files'
import { ImageTooLargeError, squareResize } from '@/lib/image'
import { ACCOUNT_ERRORS, DISPLAY_NAME_MAX, type Profile, account, isDemoMode } from '@/services'
import { SectionHeader, SettingsCard } from '../SettingsUi'
import { useMyProfile } from '../useMyProfile'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Before resizing: the upload itself is at most 512 KB once it is 256 px square. */
const PHOTO_MAX_BYTES = 5 * MB
const NAME_ERROR = ACCOUNT_ERRORS.invalid_name?.message ?? `Use 1 to ${DISPLAY_NAME_MAX} characters for your name.`

export default function ProfileSection() {
  const { profile, error, reload, setProfile } = useMyProfile()
  return (
    <>
      <SectionHeader title="Profile" description="Your name and photo, as your team sees them." />
      {profile ? (
        <div className="space-y-6">
          {error && (
            <InlineNotice tone="warning">
              Couldn't refresh your profile: {error}{' '}
              <button type="button" className="font-medium underline underline-offset-2" onClick={reload}>
                Try again
              </button>
            </InlineNotice>
          )}
          <NameCard profile={profile} setProfile={setProfile} />
          <PhotoCard profile={profile} setProfile={setProfile} />
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : (
        <div className="space-y-6" aria-busy="true" aria-label="Loading your profile">
          {[0, 1].map((i) => (
            <Card key={i} className="space-y-4 p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full max-w-md" />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

type CardProps = { profile: Profile; setProfile: (p: Profile) => void }

function NameCard({ profile, setProfile }: CardProps) {
  const { user } = useAccount()
  const toast = useToast()
  // Supabase falls back to the email for an account with no name: never prefill that as a name.
  const [draft, setDraft] = useState(() => profile.displayName ?? (user && user.name !== user.email ? user.name : ''))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name || name.length > DISPLAY_NAME_MAX) {
      setError(NAME_ERROR)
      return
    }
    setError(null)
    setSaving(true)
    // Optimistic: the sidebar shows the new name now, and goes back if the save fails.
    setProfile({ ...profile, displayName: name })
    const r = await account.updateProfile({ displayName: name })
    setSaving(false)
    if (r.ok) {
      setProfile(r.data)
      setDraft(r.data.displayName ?? name)
      toast.success('Name saved')
    } else {
      setProfile(profile)
      setError(r.error.message)
    }
  }

  return (
    <SettingsCard title="Your name" description="Shown in the sidebar and to the people you work with.">
      <form onSubmit={save} noValidate className="flex max-w-md flex-col gap-4">
        <FormField label="Name" error={error ?? undefined} hint={`Up to ${DISPLAY_NAME_MAX} characters.`}>
          <Input
            value={draft}
            autoComplete="name"
            placeholder="Your full name"
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
          />
        </FormField>
        <div>
          <Button type="submit" variant="primary" loading={saving}>
            Save name
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}

function PhotoCard({ profile, setProfile }: CardProps) {
  const { user } = useAccount()
  const toast = useToast()
  const inputId = useId()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const name = profile.displayName || user?.name || ''

  const onFile = async (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) return setError('Choose a JPEG, PNG or WebP image.')
    if (file.size > PHOTO_MAX_BYTES) return setError('That image is larger than 5 MB. Choose a smaller one.')
    setError(null)
    setBusy('upload')
    let square: Blob
    try {
      square = await squareResize(file, 256)
    } catch (err) {
      setBusy(null)
      return setError(err instanceof ImageTooLargeError ? 'This photo is too large to process. Try a smaller one.' : "That image couldn't be read. Try another file.")
    }
    const r = await account.uploadAvatar(square)
    setBusy(null)
    if (r.ok) {
      setProfile(r.data)
      toast.success('Photo updated')
    } else setError(r.error.message)
  }

  const remove = async () => {
    setError(null)
    setBusy('remove')
    const r = await account.removeAvatar()
    setBusy(null)
    if (r.ok) {
      setProfile(r.data)
      toast.success('Photo removed')
    } else setError(r.error.message)
  }

  return (
    <SettingsCard title="Photo" description="JPEG, PNG or WebP, up to 5 MB. It is cropped to a square from the middle.">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={profile.avatarUrl} size={48} />
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            aria-disabled={busy !== null || undefined}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-ui-body font-medium text-ink hover:bg-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            <Upload className="size-4" aria-hidden />
            {busy === 'upload' ? 'Uploading…' : profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
            <input
              id={inputId}
              type="file"
              accept={PHOTO_TYPES.join(',')}
              className="sr-only"
              disabled={busy !== null}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {profile.avatarUrl && (
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} loading={busy === 'remove'} disabled={busy === 'upload'} onClick={() => void remove()}>
              Remove photo
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-ui-small text-danger">
          {error}
        </p>
      )}
      {isDemoMode && <p className="mt-3 text-ui-small text-ink-muted">Demo: the photo is kept in this tab only and is gone when you reload.</p>}
    </SettingsCard>
  )
}
