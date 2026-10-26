export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Saves the file at `url` (a signed storage link, or a demo blob/data URL) as `filename`. The file is fetched first, so
 * a cross-origin link is saved under its original name instead of being opened in the tab. Rejects when it can't be read.
 */
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed (${res.status})`)
  const href = URL.createObjectURL(await res.blob())
  try {
    downloadDataUrl(href, filename)
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 0)
  }
}
