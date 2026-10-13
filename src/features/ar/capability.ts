// Which AR path a device gets (design/09, ADR-0018). Capability-based, not user-agent based:
// - webxr:  our own WebXR session (Chrome on Android): tap-to-place, explicit Move/Rotate/Reset.
// - native: <model-viewer> hands off to AR Quick Look (iOS) or Scene Viewer (Android); their own controls.
// - none:   3D viewer + dimensions only, with an honest explanation.
// Note: Chrome reports immersive-ar on every Android 7+ phone, ARCore or not (audit, AR_COMPATIBILITY_AND_PHYSICS §2),
// so "webxr" can still fail at start; that failure is remembered and the native viewer is used instead.
export type ArMode =
  | { mode: 'webxr' | 'checking' }
  /** webxrBeta: our WebXR session is also available, offered as a secondary "precise placement" option. */
  | { mode: 'native'; webxrBeta: boolean }
  | { mode: 'none'; reason: 'no-model' | 'model-error' | 'unsupported' | 'failed' }

export type ArPreference = 'webxr' | 'native'

/**
 * Which path wins when both are available. Native-first matches the contract (Scene Viewer on Android)
 * and avoids WebXR on non-ARCore phones, but it changes client-visible behaviour: it stays 'webxr'
 * until the client approves (System_arch/audit/APPROVAL_REQUIRED.md, A-1).
 */
export const AR_DEFAULT_PREFERENCE: ArPreference = 'webxr'

export interface ArEnvironment {
  hasModel: boolean
  modelState: 'none' | 'loading' | 'loaded' | 'error'
  /** navigator.xr.isSessionSupported('immersive-ar'); null while unknown. */
  webxrAR: boolean | null
  /** <model-viewer>.canActivateAR with ar-modes "scene-viewer quick-look". */
  nativeAR: boolean
  /** Our WebXR session could not start (permission, ARCore unavailable...). */
  webxrFailed?: boolean
  /** The native viewer reported ar-status "failed" (e.g. Google app missing); model-viewer then refuses to launch. */
  nativeFailed?: boolean
  prefer?: ArPreference
}

export function chooseArMode(env: ArEnvironment): ArMode {
  if (!env.hasModel || env.modelState === 'none') return { mode: 'none', reason: 'no-model' }
  if (env.modelState === 'error') return { mode: 'none', reason: 'model-error' }
  if (env.modelState === 'loading' || env.webxrAR === null) return { mode: 'checking' }
  const webxr = env.webxrAR && !env.webxrFailed
  const native = env.nativeAR && !env.nativeFailed
  if ((env.prefer ?? AR_DEFAULT_PREFERENCE) === 'native') {
    if (native) return { mode: 'native', webxrBeta: webxr }
    if (webxr) return { mode: 'webxr' }
  } else {
    if (webxr) return { mode: 'webxr' }
    if (native) return { mode: 'native', webxrBeta: false }
  }
  return { mode: 'none', reason: env.webxrFailed || env.nativeFailed ? 'failed' : 'unsupported' }
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
