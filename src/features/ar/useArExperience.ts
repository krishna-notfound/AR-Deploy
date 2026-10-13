import { useEffect, useRef, useState } from 'react'
import { type ArMode, type ArPreference, CUSTOM_WEBXR_ENABLED, chooseArMode, detectWebXrAr } from './capability'
import { type PlacementState, initialPlacement } from './placement'
import type { ArSessionController } from './webxrSession'

type SessionModule = typeof import('./webxrSession')

export interface ArSessionView {
  active: boolean
  state: PlacementState
  loading: boolean
  error: string | null
}

// Chrome says immersive-ar is supported on phones without ARCore; the session then fails with
// NotSupportedError. Remember that for a week so the next visit goes straight to the native viewer.
const UNAVAILABLE_KEY = 'arfurn:webxrUnavailable'
const UNAVAILABLE_FOR_MS = 7 * 86_400_000

function rememberedUnavailable(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(UNAVAILABLE_KEY) ?? 0) < UNAVAILABLE_FOR_MS
  } catch {
    return false
  }
}

/** True when the session was ended by the user (back button, cancelled prompt) rather than failing. */
const isCancel = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'

/**
 * Chooses the AR path for this device and runs our WebXR session when that is the path.
 * Native AR (Quick Look / Scene Viewer) is launched by the caller through <model-viewer>.
 */
export function useArExperience({
  glbUrl,
  modelState,
  nativeAR,
  nativeFailed = false,
  prefer,
  overlayRoot,
  messages,
}: {
  glbUrl: string | undefined
  modelState: 'none' | 'loading' | 'loaded' | 'error'
  nativeAR: boolean
  nativeFailed?: boolean
  prefer?: ArPreference
  overlayRoot: React.RefObject<HTMLDivElement | null>
  messages: { modelFailed: string }
}) {
  // Custom session off: never probe or preload it; AR goes straight to <model-viewer>.
  const [webxrAR, setWebxrAR] = useState<boolean | null>(CUSTOM_WEBXR_ENABLED ? null : false)
  const [remembered] = useState(rememberedUnavailable)
  /** Failed on this page view (drives the "could not start" notice; a remembered failure stays silent). */
  const [webxrFailed, setWebxrFailed] = useState(false)
  const [view, setView] = useState<ArSessionView>({ active: false, state: initialPlacement(), loading: true, error: null })
  const controller = useRef<ArSessionController | null>(null)
  const moduleRef = useRef<SessionModule | null>(null)

  useEffect(() => {
    if (!CUSTOM_WEBXR_ENABLED) return
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

  const mode: ArMode = chooseArMode({ hasModel: !!glbUrl, modelState, webxrAR, nativeAR, webxrFailed: webxrFailed || remembered, nativeFailed, prefer })

  /** Starts our WebXR session. Resolves false when it could not start (the caller then offers the native viewer). */
  const startWebXr = async (): Promise<boolean> => {
    const root = overlayRoot.current
    if (!glbUrl || !root || controller.current) return false
    // The DOM overlay root must be visible when the session starts; our controls render into it only once
    // the session exists, so nothing dead is shown during the camera / ARCore prompts.
    root.hidden = false
    try {
      const mod = moduleRef.current ?? (await import('./webxrSession'))
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
      setView((v) => ({ ...v, active: true, error: null }))
      return true
    } catch (err) {
      root.hidden = true
      setView((v) => ({ ...v, active: false }))
      if (isCancel(err)) return false
      if (err instanceof DOMException && err.name === 'NotSupportedError') {
        try {
          localStorage.setItem(UNAVAILABLE_KEY, String(Date.now()))
        } catch {
          /* private mode: remembered for this page only */
        }
      }
      setWebxrFailed(true)
      return false
    }
  }

  return { mode, view, controller, startWebXr, webxrFailed }
}
