import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** Generates a real QR code client-side. Returns a PNG data URL. */
export function useQrCode(text: string, width = 1024) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    setUrl(null)
    QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#161616', light: '#FFFFFF' } })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [text, width])
  return { url, error }
}
