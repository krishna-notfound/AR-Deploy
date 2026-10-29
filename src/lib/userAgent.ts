import { type TFn, tEn } from '@/i18n/translate'

export type InAppBrowser = 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'linkedin' | 'snapchat' | 'line' | 'x' | 'google'

/** Display names of the in-app browsers (brand names, the same in every language). */
export const IN_APP_NAME: Record<InAppBrowser, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  snapchat: 'Snapchat',
  line: 'LINE',
  x: 'X',
  google: 'Google',
}

/** Best-effort detection. In-app browsers may limit AR; this never guarantees it. */
export function detectInAppBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): InAppBrowser | null {
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook'
  if (/WhatsApp/i.test(ua)) return 'whatsapp'
  if (/musical_ly|BytedanceWebview|TikTok|\btrill_/i.test(ua)) return 'tiktok'
  if (/LinkedInApp/i.test(ua)) return 'linkedin'
  if (/Snapchat/i.test(ua)) return 'snapchat'
  if (/\bLine\//.test(ua)) return 'line'
  if (/\bTwitter(Android)?\b/i.test(ua)) return 'x'
  // The Google app on iPhone cannot open Quick Look (model-viewer leaves AR off there: IS_IOS_GSA).
  if (/\bGSA\//.test(ua) && /iPhone|iPad|iPod/.test(ua)) return 'google'
  return null
}

export function isIOS(ua: string = navigator.userAgent): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
}

export function isAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/i.test(ua)
}

/** The browser that opens AR on this phone: Safari (Quick Look) on iOS, Chrome (Scene Viewer) on Android. */
export function arBrowserName(): 'Safari' | 'Chrome' | 'Safari / Chrome' {
  return isIOS() ? 'Safari' : isAndroid() ? 'Chrome' : 'Safari / Chrome'
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

/** The browser named in a user-agent string ("Chrome", "Safari", ...), or null when it cannot tell. */
export function browserName(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string | null {
  return BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null
}

/** "Chrome on Windows", "Safari on iPhone" from a stored user-agent string; "Unknown device" when it cannot tell. */
export function describeUserAgent(ua: string | null | undefined, t: TFn = tEn): string {
  if (!ua) return t('ui.ua.unknown')
  const browser = browserName(ua) ?? undefined
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (browser && system) return t('ui.ua.browserOnSystem', { browser, system })
  return browser ?? system ?? t('ui.ua.unknown')
}
