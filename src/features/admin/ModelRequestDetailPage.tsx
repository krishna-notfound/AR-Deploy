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
import { DEMO_SESSION_PHOTOS, SAMPLE_PHOTOS } from '@/features/modelRequests/copy'
import { DeclineDialog } from '@/features/modelRequests/DeclineDialog'
import { DeliverDialog, reviewToast } from '@/features/modelRequests/DeliverDialog'
import { ModelRequestStatusBadge } from '@/features/modelRequests/ModelRequestStatusBadge'
import { PhotoThumb, PhotoViewer } from '@/features/modelRequests/PhotoViewer'
import { ModelSection } from '@/features/products/editor/ModelSection'
import { AR_READINESS_HINT, AR_READINESS_LABEL, productArReadiness } from '@/features/products/productReadiness'
import { editPath } from '@/features/products/useProductActions'
import type { Result } from '@/services/catalogService'
import { formatDate, formatDateTime, formatFileSize } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { businessAdminPath, modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'

export const REQUEST_NOT_FOUND = "This request doesn't exist or was removed with its product."

export default function ModelRequestDetailPage(): JSX.Element {
  const { requestId = '' } = useParams()
  const q = useServiceQuery(() => service.getModelRequest(requestId), [requestId])

  if (q.status === 'loading' && !q.data) return <FullPageSpinner label="Loading the request" />
  if (!q.data)
    return q.status === 'error' && q.error.code !== 'NOT_FOUND' ? (
      <ErrorState message="Couldn't load this 3D model request." onRetry={q.refetch} className="py-24" />
    ) : (
      <EmptyState icon={FileX} title="Request not found" body={REQUEST_NOT_FOUND} action={<ButtonLink to={modelRequestsAdminPath()}>Back to 3D requests</ButtonLink>} className="py-24" />
    )
  return <RequestView r={q.data} onChanged={q.refetch} />
}

const OPEN = new Set(['requested', 'in_progress'])

function RequestView({ r, onChanged }: { r: ModelRequestDetail; onChanged: () => void }) {
  const prefs = usePreferences()
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
      toast.error(action === 'start' ? 'Work was not started' : action === 'deliver' ? 'The model was not delivered' : 'The request was not declined', res.error.message)
      onChanged()
      return
    }
    setDialog(null)
    const t = reviewToast(action, res.data)
    if (t.tone === 'error') toast.error(t.title)
    else toast.success(t.title)
    onChanged()
  }

  const onModel = async (format: ModelFormat, asset: ModelAsset | undefined) => {
    const res = asset ? await service.stageModelFile(r.id, format, asset) : await service.unstageModelFile(r.id, format)
    if (!res.ok) toast.error(asset ? 'The file was not added to the request' : 'The file was not removed', res.error.message)
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
        breadcrumbs={[{ label: '3D requests', to: modelRequestsAdminPath() }, { label: productName }]}
        meta={
          <>
            <ModelRequestStatusBadge status={r.status} />
            <Link to={businessAdminPath(r.businessId)} className="text-[length:var(--text-ui-small)] font-medium text-ink hover:underline">
              {r.businessName}
            </Link>
            <span className="text-[length:var(--text-ui-small)] text-ink-muted">Target: {optionName ? `Option ${optionName}` : 'Product'}</span>
            <span className="text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
              Requested by {r.requestedByLabel ?? 'the business'} on {formatDate(r.createdAt, 'en', prefs)}
            </span>
          </>
        }
        actions={
          open ? (
            <div className="flex flex-wrap gap-2">
              {r.status === 'requested' && (
                <Button icon={<Play className="size-4" aria-hidden />} loading={start.pending} onClick={async () => report('start', await start.mutate())}>
                  Start work
                </Button>
              )}
              <Button variant="secondary" className="border-danger! text-danger! hover:bg-danger-soft!" icon={<X className="size-4" aria-hidden />} onClick={() => setDialog('decline')}>
                Decline
              </Button>
              {r.status === 'in_progress' && r.staged.glb && (
                <Button variant="primary" icon={<Check className="size-4" aria-hidden />} onClick={() => setDialog('deliver')}>
                  Deliver model
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {r.status === 'rejected' && r.reason && (
        <InlineNotice tone="warning" className="mb-6">
          <strong className="font-medium">Declined</strong>
          {r.closedAt ? ` on ${formatDate(r.closedAt, 'en', prefs)}` : ''}. Reason: {r.reason}
        </InlineNotice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <PanelHeader title={`Photos (${r.photos.length})`} actions={sample ? <Badge tone="neutral">{SAMPLE_PHOTOS}</Badge> : undefined} />
            <CardBody className="pt-0">
              {sessionOnly && (
                <InlineNotice tone="info" className="mb-4">
                  {DEMO_SESSION_PHOTOS}
                </InlineNotice>
              )}
              {r.photos.length === 0 ? (
                <p className="text-ui-body text-ink-muted">This request has no photos.</p>
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
            <PanelHeader title="Model files" description={open ? undefined : 'Files can be added only while the request is open.'} />
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
                />
              ) : (
                <p className="text-ui-body text-ink-muted">{r.status === 'delivered' ? 'The delivered files are now the product’s 3D files (see Product facts).' : 'No files were delivered.'}</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <section aria-label="Product facts">
              <PanelHeader title="Product facts" />
              <CardBody className="pt-0">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui-body">
                  <Fact label="Width">{`${r.product.dimensions.width} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label="Height">{`${r.product.dimensions.height} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label="Depth">{`${r.product.dimensions.depth} ${r.product.dimensions.unit}`}</Fact>
                  <Fact label="Material">{r.product.material.en || '—'}</Fact>
                  <Fact label="Category">{r.product.category.charAt(0).toUpperCase() + r.product.category.slice(1)}</Fact>
                  <Fact label="Note from the business">{r.note || 'No note.'}</Fact>
                  <Fact label={optionName ? `Current 3D files (${optionName})` : 'Current 3D files'}>
                    {targetModels.glb || targetModels.usdz ? (
                      <ul>
                        {(['glb', 'usdz'] as const).flatMap((f) => {
                          const m = targetModels[f]
                          return m ? [<li key={f} className="break-all">{m.fileName}{m.sizeBytes ? ` · ${formatFileSize(m.sizeBytes)}` : ''}</li>] : []
                        })}
                      </ul>
                    ) : (
                      'No 3D files yet'
                    )}
                  </Fact>
                  <Fact label="Readiness">
                    <span title={AR_READINESS_HINT[readiness]}>{AR_READINESS_LABEL[readiness]}</span>
                  </Fact>
                </dl>
              </CardBody>
            </section>
          </Card>

          <Card>
            <section aria-label="History">
              <PanelHeader title="History" />
              <CardBody className="pt-0">
                {r.history.length === 0 ? (
                  <p className="text-ui-body text-ink-muted">No events yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {r.history.map((e, i) => (
                      <li key={`${e.type}-${e.at}-${i}`} className="text-ui-body">
                        <p className="font-medium text-ink">{eventLabel(e.type)}</p>
                        <p className="text-ui-small text-ink-muted tabular-nums">
                          {formatDateTime(e.at, 'en', prefs)}
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
