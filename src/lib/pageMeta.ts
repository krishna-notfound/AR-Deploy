import { useEffect } from 'react'

/**
 * Client-side head tags for crawlers that run JavaScript. The app has no server of its own (ADR-0015), so link-preview
 * bots that do not run scripts still read the static tags in index.html.
 */

const DESCRIPTION_MAX = 160

/** Plain text for a `<meta name="description">`: whitespace collapsed, cut at a word boundary with an ellipsis. */
export function metaSnippet(text: string | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= DESCRIPTION_MAX) return flat
  const cut = flat.slice(0, DESCRIPTION_MAX - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > DESCRIPTION_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`
}

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

/**
 * Adds <meta name="robots" content="noindex"> while `active`. The static host answers 200 for any address, so a missing
 * or unpublished page cannot say 404 to a crawler; this tells the ones that run scripts not to index it.
 */
export function useNoIndex(active = true) {
  useEffect(() => {
    if (!active) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [active])
}
