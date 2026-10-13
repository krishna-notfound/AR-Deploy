import { useEffect, useRef, useState } from 'react'
import { type ArMode, chooseArMode, detectWebXrAr } from './capability'
import { type PlacementState, initialPlacement } from './placement'
import type { ArSessionController } from './webxrSession'

type SessionModule = typeof import('./webxrSession')

export interface ArSessionView {
  active: boolean
  state: PlacementState
  loading: boolean
  error: string | null
}

/**
 * Chooses the AR path for this device and runs our WebXR session when that is the path.
 * Native AR (Quick Look / Scene Viewer) is launched by the caller through <model-viewer>.
 */
export function useArExperience({
  glbUrl,
  modelState,
  nativeAR,
  overlayRoot,
  messages,
}: {
  glbUrl: string | undefined
  modelState: 'none' | 'loading' | 'loaded' | 'error'
  nativeAR: boolean
  overlayRoot: React.RefObject<HTMLDivElement | null>
  messages: { modelFailed: string }
}) {
  const [webxrAR, setWebxrAR] = useState<boolean | null>(null)
  const [webxrFailed, setWebxrFailed] = useState(false)
  const [view, setView] = useState<ArSessionView>({ active: false, state: initialPlacement(), loading: true, error: null })
  const controller = useRef<ArSessionController | null>(null)
  const moduleRef = useRef<SessionModule | null>(null)

  useEffect(() => {
    let alive = true
    void detectWebXrAr().then((ok) => alive && setWebxrAR(ok))
    return () => {
      alive = false
    }
  }, [])

  // Preload the WebXR code as soon as we know it will be used, so the tap can start the session at once
  // (requestSession must run while the tap still counts as a user gesture).
  useEffect(() => {
    if (webxrAR && !moduleRef.current) void import('./webxrSession').then((m) => (moduleRef.current = m))
  }, [webxrAR])

  // Leave the session if the page goes away.
  useEffect(() => () => controller.current?.exit(), [])

  const mode: ArMode = chooseArMode({ hasModel: !!glbUrl, modelState, webxrAR, nativeAR, webxrFailed })

  /** Starts our WebXR session. Resolves false when it could not start (the caller then offers the native viewer). */
  const startWebXr = async (): Promise<boolean> => {
    const root = overlayRoot.current
    if (!glbUrl || !root) return false
    root.hidden = false // the DOM overlay root must be visible when the session starts
    try {
      const mod = moduleRef.current ?? (await import('./webxrSession'))
      setView({ active: true, state: initialPlacement(), loading: true, error: null })
      controller.current = await mod.startArSession({
        glbUrl,
        overlayRoot: root,
        onState: (state, loading) => setView((v) => ({ ...v, state, loading })),
        onEnd: ({ error, state }) => {
          // Real-device testing: open the page with ?ardebug to log time to first placement, failed taps, moves, turns.
          if (new URLSearchParams(location.search).has('ardebug')) console.info('[ar] session metrics', state.metrics)
          controller.current = null
          root.hidden = true
          setView((v) => ({ ...v, active: false, error: error === 'model' ? messages.modelFailed : null }))
          if (error) setWebxrFailed(true)
        },
      })
      return true
    } catch {
      root.hidden = true
      setView((v) => ({ ...v, active: false }))
      setWebxrFailed(true)
      return false
    }
  }

  return { mode, view, controller, startWebXr, webxrFailed }
}
