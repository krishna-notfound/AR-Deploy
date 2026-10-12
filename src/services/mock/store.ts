// In-memory demo database with localStorage persistence. Demo only; NOT a production database.
// See System_arch/design/06-persistence.md.
import { type Db, isValidDb } from './db'
import { createSeed } from './seed'

export const DB_KEY = 'arfurn:v1:db'

export type StoreNotice = { kind: 'reset-corrupt' } | { kind: 'quota' }

type Listener = () => void
type NoticeListener = (n: StoreNotice) => void

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

class Store {
  private db: Db
  private listeners = new Set<Listener>()
  private noticeListeners = new Set<NoticeListener>()
  private pendingNotices: StoreNotice[] = []
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.db = this.load()
  }

  private load(): Db {
    const storage = safeStorage()
    const raw = storage?.getItem(DB_KEY)
    if (!raw) return createSeed()
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isValidDb(parsed)) return parsed
    } catch {
      // handled below
    }
    try {
      storage?.setItem(`${DB_KEY}:corrupt-${Date.now()}`, raw.slice(0, 200_000))
    } catch {
      // ignore: backup is best-effort
    }
    this.pendingNotices.push({ kind: 'reset-corrupt' })
    const seed = createSeed()
    this.persistNow(seed)
    return seed
  }

  get(): Db {
    return this.db
  }

  /** Apply a mutation, then persist (debounced) and notify subscribers. */
  update(mutator: (db: Db) => void): void {
    mutator(this.db)
    this.scheduleSave()
    this.notify()
  }

  replace(db: Db): void {
    this.db = db
    this.persistNow(db)
    this.notify()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onNotice(fn: NoticeListener): () => void {
    this.noticeListeners.add(fn)
    for (const n of this.pendingNotices.splice(0)) fn(n)
    return () => this.noticeListeners.delete(fn)
  }

  notify(): void {
    for (const l of [...this.listeners]) l()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.persistNow(this.db)
    }, 200)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.persistNow(this.db)
  }

  private persistNow(db: Db): void {
    const storage = safeStorage()
    if (!storage) return
    try {
      storage.setItem(DB_KEY, JSON.stringify(db))
    } catch {
      const notice: StoreNotice = { kind: 'quota' }
      if (this.noticeListeners.size === 0) this.pendingNotices.push(notice)
      for (const l of this.noticeListeners) l(notice)
    }
  }
}

export const store = new Store()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => store.flush())
}
