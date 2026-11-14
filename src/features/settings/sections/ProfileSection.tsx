// Profile: the person's name and photo (spec section 8). Both show in the sidebar at once (useMyProfile), and on
// Team & Access for platform staff. The photo is cropped to a square by the person in the crop dialog (ADR-0063) and
// resized in the browser before upload (512 px, or smaller when it would pass the 512 KB limit).
import { Trash2, Upload } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useAccount } from '@/auth/AccountProvider'
import { ImageCropDialog } from '@/components/image/ImageCropDialog'
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
import { renderCrop } from '@/lib/imageCrop'
import { imageFrame } from '@/lib/imageFrames'
import { AVATAR_MAX_BYTES, DISPLAY_NAME_MAX, type Profile, account, isDemoMode } from '@/services'
import { SectionHeader, SettingsCard, useUnsavedDraft } from '../SettingsUi'
import { useMyProfile } from '../useMyProfile'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Before cropping: the upload itself is at most 512 KB once it is cropped and resized. */
const PHOTO_MAX_BYTES = 5 * MB
/** The crop is written at 512 px; a picture that still passes the upload limit is written again smaller. */
const AVATAR_STEPS = [
  { maxSide: 512, quality: 0.85 },
  { maxSide: 384, quality: 0.8 },
  { maxSide: 256, quality: 0.7 },
] as const

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
  const prefill = user && user.name !== user.email ? user.name : ''
  const [draft, setDraft] = useState(() => profile.displayName ?? prefill)
  // Unsaved while the box differs from the saved name (or from the prefilled one when none is saved yet).
  useUnsavedDraft(draft.trim() !== (profile.displayName ?? prefill).trim())
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
  /** The photo chosen and waiting in the crop dialog. */
  const [pending, setPending] = useState<File | null>(null)
  const name = profile.displayName || user?.name || ''

  const onFile = (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) return setError(t('settings.profile.photoType'))
    if (file.size > PHOTO_MAX_BYTES) return setError(t('settings.profile.photoSize', { n: PHOTO_MAX_BYTES / MB }))
    setError(null)
    setPending(file)
  }

  /** Uploads the person's crop. Kept within the upload limit by writing it again smaller when needed. */
  const save = async (file: File, crop: Parameters<typeof renderCrop>[1], first: Blob) => {
    setBusy('upload')
    try {
      let square = first
      for (const step of AVATAR_STEPS.slice(1)) {
        if (square.size <= AVATAR_MAX_BYTES) break
        square = await renderCrop(file, crop, step)
      }
      const r = await account.uploadAvatar(square)
      if (r.ok) {
        setProfile(r.data)
        toast.success(t('settings.profile.photoUpdated'))
      } else setError(accountErrorText(r.error, t))
    } catch {
      setError(t('settings.profile.photoUnreadable'))
    } finally {
      setBusy(null)
      setPending(null)
    }
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
                if (f) onFile(f)
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
      {pending && (
        <ImageCropDialog
          key={`--`}
          file={pending}
          aspect={imageFrame('avatar').aspect}
          title={t('settings.profile.cropTitle')}
          output={AVATAR_STEPS[0]}
          onCancel={() => setPending(null)}
          onSave={(result) => save(pending, result.crop, result.blob)}
        />
      )}
    </SettingsCard>
  )
}
