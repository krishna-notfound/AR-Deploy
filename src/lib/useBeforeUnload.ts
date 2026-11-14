import { useEffect } from 'react'

/**
 * While `active` (the form has unsaved changes), closing the tab or reloading the page asks the browser's own "Leave site?"
 * question. Navigation inside the app is guarded separately with react-router's useBlocker.
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
