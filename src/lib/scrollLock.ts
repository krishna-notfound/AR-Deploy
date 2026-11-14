import { useEffect } from 'react'

let locks = 0
let saved = ''

/**
 * Stops the page behind an open dialog or menu from scrolling. Locks nest (a dialog opened over the mobile menu):
 * the page scrolls again, with its previous overflow restored, only when the last lock is released.
 * Returns the release function; calling it twice does nothing.
 */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    saved = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0) document.body.style.overflow = saved
  }
}

/** Locks the page's scroll while `active` is true. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
