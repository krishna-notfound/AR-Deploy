import { Box, ImageOff, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { Badge, ProductStatusBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/States'
import { Skeleton } from '@/components/ui/Skeleton'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { editorShowcaseEditPath, editorShowcaseNewPath } from '@/lib/urls'
import { useFormat } from '@/lib/useFormat'
import { type ShowcasePiece, useShowcasePieces } from './useShowcasePieces'

/** /admin/editor/showcase: the admin's own pieces for the landing page (ADR-0047), each opening the shared product editor. */
export default function ShowcaseScreen() {
  const { t } = useI18n()
  const showcase = useShowcasePieces()
  const newButton = (
    <ButtonLink to={editorShowcaseNewPath()} variant="primary" icon={<Plus className="size-4" aria-hidden />}>
      {t('editor.showcase.new')}
    </ButtonLink>
  )

  return (
    <section aria-labelledby="showcase-heading" className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="showcase-heading" className="text-ui-card font-medium text-ink">
            {t('editor.menu.showcase')}
          </h2>
          <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.showcase.help')}</p>
        </div>
        {showcase.status === 'ready' && showcase.pieces.length > 0 && newButton}
      </div>

      <div className="mt-6">
        {showcase.status === 'loading' && (
          <div role="status" aria-label={t('common.loading')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        )}
        {showcase.status === 'error' && <ErrorState message={errorText(showcase.error, t)} onRetry={showcase.retry} retryLabel={t('common.retry')} />}
        {showcase.status === 'ready' &&
          (showcase.pieces.length === 0 ? (
            <div className="border border-dashed border-line-strong bg-surface px-5 py-8 text-center">
              <p className="mx-auto max-w-md text-ui-body text-ink-muted">{t('editor.showcase.empty')}</p>
              <div className="mt-4 flex justify-center">{newButton}</div>
            </div>
          ) : (
            <ul aria-label={t('editor.showcase.list')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {showcase.pieces.map((p) => (
                <li key={p.id}>
                  <PieceCard piece={p} />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  )
}

function PieceCard({ piece }: { piece: ShowcasePiece }) {
  const { t } = useI18n()
  const format = useFormat()
  return (
    <Link
      to={editorShowcaseEditPath(piece.id)}
      aria-label={t('editor.showcase.open', { name: piece.name })}
      className="group block h-full border border-line bg-surface transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-subtle">
        {piece.image ? (
          <img src={piece.image} alt="" width={400} height={300} loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-2 text-ui-small text-ink-muted">
            <ImageOff className="size-5" aria-hidden />
            {t('editor.showcase.noPhoto')}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-ui-body font-medium text-ink group-hover:underline group-hover:underline-offset-2">{piece.name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ProductStatusBadge status={piece.published ? 'published' : 'draft'} />
          {piece.hasModel && (
            <Badge tone="accent">
              <Box className="size-3" aria-hidden />
              {t('editor.showcase.chip3d')}
            </Badge>
          )}
        </div>
        <p className="mt-2 text-ui-small text-ink-muted">{t('editor.showcase.updated', { date: format.date(piece.updatedAt) })}</p>
      </div>
    </Link>
  )
}
