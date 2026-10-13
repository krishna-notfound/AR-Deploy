import { Move, RotateCcw, RotateCw, Undo2, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { type PlacementState, hintFor } from './placement'

export interface ArOverlayHandlers {
  onPlace: () => void
  onMove: () => void
  onCancelMove: () => void
  onRotate: (dir: 1 | -1) => void
  onReset: () => void
  onExit: () => void
}

/**
 * Controls drawn over the camera during our WebXR session (WebXR DOM overlay).
 * One instruction at a time, one primary action per phase, large targets within the safe areas.
 * Every control carries data-xr-control so a tap on it is never also treated as "place here".
 */
export function ArSessionOverlay({
  state,
  loading,
  error,
  dims,
  scaleVerified,
  ...on
}: ArOverlayHandlers & { state: PlacementState; loading: boolean; error: string | null; dims: string; scaleVerified: boolean }) {
  const { t } = useI18n()
  const hint = error ?? t(loading ? 'ar.session.loading' : hintFor(state))
  const placing = !loading && (state.phase === 'scanning' || state.phase === 'aiming' || state.phase === 'moving')
  const placed = !loading && state.phase === 'placed'

  return (
    <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 text-white" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="flex items-start justify-between gap-3">
        <p role="status" aria-live="polite" className={cn('pointer-events-auto max-w-[75%] rounded-2xl bg-black/60 px-4 py-2.5 text-[15px] leading-snug', error && 'bg-[#8f2b20]/85')}>
          {hint}
        </p>
        <Control aria-label={t('ar.session.exit')} onClick={on.onExit} className="size-12 rounded-full">
          <X className="size-5" aria-hidden />
        </Control>
      </div>

      <div className="pointer-events-auto mx-auto w-full max-w-sm space-y-3">
        <p className="flex items-center justify-center gap-2 text-[13px]">
          <span className="rounded-full bg-black/60 px-3 py-1 tabular-nums">{dims}</span>
          <span className={cn('rounded-full px-3 py-1', scaleVerified ? 'bg-black/60' : 'bg-[#8f5a0b]/85')}>
            {scaleVerified ? t('ar.session.trueSize') : t('ar.session.sizeUnverified')}
          </span>
        </p>

        {placing && (
          <div className="flex gap-2">
            {state.phase === 'moving' && (
              <Control onClick={on.onCancelMove} className="h-14 flex-1 rounded-full">
                {t('ar.session.cancel')}
              </Control>
            )}
            <button
              type="button"
              data-xr-control=""
              disabled={!state.surface || state.trackingLost}
              onClick={on.onPlace}
              className="h-14 flex-[2] rounded-full bg-white text-[16px] font-medium text-[#161616] disabled:bg-white/40 disabled:text-[#161616]/60"
            >
              {t('ar.session.place')}
            </button>
          </div>
        )}

        {placed && (
          <div className="grid grid-cols-4 gap-2">
            <Control aria-label={t('ar.session.rotateLeft')} onClick={() => on.onRotate(-1)} className="h-14 rounded-2xl">
              <RotateCcw className="size-5" aria-hidden />
            </Control>
            <Control onClick={on.onMove} className="h-14 rounded-2xl bg-white text-[#161616] hover:bg-white">
              <Move className="size-4" aria-hidden />
              {t('ar.session.move')}
            </Control>
            <Control aria-label={t('ar.session.rotateRight')} onClick={() => on.onRotate(1)} className="h-14 rounded-2xl">
              <RotateCw className="size-5" aria-hidden />
            </Control>
            <Control aria-label={t('ar.session.reset')} onClick={on.onReset} className="h-14 rounded-2xl">
              <Undo2 className="size-5" aria-hidden />
            </Control>
          </div>
        )}
      </div>
    </div>
  )
}

function Control({ className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      data-xr-control=""
      className={cn('pointer-events-auto inline-flex items-center justify-center gap-1.5 bg-black/60 text-[15px] font-medium text-white', className)}
      {...rest}
    >
      {children}
    </button>
  )
}
