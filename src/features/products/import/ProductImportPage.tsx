import { Building2, Download, FileUp, Upload } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { FormField, Select, Textarea } from '@/components/ui/Form'
import { EmptyState, ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import type { FieldMessage } from '@/i18n/fieldMessage'
import { errorText, fieldText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { downloadDataUrl } from '@/lib/download'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { useBusinesses } from '../useCatalogData'
import { describeErrors, editPath } from '../useProductActions'
import { ImportPreviewTable } from './ImportPreviewTable'
import { useCategories, useCurrencies } from '@/services/listsHooks'
import { MAX_IMPORT_ROWS, type PreparedRow, prepareImport, rowsFromCsv, templateCsv } from './importRows'

type ImportScope = 'admin' | 'business'

/** A row that was not created, and why. */
interface NotCreated {
  index: number
  name: string
  reasons: string[]
}

type Run =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number; created: Product[]; notCreated: NotCreated[] }
  | { status: 'done'; cancelled: boolean; created: Product[]; notCreated: NotCreated[] }

const TEMPLATE_FILE = 'sanctus-products-template.csv'

function downloadTemplate() {
  // The BOM makes Excel read the accents as UTF-8.
  const href = URL.createObjectURL(new Blob(['﻿', templateCsv()], { type: 'text/csv;charset=utf-8' }))
  try {
    downloadDataUrl(href, TEMPLATE_FILE)
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 0)
  }
}

/**
 * Add many products at once from a CSV (ADR-0051), shared by both dashboards. The admin picks the business first; a business
 * admin imports into their own. Every row becomes a draft with no photos and no 3D files; nothing is published.
 */
export default function ProductImportPage({ scope }: { scope: ImportScope }) {
  const { t } = useI18n()
  const { business: ownBusiness } = useAccount()
  const businesses = useBusinesses()
  const [params] = useSearchParams()
  const [picked, setPicked] = useState(params.get('business') ?? '')

  const base = scope === 'admin' ? '/admin/products' : '/dashboard/products'
  const crumbs = [{ label: t(scope === 'admin' ? 'nav.allProducts' : 'nav.myProducts'), to: base }, { label: t('products.import.title') }]
  const header = <PageHeader title={t('products.import.title')} description={t('products.import.lead')} breadcrumbs={crumbs} />

  if (scope === 'admin') {
    if (businesses.query.status === 'loading' && !businesses.query.data) return <FullPageSpinner />
    if (businesses.query.status === 'error' && !businesses.query.data)
      return <ErrorState message={`${t('products.editor.businessesFailed')} ${errorText(businesses.query.error, t)}`} onRetry={businesses.query.refetch} retryLabel={t('common.retry')} />
    if (businesses.list.length === 0)
      return (
        <>
          {header}
          <Card>
            <EmptyState
              icon={Building2}
              title={t('products.editor.needBusinessTitle')}
              body={t('products.editor.needBusinessBody')}
              action={
                <ButtonLink to="/admin/businesses/new" variant="primary">
                  {t('products.editor.createBusiness')}
                </ButtonLink>
              }
            />
          </Card>
        </>
      )
    const business = businesses.list.find((b) => b.id === picked) ?? businesses.list[0]!
    return <ImportWorkspace scope={scope} header={header} business={business} businesses={businesses.list} onPick={setPicked} />
  }

  if (!ownBusiness) return <FullPageSpinner />
  return <ImportWorkspace scope={scope} header={header} business={ownBusiness} />
}

