// The optional PDF catalogue of the application form (ADR-0050): choose a file, it uploads at once (the form sends only its
// storage path), the file name shows with a Remove button. The upload itself lives in ApplyForm; this is the control.
import { FileText, Loader2, X } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, useFieldProps } from '@/components/ui/Form'
import type { ResolvedField } from '@/domain/siteContent'
import { CATALOGUE_MAX_BYTES, formatMb } from '@/lib/files'
import { isDemoMode } from '@/services'
import type { FieldCtx } from './ApplyFields'

export function CatalogueField({ field, ctx }: { field: ResolvedField; ctx: FieldCtx }) {
  const { tx, errors, catalogue } = ctx
  const label = tx.text('apply.f.catalogue')
  const hint = [tx.text('apply.catalogue.hint', { max: formatMb(CATALOGUE_MAX_BYTES) }), isDemoMode ? tx.text('apply.catalogue.demo') : ''].filter(Boolean).join(' ')
  return (
    <FormField label={label} required={field.required} optional={field.required ? undefined : tx.text('apply.optional')} hint={hint} error={errors.catalogue}>
      <Control ctx={ctx} onPick={catalogue.pick} />
    </FormField>
  )
}

function Control({ ctx, onPick }: { ctx: FieldCtx; onPick: (file: File) => void }) {
  const { draft, tx, catalogue } = ctx
  const field = useFieldProps()
  const input = useRef<HTMLInputElement>(null)
  const has = !!draft.cataloguePath && !catalogue.uploading
  const name = draft.catalogueName || 'catalogue.pdf'
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      {/* Visually hidden but labelled by the field label, so the label and assistive technology still reach the file input. */}
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        disabled={catalogue.disabled || catalogue.uploading}
        {...field}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
      {catalogue.uploading ? (
        <p role="status" className="flex min-w-0 items-center gap-2 text-sm text-ink-body">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          <span className="min-w-0 break-all">{tx.text('apply.catalogue.uploading', { name: catalogue.name })}</span>
        </p>
      ) : has ? (
        <>
          <p className="flex min-w-0 items-center gap-2 border border-line-strong px-3 py-2 text-sm text-ink">
            <FileText className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="min-w-0 break-all">{name}</span>
          </p>
          <Button size="sm" className="pointer-coarse:min-h-11" onClick={catalogue.remove} aria-label={tx.text('apply.catalogue.removeFile', { name })} icon={<X className="size-4" aria-hidden />}>
            {tx.text('apply.catalogue.remove')}
          </Button>
        </>
      ) : (
        <Button className="min-h-11" disabled={catalogue.disabled} onClick={() => input.current?.click()}>
          {tx.text('apply.catalogue.choose')}
        </Button>
      )}
    </div>
  )
}
