// One 3D model request for staff, /admin/model-requests/:requestId (S4 R-S4-11 to R-S4-14): the photos with a viewer,
// the product facts, the model files staged through the shared ModelSection, the history, and Start / Deliver /
// Decline. The route needs models.manage (UX only); the database functions enforce it.
import { Check, FileX, Play, X } from 'lucide-react'
import { type JSX, type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader, PanelHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { ModelRequestDetail, ModelRequestOutcome } from '@/domain/modelRequests'
import type { ModelAsset, ModelFormat, ProductModels } from '@/domain/types'
import { eventLabel } from '@/features/applications/labels'
import { DeclineDialog } from '@/features/modelRequests/DeclineDialog'
import { DeliverDialog, reviewToast } from '@/features/modelRequests/DeliverDialog'
import { ModelRequestStatusBadge } from '@/features/modelRequests/ModelRequestStatusBadge'
import { PhotoThumb, PhotoViewer } from '@/features/modelRequests/PhotoViewer'
import { ModelSection } from '@/features/products/editor/ModelSection'
import { AR_READINESS_HINT, AR_READINESS_LABEL, productArReadiness } from '@/features/products/productReadiness'
import { editPath } from '@/features/products/useProductActions'
import { MEDIA_REFRESH_MS, type Result } from '@/services/catalogService'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { formatFileSize } from '@/lib/format'
import { useFormat } from '@/lib/useFormat'
import { businessAdminPath, modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useRefreshWhenStale, useServiceMutation, useServiceQuery } from '@/services/hooks'

export default function ModelRequestDetailPage(): JSX.Element {
  const { t } = useI18n()
  const { requestId = '' } = useParams()
  const q = useServiceQuery(() => service.getModelRequest(requestId), [requestId])
  // Staged files and photos use signed URLs that expire: refetch on return to the tab once they are getting old.
  useRefreshWhenStale(q.refetch, MEDIA_REFRESH_MS, q.data)

  if (q.status === 'loading' && !q.data) return <FullPageSpinner label={t('admin.modelRequests.detail.loading')} />
  if (!q.data)
    return q.status === 'error' && q.error.code !== 'NOT_FOUND' ? (
      <ErrorState message={t('admin.modelRequests.detail.loadFailed')} onRetry={q.refetch} className="py-24" />
    ) : (
      <EmptyState icon={FileX} title={t('admin.modelRequests.detail.notFoundTitle')} body={t('admin.modelRequests.detail.notFoundBody')} action={<ButtonLink to={modelRequestsAdminPath()}>{t('admin.modelRequests.detail.back')}</ButtonLink>} className="py-24" />
    )
  return <RequestView r={q.data} onChanged={q.refetch} />
}

const OPEN = new Set(['requested', 'in_progress'])

function RequestView({ r, onChanged }: { r: ModelRequestDetail; onChanged: () => void }) {
  const { t } = useI18n()
  const f = useFormat()
  const toast = useToast()
  const can = useCan()
  const [viewer, setViewer] = useState<number | null>(null)
  const [dialog, setDialog] = useState<'deliver' | 'decline' | null>(null)
  const start = useServiceMutation(() => service.startModelRequest(r.id))
  const deliver = useServiceMutation(() => service.deliverModelRequest(r.id))
  const decline = useServiceMutation((reason: string) => service.rejectModelRequest(r.id, reason))

  const productName = r.productName.en || r.product.name.en
  const option = r.variantId ? r.product.variants.find((v) => v.id === r.variantId) : undefined
  const optionName = r.variantName?.en ?? option?.name.en
  const open = OPEN.has(r.status)
  const targetModels: ProductModels = r.variantId ? (option?.models ?? {}) : r.product.models
  const readiness = productArReadiness({ models: targetModels })

  const report = (action: 'start' | 'deliver' | 'decline', res: Result<ModelRequestOutcome>) => {
    if (!res.ok) {
      toast.error(t(action === 'start' ? 'admin.modelRequests.detail.notStarted' : action === 'deliver' ? 'admin.modelRequests.detail.notDelivered' : 'admin.modelRequests.detail.notDeclined'), errorText(res.error, t))
      onChanged()
      return
    }
    setDialog(null)
    const outcome = reviewToast(action, res.data)
    if (outcome.tone === 'error') toast.error(outcome.title)
    else toast.success(outcome.title)
    onChanged()
  }

  const onModel = async (format: ModelFormat, asset: ModelAsset | undefined) => {
    const res = asset ? await service.stageModelFile(r.id, format, asset) : await service.unstageModelFile(r.id, format)
    if (!res.ok) toast.error(t(asset ? 'admin.modelRequests.detail.fileNotAdded' : 'admin.modelRequests.detail.fileNotRemoved'), errorText(res.error, t))
    else if (res.data.cleanup === 'partial') toast.info(t('admin.modelRequests.detail.cleanupPartial'))
    onChanged()
  }

  const product = can('products.edit') ? (
    <Link to={editPath('admin', { id: r.productId })} className="hover:underline">
      {productName}
    </Link>
  ) : (
    productName
  )
  const sample = r.photos.some((p) => p.sample)
  const sessionOnly = r.photos.some((p) => p.sessionOnly)

  return (
    <>
      <PageHeader
        title={product}
        breadcrumbs={[{ label: t('nav.modelRequests'), to: modelRequestsAdminPath() }, { label: productName }]}
        meta={
          <>
            <ModelRequestStatusBadge status={r.status} />
            <Link to={businessAdminPath(r.businessId)} className="text-[length:var(--text-ui-small)] font-medium text-ink hover:underline">
              {r.businessName}
            </Link>
            <span className="text-[length:var(--text-ui-small)] text-ink-muted">{t('admin.modelRequests.detail.target', { target: optionName ? t('admin.modelRequests.detail.option', { name: optionName }) : t('admin.modelRequests.product') })}</span>
            <span className="text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
              {t('admin.modelRequests.detail.requestedBy', { who: r.requestedByLabel ?? t('admin.modelRequests.detail.theBusiness'), date: f.date(r.createdAt) })}
            </span>
          </>
        }
        actions={
          open ? (
            <div className="flex flex-wrap gap-2">
              {r.status === 'requested' && (
                <Button icon={<Play className="size-4" aria-hidden />} loading={start.pending} onClick={async () => report('start', await start.mutate())}>
                  {t('admin.modelRequests.detail.start')}
                </Button>
              )}
              <Button variant="secondary" className="border-danger! text-danger! hover:bg-danger-soft!" icon={<X className="size-4" aria-hidden />} onClick={() => setDialog('decline')}>
                {t('admin.modelRequests.detail.decline')}
              </Button>
              {r.status === 'in_progress' && r.staged.glb && (
                <Button variant="primary" icon={<Check className="size-4" aria-hidden />} onClick={() => setDialog('deliver')}>
                  {t('admin.modelRequests.detail.deliver')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {r.status === 'rejected' && r.reason && (
        <InlineNotice tone="warning" className="mb-6">
          <strong className="font-medium">{t('admin.modelRequests.tab.rejected')}</strong>
          {r.closedAt ? ` ${t('admin.applications.detail.onDate', { date: f.date(r.closedAt) })}` : ''}. {t('admin.modelRequests.detail.reason', { reason: r.reason })}
        </InlineNotice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <PanelHeader title={t('admin.modelRequests.detail.photos', { n: r.photos.length })} actions={sample ? <Badge tone="neutral">{t('admin.modelRequests.detail.samplePhotos')}</Badge> : undefined} />
            <CardBody className="pt-0">
              {sessionOnly && (
                <InlineNotice tone="info" className="mb-4">
                  {t('admin.modelRequests.detail.demoPhotos')}
                </InlineNotice>
              )}
              {r.photos.length === 0 ? (
                <p className="text-ui-body text-ink-muted">{t('admin.modelRequests.detail.noPhotos')}</p>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {r.photos.map((p, i) => (
                    <li key={p.storagePath}>
                      <PhotoThumb key={p.url ?? ''} photo={p} index={i} onOpen={() => setViewer(i)} onReload={onChanged} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <PanelHeader title={t('admin.modelRequests.detail.files')} description={open ? undefined : t('admin.modelRequests.detail.filesClosed')} />
            <CardBody className="pt-0">
              {open ? (
                <ModelSection
                  context="request"
                  businessId={r.businessId}
                  models={r.staged}
                  onChange={(format, asset) => void onModel(format, asset)}
                  dimensions={r.product.dimensions}
                  poster={r.product.images[0]?.url}
                  name={productName}
                  onRefreshUrls={onChanged}
                />
              ) : (
                <p className="text-ui-body text-ink-muted">{t(r.status === 'delivered' ? 'admin.modelRequests.detail.delivered' : 'admin.modelRequests.detail.noneDelivered')}</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <section aria-label={t('admin.modelRequests.detail.facts')}>
              <PanelHeader title={t('admin.modelRequests.detail.facts')} />
              <CardBody className="pt-0">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui-body">
                  <Fact label={t('product.width')}>{`${r.product.dimensions.width} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label={t('product.height')}>{`${r.product.dimensions.height} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label={t('product.depth')}>{`${r.product.dimensions.depth} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label={t('product.material')}>{r.product.material.en || '—'}</Fact>
                  <Fact label={t('admin.applications.detail.category')}>{t(`category.${r.product.category}`)}</Fact>
                  <Fact label={t('admin.modelRequests.detail.note')}>{r.note || t('admin.modelRequests.detail.noNote')}</Fact>
                  <Fact label={optionName ? t('admin.modelRequests.detail.currentFilesFor', { name: optionName }) : t('admin.modelRequests.detail.currentFiles')}>
                    {targetModels.glb || targetModels.usdz ? (
                      <ul>
                        {(['glb', 'usdz'] as const).flatMap((fmt) => {
                          const m = targetModels[fmt]
                          return m ? [<li key={fmt} className="break-all">{m.fileName}{m.sizeBytes ? ` · ${formatFileSize(m.sizeBytes)}` : ''}</li>] : []
                        })}
                      </ul>
                    ) : (
                      t('admin.modelRequests.detail.noFiles')
                    )}
                  </Fact>
                  <Fact label={t('admin.modelRequests.detail.readiness')}>
                    <span title={AR_READINESS_HINT[readiness]}>{AR_READINESS_LABEL[readiness]}</span>
                  </Fact>
                </dl>
              </CardBody>
            </section>
          </Card>

          <Card>
            <section aria-label={t('admin.businesses.detail.history')}>
              <PanelHeader title={t('admin.businesses.detail.history')} />
              <CardBody className="pt-0">
                {r.history.length === 0 ? (
                  <p className="text-ui-body text-ink-muted">{t('admin.audit.empty')}</p>
                ) : (
                  <ol className="space-y-3">
                    {r.history.map((e, i) => (
                      <li key={`${e.type}-${e.at}-${i}`} className="text-ui-body">
                        <p className="font-medium text-ink">{eventLabel(e.type)}</p>
                        <p className="text-ui-small text-ink-muted tabular-nums">
                          {f.dateTime(e.at)}
                          {e.actorLabel ? ` · ${e.actorLabel}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </section>
          </Card>
        </div>
      </div>

      {viewer !== null && <PhotoViewer photos={r.photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onReload={onChanged} />}
      <DeliverDialog
        open={dialog === 'deliver'}
        onClose={() => setDialog(null)}
        pending={deliver.pending}
        productName={productName}
        optionName={optionName}
        hasUsdz={!!r.staged.usdz}
        onConfirm={async () => report('deliver', await deliver.mutate())}
      />
      {/* Mounted only while open, so each decline starts with an empty reason. */}
      {dialog === 'decline' && <DeclineDialog open onClose={() => setDialog(null)} pending={decline.pending} onConfirm={async (reason) => report('decline', await decline.mutate(reason))} />}
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  )
}
