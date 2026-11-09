import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Switch } from '@/components/ui/Form'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { OTHER_CATEGORY, type CategoryItem } from '@/domain/types'
import { errorText, fieldTexts } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { lists } from '@/services'
import type { Result } from '@/services/catalogService'
import { categoryFieldErrors } from '@/services/listsService'
import { reloadLists, useCategories } from '@/services/listsHooks'

type Errors = Record<string, string>

/** Admin console: the product categories (ADR-0055). Add, rename in both languages, reorder, hide and delete. */
export default function CategoriesPage() {
  const { t, tn, lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const { categories, loaded, error, reload } = useCategories()
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const nameOf = (c: CategoryItem) => (lang === 'pt' ? c.labelPt || c.labelEn : c.labelEn)

  /** Runs one change; a refusal becomes a toast, success reloads the shared list. Returns whether it worked. */
  async function change<T>(key: string, run: () => Promise<Result<T>>, onDone?: (data: T) => void): Promise<boolean> {
    setBusy(key)
    try {
      const res = await run()
      if (!res.ok) {
        toast.error(errorText(res.error, t))
        return false
      }
      await reloadLists()
      onDone?.(res.data)
      return true
    } finally {
      setBusy(null)
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const movable = categories.filter((c) => c.slug !== OTHER_CATEGORY).map((c) => c.slug)
    const next = [...movable]
    const j = index + by
    ;[next[index], next[j]] = [next[j]!, next[index]!]
    void change('order', () => lists.reorderCategories(next))
  }

  const remove = async (c: CategoryItem) => {
    const yes = await confirm({
      title: t('admin.lists.categories.deleteTitle', { name: nameOf(c) }),
      body: t('admin.lists.categories.deleteBody'),
      confirmLabel: t('admin.lists.categories.deleteConfirm'),
      destructive: true,
    })
    if (!yes) return
    await change(c.slug, () => lists.deleteCategory(c.slug), ({ moved }) => toast.success(moved > 0 ? tn('admin.lists.categories.deleted', moved) : t('admin.lists.categories.deletedNone')))
  }

  if (!loaded) {
    return error ? <ErrorState message={errorText(error, t)} onRetry={() => void reload()} retryLabel={t('common.retry')} /> : <SkeletonRows rows={6} />
  }

  const own = categories.filter((c) => c.slug !== OTHER_CATEGORY)
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-ui-body text-ink-muted">{t('admin.lists.categories.intro')}</p>

      <AddCategory busy={busy === 'add'} onAdd={(labelEn, labelPt) => change('add', () => lists.saveCategory({ labelEn, labelPt }), (c) => toast.success(t('admin.lists.categories.added', { name: nameOf(c) })))} />

      <Card>
        <CardHeader title={t('admin.lists.categories.listLabel')} />
        <CardBody>
          {own.length === 0 && <p className="mb-3 text-ui-body text-ink-muted">{t('admin.lists.categories.onlyOther')}</p>}
          <ul aria-label={t('admin.lists.categories.listLabel')} className="divide-y divide-line border-y border-line">
            {categories.map((c) => {
              const isOther = c.slug === OTHER_CATEGORY
              const index = own.findIndex((o) => o.slug === c.slug)
              const rowBusy = busy === c.slug || busy === 'order'
              return (
                <li key={c.slug} className="py-3" data-category={c.slug}>
                  {editing === c.slug ? (
                    <EditCategory
                      category={c}
                      onCancel={() => setEditing(null)}
                      onSave={async (labelEn, labelPt) => {
                        const done = await change(c.slug, () => lists.saveCategory({ slug: c.slug, labelEn, labelPt }), () => toast.success(t('admin.lists.categories.saved', { name: lang === 'pt' ? labelPt : labelEn })))
                        if (done) setEditing(null)
                        return done
                      }}
                      busy={busy === c.slug}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                          <span className="[overflow-wrap:anywhere]">{c.labelEn}</span>
                          <span className="font-normal text-ink-muted [overflow-wrap:anywhere]">/ {c.labelPt}</span>
                          {!c.active && <Badge>{t('admin.lists.categories.hidden')}</Badge>}
                        </p>
                        <p className="text-ui-small text-ink-muted">{isOther ? t('admin.lists.categories.otherNote') : t('admin.lists.categories.key', { slug: c.slug })}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {!isOther && (
                          <>
                            <IconButton aria-label={t('admin.lists.categories.moveUp', { name: nameOf(c) })} className="size-11" disabled={rowBusy || index === 0} onClick={() => move(index, -1)}>
                              <ArrowUp className="size-4" aria-hidden />
                            </IconButton>
                            <IconButton aria-label={t('admin.lists.categories.moveDown', { name: nameOf(c) })} className="size-11" disabled={rowBusy || index === own.length - 1} onClick={() => move(index, 1)}>
                              <ArrowDown className="size-4" aria-hidden />
                            </IconButton>
                          </>
                        )}
                        <IconButton aria-label={t('admin.lists.categories.edit', { name: nameOf(c) })} className="size-11" disabled={rowBusy} onClick={() => setEditing(c.slug)}>
                          <Pencil className="size-4" aria-hidden />
                        </IconButton>
                        {!isOther && (
                          <>
                            <div className="flex min-h-11 items-center px-2">
                              <Switch label={t('admin.lists.categories.visible')} checked={c.active} disabled={rowBusy} onChange={(active) => void change(c.slug, () => lists.saveCategory({ slug: c.slug, labelEn: c.labelEn, labelPt: c.labelPt, active }))} />
                            </div>
                            <IconButton aria-label={t('admin.lists.categories.deleteAria', { name: nameOf(c) })} className="size-11 hover:text-danger" disabled={rowBusy} onClick={() => void remove(c)}>
                              <Trash2 className="size-4" aria-hidden />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

function AddCategory({ busy, onAdd }: { busy: boolean; onAdd: (labelEn: string, labelPt: string) => Promise<boolean> }) {
  const { t } = useI18n()
  const [en, setEn] = useState('')
  const [pt, setPt] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problems = clientErrors(en, pt, t)
    setErrors(problems)
    if (Object.keys(problems).length) return
    if (await onAdd(en, pt)) {
      setEn('')
      setPt('')
    }
  }
  return (
    <Card>
      <CardHeader title={t('admin.lists.categories.addTitle')} />
      <CardBody>
        <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <FormField label={t('admin.lists.categories.labelEn')} error={errors.labelEn}>
            <Input value={en} maxLength={60} onChange={(e) => setEn(e.target.value)} />
          </FormField>
          <FormField label={t('admin.lists.categories.labelPt')} error={errors.labelPt}>
            <Input value={pt} maxLength={60} onChange={(e) => setPt(e.target.value)} />
          </FormField>
          <Button type="submit" variant="primary" loading={busy}>
            {t('admin.lists.categories.add')}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}

function EditCategory({ category, busy, onSave, onCancel }: { category: CategoryItem; busy: boolean; onSave: (labelEn: string, labelPt: string) => Promise<boolean>; onCancel: () => void }) {
  const { t } = useI18n()
  const [en, setEn] = useState(category.labelEn)
  const [pt, setPt] = useState(category.labelPt)
  const [errors, setErrors] = useState<Errors>({})
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problems = clientErrors(en, pt, t)
    setErrors(problems)
    if (Object.keys(problems).length) return
    await onSave(en, pt)
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <FormField label={t('admin.lists.categories.labelEn')} error={errors.labelEn}>
        <Input value={en} maxLength={60} onChange={(e) => setEn(e.target.value)} />
      </FormField>
      <FormField label={t('admin.lists.categories.labelPt')} error={errors.labelPt}>
        <Input value={pt} maxLength={60} onChange={(e) => setPt(e.target.value)} />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {t('common.save')}
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** The same label rules the services apply, shown before the request is sent. */
function clientErrors(labelEn: string, labelPt: string, t: ReturnType<typeof useI18n>['t']): Errors {
  return fieldTexts(categoryFieldErrors(labelEn.trim(), labelPt.trim()), t)
}
