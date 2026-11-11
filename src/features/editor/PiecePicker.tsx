import { Box, Check, ImageOff } from 'lucide-react'
import { Link } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { Badge } from '@/components/ui/Badge'
import type { ProductRef } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { imageFrame } from '@/lib/imageFrames'
import { editorShowcasePath } from '@/lib/urls'
import { sameRef } from './landingOps'
import type { ShowcasePiece } from './useShowcasePieces'

/** A piece shows its product photo: the 4:5 product frame, shown whole (ADR-0064). */
const PRODUCT_FRAME = imageFrame('product')

/** The piece's name for assistive technology: a draft says so, because visitors do not see it. */
function pieceLabel(piece: ShowcasePiece, draft: string): string {
  return piece.published ? piece.name : `${piece.name} (${draft})`
}

/** A small picture of a piece, or a quiet placeholder when it has no photo. */
export function PieceThumb({ piece, className }: { piece: Pick<ShowcasePiece, 'image'>; className?: string }) {
  return piece.image ? (
    <img src={piece.image} alt="" width={96} height={120} loading="lazy" className={cn('bg-subtle', PRODUCT_FRAME.fitClass, className)} />
  ) : (
    <span className={cn('grid place-items-center bg-subtle text-ink-faint', className)} aria-hidden>
      <ImageOff className="size-4" />
    </span>
  )
}

/** One tappable tile: the piece's photo, name and chips. Used as a radio (single choice) or a checkbox (many). */
function PieceTile({ piece, kind, selected, disabled, onClick }: { piece: ShowcasePiece; kind: 'radio' | 'checkbox'; selected: boolean; disabled?: boolean; onClick: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      role={kind}
      aria-checked={selected}
      aria-label={pieceLabel(piece, t('ui.status.draft'))}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex min-h-11 flex-col overflow-hidden border bg-surface text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-line-strong',
      )}
    >
      <PieceThumb piece={piece} className={cn('w-full', PRODUCT_FRAME.aspectClass)} />
      {selected && (
        <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center bg-ink text-canvas" aria-hidden>
          <Check className="size-3.5" />
        </span>
      )}
      <span className="block min-w-0 space-y-1 p-2">
        <span className="block truncate text-ui-small font-medium text-ink">{piece.name}</span>
        <span className="flex flex-wrap gap-1" aria-hidden>
          {!piece.published && <Badge>{t('ui.status.draft')}</Badge>}
          {piece.hasModel && (
            <Badge tone="accent">
              <Box className="size-3" />
              {t('editor.showcase.chip3d')}
            </Badge>
          )}
        </span>
      </span>
    </button>
  )
}

const GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5'

/**
 * Single choice among the admin's own pieces, as thumbnails. A first "automatic" tile stands for no choice.
 * `value` that is not among `pieces` (the piece was deleted) is shown as a warning, never silently dropped.
 */
export function PiecePicker({
  label,
  pieces,
  value,
  onChange,
  noneLabel,
}: {
  label: string
  pieces: ShowcasePiece[]
  value: ProductRef | undefined
  onChange: (ref: ProductRef | undefined) => void
  noneLabel: string
}) {
  const { t } = useI18n()
  const current = value ? pieces.find((p) => sameRef(p.ref, value)) : undefined
  return (
    <div>
      <div role="radiogroup" aria-label={label} className={GRID}>
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          onClick={() => onChange(undefined)}
          className={cn(
            'flex min-h-11 items-center justify-center border p-2 text-center text-ui-small font-medium text-ink-body transition-colors',
            !value ? 'border-ink bg-subtle ring-2 ring-ink' : 'border-dashed border-line-strong hover:border-ink',
          )}
        >
          {noneLabel}
        </button>
        {pieces.map((p) => (
          <PieceTile key={p.id} piece={p} kind="radio" selected={!!current && current.id === p.id} onClick={() => onChange(p.ref)} />
        ))}
      </div>
      {value && !current && (
        <p role="alert" className="mt-2 text-ui-small text-danger">
          {t('editor.landing.pieceGone')}
        </p>
      )}
      {current && !current.published && (
        <p role="status" className="mt-2 text-ui-small text-warning">
          {t('editor.landing.pieceDraft')}
        </p>
      )}
    </div>
  )
}

/** Many pieces to tick (a collection's products); `disabled` stops new ticks when the limit is reached. */
export function PieceChecklist({ label, pieces, selected, full, onToggle }: { label: string; pieces: ShowcasePiece[]; selected: ProductRef[]; full: boolean; onToggle: (ref: ProductRef) => void }) {
  return (
    <div role="group" aria-label={label} className={GRID}>
      {pieces.map((p) => {
        const on = selected.some((r) => sameRef(r, p.ref))
        return <PieceTile key={p.id} piece={p} kind="checkbox" selected={on} disabled={full && !on} onClick={() => onToggle(p.ref)} />
      })}
    </div>
  )
}

/** What the three landing blocks show while the showcase has no pieces yet: where to add the first one. */
export function NoPiecesPrompt() {
  const { t } = useI18n()
  const can = useCan()
  return (
    <p className="border border-dashed border-line-strong bg-subtle px-4 py-3 text-ui-body text-ink-muted">
      {t('editor.landing.noPieces')}
      {can('products.edit') && (
        <>
          {' '}
          <Link to={editorShowcasePath()} className="font-medium text-ink underline underline-offset-2">
            {t('editor.landing.noPiecesLink')}
          </Link>
        </>
      )}
    </p>
  )
}
