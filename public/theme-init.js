/* Sets the dashboard colour theme before the first paint, so there is no flash (ADR-0060).
   Dark only on /admin and /dashboard, and only when the person chose it on this device. Keep in step with src/theme/theme.ts. */
;(function () {
  try {
    var p = location.pathname
    if (p !== '/admin' && p !== '/dashboard' && p.indexOf('/admin/') !== 0 && p.indexOf('/dashboard/') !== 0) return
    var c = localStorage.getItem('arfurn:theme')
    var dark = c === 'dark' || (c === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (!dark) return
    document.documentElement.setAttribute('data-theme', 'dark')
    var m = document.querySelector('meta[name="theme-color"]')
    if (m) m.setAttribute('content', '#141311')
  } catch (e) {
    /* storage unavailable: stay light */
  }
})()
