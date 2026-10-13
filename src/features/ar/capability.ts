// Which AR path a device gets (design/09, ADR-0018). Capability-based, not user-agent based:
// - webxr:  our own WebXR session (Chrome on ARCore Android): tap-to-place, explicit Move/Rotate/Reset.
// - native: <model-viewer> hands off to AR Quick Look (iOS) or Scene Viewer (Android); their own controls.
// - none:   3D viewer + dimensions only, with an honest explanation.
export type ArMode = { mode: 'webxr' | 'native' | 'checking' } | { mode: 'none'; reason: 'no-model' | 'model-error' | 'unsupported' }

export interface ArEnvironment {
  hasModel: boolean
  modelState: 'none' | 'loading' | 'loaded' | 'error'
  /** navigator.xr.isSessionSupported('immersive-ar'); null while unknown. */
  webxrAR: boolean | null
  /** <model-viewer>.canActivateAR with ar-modes "scene-viewer quick-look". */
  nativeAR: boolean
  /** Our WebXR session could not start (permission, missing ARCore feature...). */
  webxrFailed?: boolean
}

export function chooseArMode(env: ArEnvironment): ArMode {
  if (!env.hasModel || env.modelState === 'none') return { mode: 'none', reason: 'no-model' }
  if (env.modelState === 'error') return { mode: 'none', reason: 'model-error' }
  if (env.modelState === 'loading' || env.webxrAR === null) return { mode: 'checking' }
  if (env.webxrAR && !env.webxrFailed) return { mode: 'webxr' }
  if (env.nativeAR) return { mode: 'native' }
  return { mode: 'none', reason: 'unsupported' }
}

/** True when the browser can run an immersive AR WebXR session. Never throws. */
export async function detectWebXrAr(): Promise<boolean> {
  try {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr
    return !!xr && (await xr.isSessionSupported('immersive-ar'))
  } catch {
    return false
  }
}
