import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Form'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { applicationAdminPath, businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import type { AuditEntry } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { actorText } from '../applications/AuditTimeline'
import { eventLabel, statusWord } from '../applications/labels'

const PAGE_SIZE = 30

/** Event types without a written label fall back to their lower-case name; show it as a sentence. */
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Administrative audit trail (append-only, written on the server). */
export default function AuditLogPage() {
  const { t, lang } = useI18n()
  const f = useFormat()
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)
  // Other people's sign-ins (IP and device) are the Owner's to see (R-W1-4): left out unless the Owner asks.
  const isOwner = useCan()('owner')
  const includeSignIns = isOwner && params.get('signins') === '1'
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    if (k !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const q = useServiceQuery(() => service.getAuditEvents({ search, includeSignIns, page, pageSize: PAGE_SIZE }), [search, includeSignIns, page])
  // Names for the rows' subjects, so each row says which business or application it is about. Best effort:
  // while these load or if they fail, the rows keep their plain "Application" / "Business" links.
  const subjects = useServiceQuery(async () => {
    const appIds = [...new Set((q.data?.items ?? []).flatMap((e) => (e.applicationId ? [e.applicationId] : [])))]
    const [businesses, ...apps] = await Promise.all([service.getBusinesses(), ...appIds.map((id) => service.getApplication(id))])
    return {
      ok: true as const,
      data: {
        businesses: new Map(businesses.ok ? businesses.data.map((b) => [b.id, b.name]) : []),
        applications: new Map(apps.flatMap((r) => (r.ok ? [[r.data.id, r.data] as const] : []))),
      },
    }
  }, [q.data])
  const bizName = (id: string) => subjects.data?.businesses.get(id)
  const app = (id: string) => subjects.data?.applications.get(id)

  /** The second line of a row: which business and application the event is about (links), or the recorded name. */
  const subjectLine = (e: AuditEntry): ReactNode[] | null => {
    const parts: ReactNode[] = []
    // R-W7-1: a deleted business keeps its recorded name, without a link to a page that no longer exists.
    if (e.businessId && e.businessDeleted) parts.push(<span key="business">{t('admin.audit.deletedBusiness', { name: e.businessName ?? t('admin.audit.business') })}</span>)
    else if (e.businessId) {
      parts.push(
        <Link key="business" to={businessAdminPath(e.businessId)} className="text-accent-ink hover:underline">
          {bizName(e.businessId) ?? e.businessName ?? t('admin.audit.business')}
        </Link>,
      )
    }
    if (e.applicationId) {
      const a = app(e.applicationId)
      // The business link already names it once it exists; otherwise name the applicant business here.
      const text = !a
        ? t('admin.audit.application')
        : e.businessId && bizName(e.businessId)
          ? t('admin.audit.applicationRef', { ref: a.reference })
          : t('admin.audit.nameApplicationRef', { name: a.businessName, ref: a.reference })
      parts.push(
        <Link key="application" to={applicationAdminPath(e.applicationId)} className="text-accent-ink hover:underline">
          {text}
        </Link>,
      )
    }
    if (!e.businessId && typeof e.metadata.name === 'string') parts.push(<span key="name">{e.metadata.name}</span>)
    if (parts.length === 0) return null
    return parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={`dot-${i}`}> · </span>, p]))
  }

  return (
    <>
      <PageHeader title={t('nav.auditLog')} description={t('admin.audit.description')} />
      <Card>
        <div className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-end sm:gap-6 sm:p-6">
          <label className="flex flex-col gap-2 sm:w-[420px]">
            <span className="text-[length:var(--text-ui-body)] leading-5 font-medium text-ink">{t('admin.audit.search')}</span>
            <SearchInput value={search} onChange={(v) => set('q', v)} label={t('admin.audit.search')} placeholder={t('admin.audit.searchPlaceholder')} className="w-full" />
          </label>
          {isOwner && <Checkbox label={t('admin.audit.showSignIns')} className="min-h-11" checked={includeSignIns} onChange={(e) => set('signins', e.target.checked ? '1' : '')} />}
        </div>
        <h2 className="sr-only">{t('admin.audit.events')}</h2>
        {q.status === 'loading' && !q.data ? (
          <div className="p-5 sm:px-6">
            <SkeletonRows rows={6} />
          </div>
        ) : q.status === 'error' && !q.data ? (
          <ErrorState message={errorText(q.error, t)} onRetry={q.refetch} className="py-16" />
        ) : !q.data?.items.length ? (
          <EmptyState title={t(search ? 'admin.audit.noMatch' : 'admin.audit.empty')} className="py-16" />
        ) : (
          <>
            <ul className="divide-y divide-subtle">
              {q.data.items.map((e) => {
                const subject = subjectLine(e)
                return (
                  <li key={e.id} className="grid min-h-16 grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-canvas/70 sm:px-6 md:grid-cols-[168px_minmax(0,1fr)_auto] md:items-center">
                    <time
                      dateTime={e.createdAt}
                      className="text-[length:var(--text-ui-small)] text-ink-muted tabular-nums max-md:order-2 md:text-[length:var(--text-ui-body)] md:text-ink"
                    >
                      {f.dateTime(e.createdAt)}
                    </time>
                    <div className="min-w-0 max-md:order-1 max-md:col-span-2">
                      <p className="text-[length:var(--text-ui-body)] leading-5 text-ink">
                        <span className="font-medium">{sentenceCase(eventLabel(e.eventType, e.metadata, lang))}</span>
                        {e.toStatus && (
                          <span className="text-ink-muted">
                            {' '}
                            · {e.fromStatus ? `${sentenceCase(statusWord(e.fromStatus, lang))} → ` : ''}
                            {sentenceCase(statusWord(e.toStatus, lang))}
                          </span>
                        )}
                      </p>
                      {subject && <p className="mt-0.5 text-[length:var(--text-ui-small)] leading-[1.35] break-words text-ink-muted">{subject}</p>}
                    </div>
                    <span title={e.actorEmail} className="min-w-0 truncate text-[length:var(--text-ui-small)] text-ink-muted text-right max-md:order-3 md:max-w-[260px] md:text-[length:var(--text-ui-body)]">
                      {actorText(e, lang)}
                    </span>
                  </li>
                )
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={(p) => set('page', String(p))} noun={t('admin.audit.noun')} />
          </>
        )}
      </Card>
    </>
  )
}
