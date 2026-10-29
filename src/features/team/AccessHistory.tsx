// Access history (ADR-0029): invitations, role and permission changes, deactivations and refused attempts.
// Read-only: the audit log can only be added to, never edited or deleted, from the app.
import { History } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { FormField, Input, Select } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { AccessAction, AccessEvent } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { type TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { ROLE_KEY } from './teamLabels'

const PAGE_SIZE = 20

export const ACTION_LABEL: Record<AccessAction, TranslationKey> = {
  invite_created: 'team.access.action.invite_created',
  invite_email_sent: 'team.access.action.invite_email_sent',
  invite_email_failed: 'team.access.action.invite_email_failed',
  invite_accepted: 'team.access.action.invite_accepted',
  invite_revoked: 'team.access.action.invite_revoked',
  invite_expired_attempt: 'team.access.action.invite_expired_attempt',
  role_changed: 'team.access.action.role_changed',
  permissions_changed: 'team.access.action.permissions_changed',
  member_deactivated: 'team.access.action.member_deactivated',
  member_reactivated: 'team.access.action.member_reactivated',
  denied: 'team.access.action.denied',
  member_removed: 'team.access.action.member_removed',
  member_email_changed: 'team.access.action.member_email_changed',
  member_closed: 'team.access.action.member_closed',
}

/**
 * The whole access history (with filters), or one member's: events about that member, and the access refusals of
 * their login, matched on exact ids (R-W6-4).
 */
export function AccessHistory({ member }: { member?: { id: string; userId: string | null } }) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const q = member ? '' : (params.get('hq') ?? '')
  const memberId = member?.id
  const userId = member?.userId ?? undefined
  const action = (Object.keys(ACTION_LABEL) as string[]).includes(params.get('action') ?? '') ? (params.get('action') as AccessAction) : undefined
  const outcome = params.get('outcome') === 'ok' || params.get('outcome') === 'denied' ? (params.get('outcome') as 'ok' | 'denied') : undefined
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  const events = useServiceQuery(
    () => service.getAccessEvents({ q: q || undefined, memberId, userId, action, outcome, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE }),
    [q, memberId, userId, action, outcome, from, to, page],
  )

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (value) n.set(key, value)
        else n.delete(key)
        if (key !== 'page') n.delete('page')
        return n
      },
      { replace: true },
    )

  return (
    <>
      {!member && (
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto_auto] lg:items-end">
          <div className="flex flex-col gap-2">
            <span aria-hidden className="text-ui-body font-medium text-ink">{t('team.access.member')}</span>
            <SearchInput value={q} onChange={(v) => set('hq', v)} label={t('team.access.memberLabel')} placeholder={t('team.access.memberPlaceholder')} className="sm:w-full" />
          </div>
          <FormField label={t('team.access.filter.action')}>
            <Select value={action ?? ''} onChange={(e) => set('action', e.target.value)}>
              <option value="">{t('team.access.allActions')}</option>
              {(Object.keys(ACTION_LABEL) as AccessAction[]).map((a) => (
                <option key={a} value={a}>
                  {t(ACTION_LABEL[a])}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('team.access.filter.outcome')}>
            <Select value={outcome ?? ''} onChange={(e) => set('outcome', e.target.value)}>
              <option value="">{t('team.access.allOutcomes')}</option>
              <option value="ok">{t('team.access.done')}</option>
              <option value="denied">{t('team.access.refused')}</option>
            </Select>
          </FormField>
          <FormField label={t('team.access.filter.from')}>
            <Input type="date" value={from} onChange={(e) => set('from', e.target.value)} />
          </FormField>
          <FormField label={t('team.access.filter.to')}>
            <Input type="date" value={to} onChange={(e) => set('to', e.target.value)} />
          </FormField>
        </div>
      )}

      {events.status === 'loading' && !events.data ? (
        <SkeletonRows rows={5} />
      ) : events.status === 'error' ? (
        <ErrorState message={`${t('team.access.loadFailed')} ${errorText(events.error, t)}`} onRetry={events.refetch} className="m-6" />
      ) : !events.data?.items.length ? (
        <EmptyState icon={History} title={t('team.access.empty.title')} body={q || action || outcome || from || to ? t('team.access.empty.filtered') : t('team.access.empty.body')} />
      ) : (
        <>
          <ol className="divide-y divide-line">
            {events.data.items.map((e) => (
              <EventRow key={e.id} e={e} />
            ))}
          </ol>
          {!member && (
            <div className="border-t border-line px-4 py-3 sm:px-6">
              <Pagination page={page} pageSize={PAGE_SIZE} total={events.data.total} onPage={(p) => set('page', String(p))} noun={t('team.access.noun')} />
            </div>
          )}
        </>
      )}
    </>
  )
}

function EventRow({ e }: { e: AccessEvent }) {
  const { t } = useI18n()
  const fmt = useFormat()
  const roleName = (r?: string) => (r === 'owner' || r === 'admin' || r === 'team' ? t(ROLE_KEY[r]) : r)
  return (
    <li className="grid gap-1 px-4 py-3.5 text-ui-body sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4 sm:px-6">
      <time dateTime={e.at} className="text-ui-small text-ink-muted tabular-nums sm:pt-0.5">
        {fmt.dateTime(e.at)}
      </time>
      <div className="min-w-0">
        <p className="text-ink">
          <span className="font-medium">{t(ACTION_LABEL[e.action])}</span>
          {e.member && (
            <span className="text-ink-muted">
              {' '}
              ·{' '}
              <span className="inline-block max-w-full truncate align-bottom" title={e.member}>
                {e.member}
              </span>
            </span>
          )}
          {(e.fromRole || e.toRole) && (
            <span className="text-ink-muted">
              {' '}
              · {e.fromRole ? `${roleName(e.fromRole)} → ` : ''}
              {roleName(e.toRole) ?? ''}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-ui-small text-ink-muted">{e.details}</p>
        <p className="mt-0.5 truncate text-ui-small text-ink-muted" title={e.actor ?? undefined}>
          {t('team.access.by', { who: e.actor ?? t('team.access.system') })}
        </p>
      </div>
      <div>{e.outcome === 'denied' ? <Badge tone="danger">{t('team.access.refused')}</Badge> : <Badge tone="success">{t('team.access.done')}</Badge>}</div>
    </li>
  )
}
