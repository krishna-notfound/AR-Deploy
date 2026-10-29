import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Lang, LocalizedText } from '@/domain/types'
import type { TranslationKey } from './dictionaries/en'
import { htmlLangOf } from './locale'
import { type PluralBase, type Vars, pickLocalized, translate, translatePlural } from './translate'

/** Storage key of the saved choice (localStorage; older builds kept it in sessionStorage). */
export const LANG_KEY = 'arfurn:lang'

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt'

/** One-time move of the old per-tab choice into the device's saved choice. */
function migrateSessionChoice() {
  try {
    if (localStorage.getItem(LANG_KEY)) return
    const old = sessionStorage.getItem(LANG_KEY)
    if (isLang(old)) localStorage.setItem(LANG_KEY, old)
    if (old !== null) sessionStorage.removeItem(LANG_KEY)
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the choice then lasts for this visit only.
  }
}

/** `?lang=` for this visit (not stored), then the device's saved choice, then the browser language. */
function initialLang(): Lang {
  const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : null
  if (isLang(fromUrl)) return fromUrl
  migrateSessionChoice()
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (isLang(stored)) return stored
  } catch {
    // ignore
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey, vars?: Vars) => string
  /** Counted text: picks `<key>.one` or `<key>.other` by the language's plural rules; `{n}` is available in the template. */
  tn: (key: PluralBase, n: number, vars?: Vars) => string
  localized: (text: LocalizedText | undefined) => string
  localizedMeta: (text: LocalizedText | undefined) => ReturnType<typeof pickLocalized>
}

function makeCtx(lang: Lang, setLang: (l: Lang) => void): LangCtx {
  return {
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    tn: (key, n, vars) => translatePlural(lang, key, n, vars),
    localized: (text) => pickLocalized(text, lang).text,
    localizedMeta: (text) => pickLocalized(text, lang),
  }
}

// Outside a provider (a component test that renders one screen) everything stays English, the language tests assert on.
// The app renders inside the provider in App.tsx (above the toast, confirm and account providers, which word their own
// texts); the one in RootLayout then stands aside, and still serves a router rendered on its own.
const Ctx = createContext<LangCtx>(makeCtx('en', () => {}))
const InProvider = createContext(false)

/** App-wide language (every route, path mode and hostname mode): `?lang=` > saved choice > browser language. A provider inside another one stands aside. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const nested = useContext(InProvider)
  return nested ? <>{children}</> : <RootLanguageProvider>{children}</RootLanguageProvider>
}

function RootLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const prev = document.documentElement.lang
    document.documentElement.lang = htmlLangOf(lang)
    return () => {
      document.documentElement.lang = prev || 'en'
    }
  }, [lang])

  const value = useMemo(() => makeCtx(lang, setLang), [lang, setLang])
  return (
    <InProvider.Provider value>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </InProvider.Provider>
  )
}

export function useI18n(): LangCtx {
  return useContext(Ctx)
}

/** @deprecated The provider is app-wide now; use `useI18n()`. Kept so public-site files owned by other tracks keep compiling. */
export function useMaybeI18n(): LangCtx {
  return useContext(Ctx)
}

/** Renders localized product text and marks English fallbacks with lang="en". */
export function LocalizedSpan({ text, as: Tag = 'span', className }: { text: LocalizedText | undefined; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div'; className?: string }) {
  const { localizedMeta, lang } = useI18n()
  const meta = localizedMeta(text)
  return (
    <Tag className={className} lang={meta.isFallback || meta.lang !== lang ? 'en' : undefined}>
      {meta.text}
    </Tag>
  )
}
