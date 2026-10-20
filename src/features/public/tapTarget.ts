/**
 * An invisible hit area, 44px tall and at least 32px wide, centred on a small text control (language toggle,
 * inline links, filter chips). The control keeps its look; only the area that answers a tap grows (WCAG 2.5.8).
 * The element must not clip overflow; a scrolling parent needs vertical padding for the extra height.
 */
export const TAP_TARGET =
  "relative before:absolute before:top-1/2 before:left-1/2 before:h-11 before:w-[max(100%,2rem)] before:-translate-1/2 before:content-['']"
