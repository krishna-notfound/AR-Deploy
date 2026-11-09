// Sanctus service worker (ADR-0056): phone notifications only. It has no fetch handler and caches nothing, so the site
// behaves exactly as without it. It is registered only when someone turns phone notifications on (or is already subscribed).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// The server sends JSON { title, body, url, tag }. Anything else still shows a plain notification.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Sanctus'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icon-192.png',
      badge: '/favicon-32x32.png',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  )
})

// Opens the link inside this site only: a path that resolves to another origin falls back to the home page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const wanted = event.notification.data && event.notification.data.url
  let target = new URL('/', self.location.origin)
  try {
    const u = new URL(typeof wanted === 'string' ? wanted : '/', self.location.origin)
    if (u.origin === self.location.origin) target = u
  } catch {
    // keep the home page
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === target.origin)
      if (open) {
        return open.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target.href) : undefined))
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
