// Launch of the phone's AR (ADR-0035, owner 2026-10-26, amends ADR-0021): Android opens AR inside Chrome first
// (model-viewer's activateAR() with ar-modes "webxr scene-viewer quick-look", the flow the owner tested and that worked
// on their phones; Google Scene Viewer showed a black screen there even for Google's own sample). Apple AR Quick Look
// on iPhone/iPad with an uploaded USDZ. Everything else keeps model-viewer's activateAR() (in-app browsers, desktop,
// and iPhones without an uploaded USDZ, where model-viewer builds one on the phone).
import { detectInAppBrowser, isAndroid, isIOS } from '@/lib/userAgent'

export type NativeArRoute = 'scene-viewer' | 'quick-look' | 'model-viewer'

/** Android: AR inside Chrome first (model-viewer WebXR), Scene Viewer only as model-viewer's fallback (ADR-0035). */
export const ANDROID_WEBXR_FIRST = true

export function nativeArRoute(hasUsdz: boolean, ua: string = navigator.userAgent, androidWebXrFirst: boolean = ANDROID_WEBXR_FIRST): NativeArRoute {
  // In-app browsers swallow intents and have no rel="ar": keep model-viewer and its honest failure messages.
  if (detectInAppBrowser(ua)) return 'model-viewer'
  if (isAndroid(ua)) return androidWebXrFirst ? 'model-viewer' : 'scene-viewer'
  if (isIOS(ua) && hasUsdz) return 'quick-look'
  return 'model-viewer'
}

/** The two hand-offs, as methods so tests can watch them (jsdom cannot navigate to an intent). */
export const nativeAr = {
  /** Leaves the page for the Scene Viewer intent. Must run inside the tap (user activation). */
  navigate(url: string): void {
    window.location.href = url
  },
  /** Opens AR Quick Look: Safari needs an `<a rel="ar">` whose first child is an `<img>`. */
  openQuickLook(href: string): void {
    const a = document.createElement('a')
    a.rel = 'ar'
    a.href = href
    a.appendChild(document.createElement('img'))
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1000)
  },
}
