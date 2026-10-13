import { Link2, Trash2, UserPlus, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input } from '@/components/ui/Form'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { formatDate } from '@/lib/format'
import { claimLinkUrl } from '@/lib/urls'
import { service } from '@/services'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'

/**
 * Platform admins link Supabase Auth accounts to a business as its owners.
 * Authorization is enforced in the database (admin-only functions and policies), not here.
 */
export function BusinessOwnersPanel({ business }: { business: Business }) {
  const members = useServiceQuery(() => service.getBusinessMembers(business.id), [business.id])
  const add = useServiceMutation((email: string) => service.addBusinessMember(business.id, email))
  const confirm = useConfirm()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (members.status === 'error' && members.error.code === 'UNSUPPORTED') {
    return (
      <Card>
        <CardHeader title="Owners" />
        <CardBody>
          <InlineNotice>{members.error.message}</InlineNotice>
        </CardBody>
      </Card>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError('Enter a valid email address.')
    const res = await add.mutate(value)
    if (!res.ok) return setError(res.error.message)
    setError(null)
    setEmail('')
    toast.success('Owner added', `${value} can now manage ${business.name}.`)
  }

  const remove = async (userId: string, memberEmail: string) => {
    const ok = await confirm({
      title: `Remove ${memberEmail}?`,
      body: `They will no longer be able to manage ${business.name}. Their account is not deleted.`,
      confirmLabel: 'Remove owner',
      destructive: true,
    })
    if (!ok) return
    const res = await service.removeBusinessMember(business.id, userId)
    if (res.ok) toast.success('Owner removed')
    else toast.error('Could not remove owner', res.error.message)
  }

  return (
    <Card>
      <CardHeader title="Owners" description="Accounts that can manage this business in the Business Admin dashboard." />
      <CardBody className="space-y-5">
        {members.status === 'loading' && !members.data ? (
          <SkeletonRows rows={2} />
        ) : members.status === 'error' ? (
          <ErrorState message={members.error.message} onRetry={members.refetch} />
        ) : !members.data?.length ? (
          <EmptyState icon={Users} title="No owners yet" body="Add the email of an existing account to give it access to this business." className="py-6" />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {(members.data ?? []).map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{m.email}</span>
                  <span className="block text-xs text-ink-muted">Added {formatDate(m.addedAt)}</span>
                </span>
                <IconButton aria-label={`Remove ${m.email}`} onClick={() => void remove(m.userId, m.email)}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <FormField
            label="Add owner by email"
            hint="The account must already exist and have confirmed its email. For someone without an account, use a claim link below."
            error={error ?? undefined}
            className="flex-1"
          >
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <Button type="submit" variant="primary" loading={add.pending} icon={<UserPlus className="size-4" aria-hidden />} disabled={!email.trim()}>
            Add owner
          </Button>
        </form>
        <ClaimLinkSection business={business} />
      </CardBody>
    </Card>
  )
}

/**
 * Single-use claim link for an owner who has no access yet (20261013144121_owner_registration_and_claims).
 * Only a hash is stored server-side, so the link can be shown once; creating a new one cancels the old one.
 */
function ClaimLinkSection({ business }: { business: Business }) {
  const create = useServiceMutation(() => service.createBusinessClaim(business.id))
  const confirm = useConfirm()
  const toast = useToast()
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)

  const issue = async () => {
    const ok = await confirm({
      title: 'Create a claim link?',
      body: `Whoever opens this link while signed in becomes an owner of ${business.name}. Any unused earlier link stops working.`,
      confirmLabel: 'Create link',
    })
    if (!ok) return
    const res = await create.mutate()
    if (!res.ok) return toast.error('Could not create a claim link', res.error.message)
    setLink({ url: claimLinkUrl(res.data.token), expiresAt: res.data.expiresAt })
  }

  return (
    <div className="space-y-3 border-t border-line pt-5">
      <div>
        <h3 className="text-sm font-medium text-ink">Claim link</h3>
        <p className="mt-1 text-xs text-ink-muted">
          For an owner who has no access yet. Send it only to a contact you have verified yourself, for example by phone. Single use, valid for 7 days.
        </p>
      </div>
      {link ? (
        <div className="space-y-2">
          <Input readOnly aria-label="Claim link" value={link.url} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={link.url} />
            <span className="text-xs text-ink-muted">Shown only once. Expires {formatDate(link.expiresAt)}.</span>
          </div>
        </div>
      ) : (
        <Button loading={create.pending} icon={<Link2 className="size-4" aria-hidden />} onClick={() => void issue()}>
          Create claim link
        </Button>
      )}
    </div>
  )
}
