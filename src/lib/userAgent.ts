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

// Order matters: Edge, Opera and Samsung Internet also say "Chrome"; Chrome on iOS says "Safari"; every iOS browser is WebKit.
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\/|Chromium\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\/|Mobile\/\w+ Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
]

/** "Chrome on Windows", "Safari on iPhone" from a stored user-agent string; "Unknown device" when it cannot tell. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? 'Unknown device'
}
