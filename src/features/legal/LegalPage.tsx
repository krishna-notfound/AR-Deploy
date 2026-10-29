import { type ReactNode, useMemo, useState } from 'react'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { usePublishedPage } from '@/services/contentHooks'
import { LEGAL_CONTENT } from './content.generated'
import { type Block, type Inline, inlineText, parseMarkdown } from './markdown'
import { BlockView, type Heading, InlineContent, type Item, itemsOf } from './MarkdownBody'
import { PageFrame } from './PageFrame'
import { useMetaDescription } from './useMetaDescription'

export type LegalDoc = 'privacy' | 'terms'

/**
 * /privacy and /terms: the client's legal drafts (docs/legal/drafts, EN and pt-PT), rendered as written, or the text the
 * client published in the Editor (per language; a language without an override shows the built-in text). The "DRAFT" line
 * stays visible until the client's lawyer approves the text, and every [[PLACEHOLDER]] shows as a "to be completed" chip:
 * no client fact is filled in here. Drafting notes for counsel are left out (source.ts).
 * On the platform domain it keeps the Sanctus header and footer; on a business subdomain the catalogue chrome.
 * While the published text loads it shows a skeleton (no flash of the old text); if that read fails it shows the built-in
 * text and one line saying so, with a retry. Nothing is ever written back.
 */
export default function LegalPage({ doc, tenant }: { doc: LegalDoc; tenant?: boolean }) {
  const { t, lang } = useI18n()
  useDocumentTitle(t(`legal.${doc}.title`))
  useMetaDescription(t(`legal.${doc}.description`))
  const { page, loading, error, reload } = usePublishedPage(doc)
  const override = page?.kind === 'builtin' ? page.body[lang] : undefined
  const markdown = override?.trim() ? override : LEGAL_CONTENT[doc][lang]
  const parsed = useMemo(() => structure(parseMarkdown(markdown)), [markdown])
  return (
    <PageFrame tenant={tenant}>
      {loading ? (
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-12 sm:px-10 lg:py-20" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton className="h-10 w-2/3 max-w-[760px]" />
          <Skeleton className="mt-6 h-4 w-full max-w-[760px]" />
          <Skeleton className="mt-3 h-4 w-5/6 max-w-[760px]" />
          <Skeleton className="mt-3 h-4 w-3/4 max-w-[760px]" />
        </main>
      ) : (
        <LegalDocument
          doc={parsed}
          fallbackTitle={t(`legal.${doc}.title`)}
          checkFailed={
            error && (
              <p role="status" className="mb-6 text-[13px] text-ink-muted">
                {t('site.page.checkFailed')}{' '}
                <button type="button" onClick={reload} className="underline underline-offset-2 hover:text-accent-ink">
                  {t('common.retry')}
                </button>
              </p>
            )
          }
        />
      )}
    </PageFrame>
  )
}

interface LegalStructure {
  /** "DRAFT — to be reviewed…" (first paragraph, all bold). */
  draft: Inline[] | null
  /** "Last updated: … · Version …" and anything else above the title. */
  meta: Block[]
  title: Inline[]
  body: Item[]
  contents: Heading[]
}

const isContentsLine = (b: Block) => b.type === 'paragraph' && b.children[0]?.type === 'strong' && /^(Contents|Índice):$/.test(inlineText(b.children[0].children))

/** Splits the parsed draft into its front matter, title and body, and gives every part and section an anchor. */
function structure(blocks: Block[]): LegalStructure {
  const titleAt = blocks.findIndex((b) => b.type === 'heading' && b.level === 1)
  const front = blocks.slice(0, Math.max(titleAt, 0))
  const first = front[0]
  const draft = first?.type === 'paragraph' && first.children.length === 1 && first.children[0]!.type === 'strong' ? first.children[0]!.children : null
  const titleBlock = blocks[titleAt]
  // The contents line is replaced by the linked contents list.
  const { body, contents } = itemsOf(blocks.slice(titleAt + 1).filter((b) => !isContentsLine(b)))
  return {
    draft,
    meta: draft ? front.slice(1) : front,
    title: titleBlock?.type === 'heading' ? titleBlock.children : [],
    body,
    contents,
  }
}

function LegalDocument({ doc, fallbackTitle, checkFailed }: { doc: LegalStructure; fallbackTitle: string; checkFailed?: ReactNode }) {
  const { t } = useI18n()
  // The contents list starts open on wide screens (a sticky side column) and closed on phones.
  const [contentsOpen] = useState(() => (typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true))
  const hasContents = doc.contents.length > 0
  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-12 sm:px-10 lg:py-20">
      {checkFailed}
      {doc.draft && (
        <p role="note" className="border border-warning/40 bg-warning-soft px-4 py-3 text-[14px] leading-6 font-semibold text-warning">
          <InlineContent nodes={doc.draft} />
        </p>
      )}
      <header className="mt-10 max-w-[760px]">
        <h1 className="text-headline font-display text-ink">{doc.title.length > 0 ? <InlineContent nodes={doc.title} /> : fallbackTitle}</h1>
        {doc.meta.map((b, i) => (
          <p key={i} className="mt-4 text-[13px] leading-6 text-ink-muted">
            {b.type === 'paragraph' ? <InlineContent nodes={b.children} /> : null}
          </p>
        ))}
        <p className="mt-2 text-[13px] leading-6 text-ink-muted">
          <span aria-hidden className="mr-2 inline-block size-2.5 rounded-sm bg-warning-soft align-middle ring-1 ring-warning/40 ring-inset" />
          {t('legal.placeholderNote')}
        </p>
      </header>
      <div className={cn('mt-10', hasContents && 'lg:grid lg:grid-cols-[minmax(0,240px)_minmax(0,760px)] lg:gap-16')}>
        {hasContents && (
          <details open={contentsOpen} className="group mb-10 self-start border-y border-line py-4 lg:sticky lg:top-28 lg:mb-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
            <summary className="cursor-pointer text-label text-ink marker:text-ink-muted">{t('legal.contents')}</summary>
            <nav aria-label={t('legal.contents')} className="mt-4">
              <ol className="space-y-2 text-[13px] leading-5 text-ink-muted">
                {doc.contents.map((h) => (
                  <li key={h.id} className={cn(h.depth > 0 && 'pl-4', h.level === 1 && 'pt-2 font-semibold text-ink')}>
                    <a href={`#${h.id}`} className="inline-block py-0.5 transition-colors hover:text-accent-ink">
                      {inlineText(h.children)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        )}
        <article className={cn('min-w-0 text-[15px] leading-7 text-ink-body', !hasContents && 'max-w-[760px]')}>
          {doc.body.map((item, i) => (
            <BlockView key={i} block={item.block} heading={item.heading} />
          ))}
        </article>
      </div>
    </main>
  )
}
