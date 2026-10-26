// Direct launch of the phone's own AR viewer (ADR-0021, owner 2026-10-26): Google Scene Viewer on Android, Apple AR
// Quick Look on iPhone/iPad. No WebXR. Everything else keeps model-viewer's activateAR() (in-app browsers, desktop,
// and iPhones without an uploaded USDZ, where model-viewer builds one on the phone).
import { detectInAppBrowser, isAndroid, isIOS } from '@/lib/userAgent'

export type NativeArRoute = 'scene-viewer' | 'quick-look' | 'model-viewer'

export function nativeArRoute(hasUsdz: boolean, ua: string = navigator.userAgent): NativeArRoute {
  // In-app browsers swallow intents and have no rel="ar": keep model-viewer and its honest failure messages.
  if (detectInAppBrowser(ua)) return 'model-viewer'
  if (isAndroid(ua)) return 'scene-viewer'
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
