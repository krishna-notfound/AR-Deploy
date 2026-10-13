import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

// After a new deployment, lazily loaded pages from the old build no longer exist: reload once to get the new build.
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'arfurn:reloadedForNewBuild'
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 10_000) return // reloaded just now: let RouteError show
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return
  }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
