export type InAppBrowser = 'instagram' | 'facebook' | 'whatsapp'

/** Best-effort detection. In-app browsers may limit AR; this never guarantees it. */
export function detectInAppBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): InAppBrowser | null {
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook'
  if (/WhatsApp/i.test(ua)) return 'whatsapp'
  return null
}

export function isIOS(ua: string = navigator.userAgent): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
}

export function isAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/i.test(ua)
}
