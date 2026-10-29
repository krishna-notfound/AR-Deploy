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
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { MB } from '@/lib/files'
import { ImageTooLargeError, squareResize } from '@/lib/image'
import { DISPLAY_NAME_MAX, type Profile, account, isDemoMode } from '@/services'
import { SectionHeader, SettingsCard } from '../SettingsUi'
import { useMyProfile } from '../useMyProfile'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Before resizing: the upload itself is at most 512 KB once it is 256 px square. */
const PHOTO_MAX_BYTES = 5 * MB

export default function ProfileSection() {
  const { t } = useI18n()
  const { profile, error, reload, setProfile } = useMyProfile()
  return (
    <>
      <SectionHeader title={t('settings.section.profile')} description={t('settings.profile.description')} />
      {profile ? (
        <div className="space-y-6">
          {error && (
            <InlineNotice tone="warning">
              {t('settings.profile.refreshFailed')} {accountErrorText(error, t)}{' '}
              <button type="button" className="font-medium underline underline-offset-2" onClick={reload}>
                {t('common.retry')}
              </button>
            </InlineNotice>
          )}
          <NameCard profile={profile} setProfile={setProfile} />
          <PhotoCard profile={profile} setProfile={setProfile} />
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={accountErrorText(error, t)} onRetry={reload} />
        </Card>
      ) : (
        <div className="space-y-6" aria-busy="true" aria-label={t('settings.profile.loading')}>
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
  const { t } = useI18n()
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
      setError(t('settings.profile.nameError', { n: DISPLAY_NAME_MAX }))
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
      toast.success(t('settings.profile.nameSaved'))
    } else {
      setProfile(profile)
      setError(accountErrorText(r.error, t))
    }
  }

  return (
    <SettingsCard title={t('settings.profile.nameTitle')} description={t('settings.profile.nameDescription')}>
      <form onSubmit={save} noValidate className="flex max-w-md flex-col gap-4">
        <FormField label={t('common.name')} error={error ?? undefined} hint={t('settings.profile.nameHint', { n: DISPLAY_NAME_MAX })}>
          <Input
            value={draft}
            autoComplete="name"
            placeholder={t('settings.profile.namePlaceholder')}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
          />
        </FormField>
        <div>
          <Button type="submit" variant="primary" loading={saving}>
            {t('settings.profile.saveName')}
          </Button>
        </div>
      </form>
    </SettingsCard>
  )
}

function PhotoCard({ profile, setProfile }: CardProps) {
  const { t } = useI18n()
  const { user } = useAccount()
  const toast = useToast()
  const inputId = useId()
  const errorId = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const name = profile.displayName || user?.name || ''

  const onFile = async (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) return setError(t('settings.profile.photoType'))
    if (file.size > PHOTO_MAX_BYTES) return setError(t('settings.profile.photoSize', { n: PHOTO_MAX_BYTES / MB }))
    setError(null)
    setBusy('upload')
    let square: Blob
    try {
      square = await squareResize(file, 256)
    } catch (err) {
      setBusy(null)
      return setError(err instanceof ImageTooLargeError ? t('settings.profile.photoTooLarge') : t('settings.profile.photoUnreadable'))
    }
    const r = await account.uploadAvatar(square)
    setBusy(null)
    if (r.ok) {
      setProfile(r.data)
      toast.success(t('settings.profile.photoUpdated'))
    } else setError(accountErrorText(r.error, t))
  }

  const remove = async () => {
    setError(null)
    setBusy('remove')
    const r = await account.removeAvatar()
    setBusy(null)
    if (r.ok) {
      setProfile(r.data)
      toast.success(t('settings.profile.photoRemoved'))
    } else setError(accountErrorText(r.error, t))
  }

  return (
    <SettingsCard title={t('settings.profile.photoTitle')} description={t('settings.profile.photoDescription', { n: PHOTO_MAX_BYTES / MB })}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={profile.avatarUrl} size={48} />
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            aria-disabled={busy !== null || undefined}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-ui-body font-medium text-ink hover:bg-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            <Upload className="size-4" aria-hidden />
            {busy === 'upload' ? t('settings.profile.uploading') : profile.avatarUrl ? t('settings.profile.replace') : t('settings.profile.upload')}
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
              {t('settings.profile.remove')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-ui-small text-danger">
          {error}
        </p>
      )}
      {isDemoMode && <p className="mt-3 text-ui-small text-ink-muted">{t('settings.profile.demo')}</p>}
    </SettingsCard>
  )
}
