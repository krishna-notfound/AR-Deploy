import { useEffect } from 'react'

/** Sets <meta name="description"> while the page is shown and restores the previous text afterwards. */
export function useMetaDescription(text: string) {
  useEffect(() => {
    if (!text) return
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const prev = meta.content
    meta.content = text
    return () => {
      if (created) meta.remove()
      else meta.content = prev
    }
  }, [text])
}