function ImportWorkspace({
  scope,
  header,
  business,
  businesses,
  onPick,
}: {
  scope: ImportScope
  header: ReactNode
  business: Business
  /** The admin chooses among these; a business admin has none. */
  businesses?: Business[]
  onPick?: (id: string) => void
}) {
  const { t, tn } = useI18n()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState(false)
  const [run, setRun] = useState<Run>({ status: 'idle' })
  const cancelled = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const running = run.status === 'running'

  // The business's current slugs, so the drafts get free addresses.
  const existing = useServiceQuery(() => service.getProductsByBusiness(business.id), [business.id])

  // The category and currency lists are managed in the admin console (ADR-0055): the file is read against them.
  const categoryList = useCategories()
  const currencyList = useCurrencies()
  const parsed = useMemo(
    () => (text.trim() ? rowsFromCsv(text, { categories: categoryList.categories, currencies: currencyList.currencies }) : null),
    [text, categoryList.categories, currencyList.currencies],
  )
  const prepared: PreparedRow[] = useMemo(
    () =>
      parsed && existing.data
        ? prepareImport(parsed.rows, parsed.problems, { businessId: business.id, defaultCurrency: business.defaultCurrency, existingSlugs: existing.data.map((p) => p.slug) })
        : [],
    [parsed, existing.data, business.id, business.defaultCurrency],
  )
  const ready = prepared.filter((p) => p.errors.length === 0)

  // Leaving the page stops the import after the row being saved.
  useEffect(
    () => () => {
      cancelled.current = true
    },
    [],
  )

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setFileError(false)
    try {
      setText(await file.text())
      setFileName(file.name)
      setRun({ status: 'idle' })
    } catch {
      setFileError(true)
    }
    // The same file can be chosen again after a change.
    if (fileInput.current) fileInput.current.value = ''
  }

  const reset = () => {
    setText('')
    setFileName('')
    // The drafts just created take their addresses: the next file must see them.
    if (run.status === 'done') existing.refetch()
    setRun({ status: 'idle' })
  }

  const create = useCallback(async () => {
    cancelled.current = false
    const skipped: NotCreated[] = prepared.filter((p) => p.errors.length > 0).map((p) => ({ index: p.index, name: p.row.name.en, reasons: p.errors.map((e: FieldMessage) => fieldText(e, t) ?? '') }))
    const created: Product[] = []
    const notCreated: NotCreated[] = [...skipped]
    const todo = prepared.filter((p) => p.errors.length === 0)
    setRun({ status: 'running', done: 0, total: todo.length, created: [], notCreated: [...notCreated] })
    let stopped = false
    for (const p of todo) {
      if (cancelled.current) {
        stopped = true
        break
      }
      const r = await service.createProduct(p.input)
      if (r.ok) created.push(r.data)
      else notCreated.push({ index: p.index, name: p.row.name.en, reasons: [describeErrors(r.error, t)] })
      setRun({ status: 'running', done: created.length + notCreated.length - skipped.length, total: todo.length, created: [...created], notCreated: [...notCreated] })
    }
    notCreated.sort((a, b) => a.index - b.index)
    setRun({ status: 'done', cancelled: stopped, created, notCreated })
  }, [prepared, t])

  const showPreview = parsed && !parsed.fileProblem && run.status !== 'done'
  const waitingForSlugs = !!parsed && !parsed.fileProblem && !existing.data

  return (
    <>
      {header}
      <div className="space-y-6">
        {run.status !== 'done' && (
          <Card>
            <CardHeader title={t('products.import.step1')} description={t('products.import.columnsHint')} actions={
              <Button size="sm" icon={<Download className="size-4" aria-hidden />} onClick={downloadTemplate}>
                {t('products.import.template')}
              </Button>
            } />
            <CardBody className="space-y-4">
              {businesses && onPick && (
                <FormField label={t('admin.products.business')} hint={t('products.import.businessHint')} className="max-w-md">
                  <Select value={business.id} onChange={(e) => onPick(e.target.value)} disabled={running}>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}
              {scope === 'business' && <p className="text-ui-body text-ink-muted">{t('products.import.ownBusiness', { name: business.name })}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} accept=".csv,text/csv,text/plain" aria-label={t('products.import.fileInput')} onChange={(e) => void readFile(e.target.files?.[0])} disabled={running} />
                <Button icon={<Upload className="size-4" aria-hidden />} onClick={() => fileInput.current?.click()} disabled={running}>
                  {t('products.import.chooseFile')}
                </Button>
                {fileName && <span className="min-w-0 text-ui-body break-all text-ink-muted">{fileName}</span>}
              </div>
              {fileError && (
                <p role="alert" className="text-ui-small text-danger">
                  {t('products.import.fileUnreadable')}
                </p>
              )}
              <FormField label={t('products.import.paste')} hint={t('products.import.pasteHint', { max: MAX_IMPORT_ROWS })}>
                <Textarea
                  rows={6}
                  value={text}
                  disabled={running}
                  spellCheck={false}
                  className="font-mono text-ui-small"
                  placeholder={t('products.import.pastePlaceholder')}
                  onChange={(e) => {
                    setText(e.target.value)
                    setFileName('')
                    setRun({ status: 'idle' })
                  }}
                />
              </FormField>
            </CardBody>
          </Card>
        )}

        {parsed?.fileProblem && run.status !== 'done' && (
          <Card>
            <ErrorState message={fieldText(parsed.fileProblem, t) ?? ''} />
          </Card>
        )}

        {showPreview && (
          <Card>
            <CardHeader title={t('products.import.step2')} description={waitingForSlugs ? undefined : t('products.import.summary', { ready: ready.length, total: prepared.length, errors: prepared.length - ready.length })} />
            <CardBody className="space-y-4">
              {existing.status === 'error' && !existing.data ? (
                <ErrorState message={errorText(existing.error, t)} onRetry={existing.refetch} retryLabel={t('common.retry')} />
              ) : waitingForSlugs ? (
                <p className="text-ui-body text-ink-muted" role="status">
                  {t('common.loading')}
                </p>
              ) : (
                <>
                  <ImportPreviewTable rows={prepared} />
                  {prepared.length > ready.length && <p className="text-ui-small text-ink-muted">{t('products.import.skipNote')}</p>}
                  <p className="text-ui-small text-ink-muted">{t('products.import.draftNote')}</p>
                  {running ? (
                    <div className="space-y-2">
                      <div
                        role="progressbar"
                        aria-label={t('products.import.progress')}
                        aria-valuemin={0}
                        aria-valuemax={run.total}
                        aria-valuenow={run.done}
                        className="h-2 overflow-hidden rounded-full bg-subtle"
                      >
                        <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%` }} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p role="status" aria-live="polite" className="text-ui-body text-ink">
                          {t('products.import.progressText', { done: run.done, total: run.total })}
                        </p>
                        <Button
                          onClick={() => {
                            cancelled.current = true
                          }}
                        >
                          {t('products.import.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" icon={<FileUp className="size-4" aria-hidden />} disabled={ready.length === 0} onClick={() => void create()}>
                        {tn('products.import.create', ready.length)}
                      </Button>
                      <Button onClick={reset}>{t('products.import.clear')}</Button>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        )}

        {run.status === 'done' && (
          <Card>
            <CardHeader title={t('products.import.resultTitle')} description={run.cancelled ? t('products.import.resultCancelled') : undefined} />
            <CardBody className="space-y-6">
              <p role="status" className="text-ui-body text-ink">
                {tn('products.import.createdCount', run.created.length)} {run.notCreated.length > 0 && tn('products.import.failedCount', run.notCreated.length)}
              </p>
              {run.created.length > 0 && (
                <section aria-labelledby="import-created">
                  <h3 id="import-created" className="mb-2 text-ui-body font-medium text-ink">
                    {t('products.import.createdTitle')}
                  </h3>
                  <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
                    {run.created.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 break-words text-ui-body text-ink">{p.name.en}</span>
                        <Link to={editPath(scope, p)} className="inline-flex min-h-11 items-center text-ui-body text-accent-ink underline underline-offset-2">
                          {t('products.import.openEditor')}
                          <span className="sr-only"> {p.name.en}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {run.notCreated.length > 0 && (
                <section aria-labelledby="import-failed">
                  <h3 id="import-failed" className="mb-2 text-ui-body font-medium text-ink">
                    {t('products.import.failedTitle')}
                  </h3>
                  <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">
                    {run.notCreated.map((n) => (
                      <li key={n.index} className="px-3 py-2 text-ui-body">
                        <span className="font-medium break-words text-ink">{t('products.import.rowName', { n: n.index + 1, name: n.name || t('products.import.noName') })}</span>
                        <ul className="mt-0.5 list-disc pl-5 text-ui-small text-danger">
                          {n.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="flex flex-wrap gap-2">
                <ButtonLink to={scope === 'admin' ? '/admin/products' : '/dashboard/products'} variant="primary">
                  {t('products.editor.backToProducts')}
                </ButtonLink>
                <Button onClick={reset}>{t('products.import.another')}</Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  )
}
