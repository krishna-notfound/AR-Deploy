import { describe, expect, it } from 'vitest'
import { translate } from '@/i18n/translate'
import { describeUserAgent } from './userAgent'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

describe('describeUserAgent', () => {
  it("returns 'Safari on iPhone' and 'Chrome on Windows'", () => {
    expect(describeUserAgent(UA.iphoneSafari)).toBe('Safari on iPhone')
    expect(describeUserAgent(UA.windowsChrome)).toBe('Chrome on Windows')
  })

  it('names the common browsers and systems', () => {
    expect(describeUserAgent(UA.iphoneChrome)).toBe('Chrome on iPhone')
    expect(describeUserAgent(UA.windowsEdge)).toBe('Edge on Windows')
    expect(describeUserAgent(UA.macFirefox)).toBe('Firefox on macOS')
    expect(describeUserAgent(UA.macSafari)).toBe('Safari on macOS')
    expect(describeUserAgent(UA.androidChrome)).toBe('Chrome on Android')
    expect(describeUserAgent(UA.androidSamsung)).toBe('Samsung Internet on Android')
    expect(describeUserAgent(UA.ipad)).toBe('Safari on iPad')
    expect(describeUserAgent(UA.linuxFirefox)).toBe('Firefox on Linux')
  })

  it('says so when it cannot tell', () => {
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent('')).toBe('Unknown device')
    expect(describeUserAgent('curl/8.4.0')).toBe('Unknown device')
  })
})

describe('describeUserAgent in Portuguese', () => {
  const pt = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('pt', key, vars)
  it('words the sentence in pt-PT', () => {
    expect(describeUserAgent(UA.windowsChrome, pt)).toBe('Chrome em Windows')
    expect(describeUserAgent(null, pt)).toBe('Dispositivo desconhecido')
  })
})
