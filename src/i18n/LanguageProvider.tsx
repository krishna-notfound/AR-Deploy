import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Lang, LocalizedText } from '@/domain/types'
import type { TranslationKey } from './dictionaries/en'
import { type Vars, pickLocalized, translate } from './translate'

export const LANG_KEY = 'arfurn:lang'

function initialLang(): Lang {
  try {
    const stored = sessionStorage.getItem(LANG_KEY)
    if (stored === 'en' || stored === 'pt') return stored
  } catch {
    // ignore
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey, vars?: Vars) => string
  localized: (text: LocalizedText | undefined) => string
  localizedMeta: (text: LocalizedText | undefined) => ReturnType<typeof pickLocalized>
}

const Ctx = createContext<LangCtx | null>(null)

/** Wraps public routes only (admin stays English). */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      sessionStorage.setItem(LANG_KEY, l)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const prev = document.documentElement.lang
    document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en'
    return () => {
      document.documentElement.lang = prev || 'en'
    }
  }, [lang])

  const value = useMemo<LangCtx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      localized: (text) => pickLocalized(text, lang).text,
      localizedMeta: (text) => pickLocalized(text, lang),
    }),
    [lang, setLang],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): LangCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>')
  return ctx
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
