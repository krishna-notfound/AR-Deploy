// What Admin and Team may do (ADR-0029). Owner only; the Owner always has everything. Removing a permission is
// confirmed with who loses it; unsaved changes are counted and leaving asks first. A permission includes the
// permissions it needs (R-W3-3): they are ticked and locked while it is ticked, and the database adds them too.
import { AlertTriangle, RotateCcw, Save } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useBlocker } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Modal } from '@/components/ui/Modal'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { withPrerequisites } from '@/domain/permissions'
import type { MemberRole, Permission, RolePermissions } from '@/domain/types'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABEL, ROLE_LABEL } from './permissions'

const ROLES: MemberRole[] = ['admin', 'team']
const same = (a: Permission[], b: Permission[]) => a.length === b.length && a.every((p) => b.includes(p))
const diff = (from: Permission[], to: Permission[]) => ({ added: to.filter((p) => !from.includes(p)), removed: from.filter((p) => !to.includes(p)) })
/** The permissions `p` needs, transitively, without `p` itself. */
const needs = (p: Permission) => withPrerequisites([p]).filter((x) => x !== p)
const labels = (ps: Permission[]) => ps.map((p) => PERMISSION_LABEL[p]).join(', ')

export default function RolePermissionsPage() {
  const saved = useServiceQuery(() => service.getRolePermissions(), [])
  const members = useServiceQuery(() => service.listMembers(), [])
  // `base` is the last saved state this page knows of; it is set from the first load and from each save, so a slow
  // reload can never put an older state back on screen.
  const [base, setBase] = useState<RolePermissions | null>(null)
  // `draft` holds what the Owner ticked; `effective` adds what those permissions need (what is shown and stored).
  const [draft, setDraft] = useState<RolePermissions | null>(null)
  const effective = useMemo(() => (draft ? { admin: withPrerequisites(draft.admin), team: withPrerequisites(draft.team) } : null), [draft])
  const lockId = useId()
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()

  useEffect(() => {
    if (saved.data && !base) {
      setBase({ admin: [...saved.data.admin], team: [...saved.data.team] })
      setDraft({ admin: [...saved.data.admin], team: [...saved.data.team] })
    }
  }, [saved.data, base])

  const changes = useMemo(() => {
    if (!base || !effective) return 0
    return ROLES.reduce((n, r) => {
      const d = diff(base[r], effective[r])
      return n + d.added.length + d.removed.length
    }, 0)
  }, [base, effective])
  const dirty = changes > 0
  const statusText = dirty ? `${changes} unsaved change${changes === 1 ? '' : 's'}` : ''
  // After a save the bar unmounts; focus the page heading so keyboard and screen reader users keep their place.
  const [savedTick, setSavedTick] = useState(0)
  useEffect(() => {
    if (!savedTick) return
    const h1 = document.querySelector('h1')
    if (h1) {
      h1.setAttribute('tabindex', '-1')
      h1.focus({ preventScroll: true })
    }
  }, [savedTick])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname)

  const toggle = (role: MemberRole, p: Permission) =>
    setDraft((d) => (d ? { ...d, [role]: d[role].includes(p) ? d[role].filter((x) => x !== p) : [...d[role], p] } : d))
  /** The ticked permissions of `role` that need `p`; while there are any, `p` stays ticked and locked. */
  const neededBy = (role: MemberRole, p: Permission) => (effective ? effective[role].filter((q) => q !== p && needs(q).includes(p)) : [])

  const activeIn = (role: MemberRole) => (members.data ?? []).filter((m) => m.role === role && m.status === 'active').length

  const save = async () => {
    if (!base || !draft || !effective) return
    const changed = ROLES.filter((r) => !same(base[r], effective[r]))
    const removals = changed.map((r) => ({ role: r, removed: diff(base[r], effective[r]).removed })).filter((x) => x.removed.length)
    if (removals.length) {
      const yes = await confirm({
        title: 'Remove permissions?',
        body: (
          <div className="space-y-2">
            {removals.map(({ role, removed }) => (
              <p key={role}>
                <strong className="font-medium text-ink">{ROLE_LABEL[role]}</strong> loses: {removed.map((p) => PERMISSION_LABEL[p]).join(', ')}.{' '}
                {activeIn(role)} active {ROLE_LABEL[role]} member{activeIn(role) === 1 ? '' : 's'} lose{activeIn(role) === 1 ? 's' : ''} this on their next action.
              </p>
            ))}
          </div>
        ),
        confirmLabel: 'Save changes',
        destructive: true,
      })
      if (!yes) return
    }
    setSaving(true)
    // The prerequisites the database added, and the newly ticked permissions that needed them.
    const alsoAdded = new Set<Permission>()
    const causes = new Set<Permission>()
    for (const r of changed) {
      const res = await service.setRolePermissions(r, draft[r])
      if (!res.ok) {
        setSaving(false)
        toast.error('Permissions not saved', res.error.message)
        return
      }
      for (const p of res.data.added) alsoAdded.add(p)
      for (const q of draft[r]) if (!base[r].includes(q) && needs(q).some((p) => res.data.added.includes(p))) causes.add(q)
    }
    setSaving(false)
    if (alsoAdded.size) {
      const added = ALL_PERMISSIONS.filter((p) => alsoAdded.has(p))
      toast.success(`Saved. Also added: ${labels(added)}, which ${causes.size === 1 ? 'it needs' : 'they need'}.`, 'They apply to each member on their next action.')
    } else {
      toast.success('Permissions saved', 'They apply to each member on their next action.')
    }
    setBase({ admin: [...effective.admin], team: [...effective.team] })
    setDraft({ admin: [...effective.admin], team: [...effective.team] })
    setSavedTick((n) => n + 1)
  }

  return (
    <>
      <PageHeader
        title="Role permissions"
        description="Choose what Admin and Team members can do. The Owner always has every permission."
        actions={
          draft ? (
            <Button
              variant="ghost"
              icon={<RotateCcw className="size-4" aria-hidden />}
              onClick={() => setDraft({ admin: [...DEFAULT_ROLE_PERMISSIONS.admin], team: [...DEFAULT_ROLE_PERMISSIONS.team] })}
              disabled={saving}
            >
              Reset to defaults
            </Button>
          ) : undefined
        }
        breadcrumbs={[{ label: 'Team & Access', to: '/admin/team' }, { label: 'Role permissions' }]}
      />

      {saved.status === 'loading' && !draft ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : saved.status === 'error' && !draft ? (
        <ErrorState message={`Could not load the permissions. ${saved.error.message}`} onRetry={saved.refetch} />
      ) : draft ? (
        <div className={dirty || saving ? 'space-y-6 pb-28' : 'space-y-6'}>
          {PERMISSION_GROUPS.map((g) => (
            <Card key={g.title}>
              <h2 className="px-4 pt-6 pb-4 text-ui-card font-semibold text-ink sm:px-6">{g.title}</h2>
              <div className="mx-4 hidden grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line pb-3 text-ui-small font-medium text-ink-muted sm:mx-6 sm:grid">
                <span>Permission</span>
                <div className="grid grid-cols-3 gap-2 text-center sm:w-56">
                  <span>Owner</span>
                  <span>Admin</span>
                  <span>Team</span>
                </div>
              </div>
              <ul className="divide-y divide-subtle pb-2">
                {g.items.map((item) => (
                  <li key={item.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <div className="min-w-0">
                      <p className="text-ui-body font-medium text-ink">{item.label}</p>
                      <p className="mt-0.5 text-ui-body text-ink-muted">{item.description}</p>
                      {needs(item.key).length > 0 && <p className="mt-1 text-ui-small text-ink-muted">Includes: {labels(needs(item.key))}</p>}
                      {item.warning && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-ui-small text-warning">
                          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                          {item.warning}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 items-center gap-2 text-center text-ui-body sm:w-56">
                      <span className="text-ui-small text-ink-muted" title="The Owner always has every permission">
                        <span className="sm:hidden">Owner: </span>All
                      </span>
                      {ROLES.map((r) => {
                        const by = neededBy(r, item.key)
                        const why = by.length ? `Needed by ${labels(by)}` : undefined
                        const whyId = `${lockId}-${r}-${item.key}`
                        return (
                          <label key={r} className="inline-flex min-h-11 items-center justify-center gap-2" title={why}>
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-ink)] disabled:opacity-60"
                              checked={effective?.[r].includes(item.key) ?? false}
                              disabled={!!why}
                              onChange={() => toggle(r, item.key)}
                              aria-label={`${ROLE_LABEL[r]}: ${item.label}`}
                              aria-describedby={why ? whyId : undefined}
                            />
                            <span className="text-ui-small text-ink-muted sm:hidden">{ROLE_LABEL[r]}</span>
                            {why && (
                              <span id={whyId} className="sr-only">
                                {why}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Always mounted, so a change of text is announced; the bar below is only the visual copy. */}
      {draft && (
        <p className="sr-only" role="status" aria-live="polite" data-save-status>
          {statusText}
        </p>
      )}

      {draft && (dirty || saving) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:left-[var(--sidebar-w)]">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
            <p className="flex min-w-0 items-center gap-2 text-ui-body text-ink-muted" aria-hidden>
              <span className="size-1.5 shrink-0 rounded-full bg-warning" />
              <span className="truncate max-sm:hidden">{statusText}</span>
              <span className="sm:hidden">{`${changes} unsaved`}</span>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button onClick={() => base && setDraft({ admin: [...base.admin], team: [...base.team] })} disabled={!dirty || saving}>
                Cancel
              </Button>
              <Button variant="primary" icon={<Save className="size-4" aria-hidden />} onClick={() => void save()} disabled={!dirty} loading={saving}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to the role permissions have not been saved."
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
