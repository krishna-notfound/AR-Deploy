// The site icon from the Website Editor (ADR-0053). When the published site content has a favicon, the page's <link rel="icon">
// and <link rel="apple-touch-icon"> point to it; otherwise index.html's built-in icons stay. The read has no React state, so it
// never re-renders the app, and a failed read leaves the built-in icons.
import { useEffect } from 'react'
import { isFaviconPath } from '@/domain/siteContent'
import { content, siteAssetUrl } from '@/services'

const MARK = 'data-site-favicon'

/** Points the page's icons at `url`: the built-in icon links are replaced by one PNG icon, the apple-touch-icon gets the same file. */
export function applyFavicon(url: string, doc: Document = document): void {
  for (const link of Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]'))) link.remove()
  const icon = doc.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/png'
  icon.href = url
  icon.setAttribute(MARK, '')
  doc.head.append(icon)
  let touch = doc.head.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!touch) {
    touch = doc.createElement('link')
    touch.rel = 'apple-touch-icon'
    doc.head.append(touch)
  }
  touch.removeAttribute('sizes')
  touch.href = url
}

/** Reads the published chrome once per page load and applies its favicon, if it has one. */
export function useSiteFavicon(): void {
  useEffect(() => {
    let alive = true
    void content
      .getPublishedChrome()
      .then((r) => {
        const favicon = r.ok ? r.data.favicon : undefined
        if (!alive || !favicon || !isFaviconPath(favicon.path)) return
        const url = siteAssetUrl(favicon)
        if (url) applyFavicon(url)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
}
