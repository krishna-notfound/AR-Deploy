import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/urls'
import { SiteFooter, SiteHeader } from '../marketing/SiteChrome'
import { PublicShell } from '../public/PublicShell'
import { LEGAL_CONTENT } from './content.generated'
import { type Block, type Inline, inlineText, parseMarkdown, slugify } from './markdown'

export type LegalDoc = 'privacy' | 'terms'

/**
 * /privacy and /terms: the client's legal drafts (docs/legal/drafts, EN and pt-PT), rendered as written. The
 * "DRAFT" line stays visible until the client's lawyer approves the text, and every [[PLACEHOLDER]] shows as a
 * "to be completed" chip: no client fact is filled in here. Drafting notes for counsel are left out (source.ts).
 * On the platform domain it keeps the Sanctus header and footer; on a business subdomain the catalogue chrome.
 */
export default function LegalPage({ doc, tenant }: { doc: LegalDoc; tenant?: boolean }) {
  const { t, lang } = useI18n()
  useDocumentTitle(t(`legal.${doc}.title`))
  useMetaDescription(t(`legal.${doc}.description`))
  const parsed = useMemo(() => structure(parseMarkdown(LEGAL_CONTENT[doc][lang])), [doc, lang])
  const content = <LegalDocument doc={parsed} />
  if (tenant) return <PublicShell>{content}</PublicShell>
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      {content}
      <SiteFooter />
    </div>
  )
}

/** Sets <meta name="description"> while the page is shown and restores the previous text afterwards. */
function useMetaDescription(text: string) {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const created = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const prev = meta.content
    meta.content = text
    return () => {
      if (created) meta.remove()
      else meta.content = prev
    }
  }, [text])
}

type Heading = { id: string; level: 1 | 2 | 3; depth: number; children: Inline[] }
type Item = { block: Block; heading?: Heading }
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
  const used = new Set<string>()
  const contents: Heading[] = []
  let inPart = false
  const body: Item[] = []
  for (const block of blocks.slice(titleAt + 1)) {
    if (isContentsLine(block)) continue // replaced by the linked contents list
    if (block.type !== 'heading') {
      body.push({ block })
      continue
    }
    if (block.level === 1) inPart = true
    let id = slugify(block.text) || 'section'
    for (let n = 2; used.has(id); n++) id = `${slugify(block.text)}-${n}`
    used.add(id)
    const heading: Heading = { id, level: block.level, depth: block.level === 1 ? 0 : inPart ? block.level - 1 : block.level - 2, children: block.children }
    if (block.level <= 2) contents.push(heading)
    body.push({ block, heading })
  }
  return {
    draft,
    meta: draft ? front.slice(1) : front,
    title: titleBlock?.type === 'heading' ? titleBlock.children : [],
    body,
    contents,
  }
}

function LegalDocument({ doc }: { doc: LegalStructure }) {
  const { t } = useI18n()
  // The contents list starts open on wide screens (a sticky side column) and closed on phones.
  const [contentsOpen] = useState(() => (typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true))
  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 px-5 py-12 sm:px-10 lg:py-20">
      {doc.draft && (
        <p role="note" className="border border-warning/40 bg-warning-soft px-4 py-3 text-[14px] leading-6 font-semibold text-warning">
          <InlineContent nodes={doc.draft} />
        </p>
      )}
      <header className="mt-10 max-w-[760px]">
        <h1 className="text-headline font-display text-ink">
          <InlineContent nodes={doc.title} />
        </h1>
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
      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,240px)_minmax(0,760px)] lg:gap-16">
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
        <article className="min-w-0 text-[15px] leading-7 text-ink-body">
          {doc.body.map((item, i) => (
            <BlockView key={i} block={item.block} heading={item.heading} />
          ))}
        </article>
      </div>
    </main>
  )
}

function BlockView({ block, heading }: { block: Block; heading?: Heading }) {
  switch (block.type) {
    case 'heading': {
      const h = heading!
      const kids = <InlineContent nodes={block.children} />
      if (block.level === 1)
        return (
          <h2 id={h.id} className="mt-16 scroll-mt-28 border-t border-line-strong pt-10 text-title font-display text-ink first:mt-0">
            {kids}
          </h2>
        )
      const Tag = (h.level === 2 ? (h.depth === 0 ? 'h2' : 'h3') : h.depth === 1 ? 'h3' : 'h4') as 'h2' | 'h3' | 'h4'
      return (
        <Tag id={h.id} className={cn('scroll-mt-28 font-display text-ink', block.level === 2 ? 'mt-12 text-[1.625rem] leading-tight' : 'mt-8 text-[1.25rem] leading-snug')}>
          {kids}
        </Tag>
      )
    }
    case 'paragraph':
      return (
        <p className="mt-4 first:mt-0">
          <InlineContent nodes={block.children} />
        </p>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag className={cn('mt-4 space-y-2 pl-5 first:mt-0', block.ordered ? 'list-decimal' : 'list-disc', 'marker:text-ink-muted')}>
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              <InlineContent nodes={item} />
            </li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return <TableView head={block.head} rows={block.rows} />
    case 'quote':
      return (
        <aside className="mt-6 border-l-2 border-accent bg-accent-soft/60 px-5 py-4 text-[14px] leading-6 first:mt-0">
          {block.children.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </aside>
      )
    case 'rule':
      return <hr className="my-12 border-line" />
  }
}

/**
 * Tables stay tables from 640 px up (scrolling inside their own box if a column set is wider than the text). On
 * phones each row becomes a stacked card with the column name above each value, so the page never scrolls sideways.
 * Two-column tables with an empty header row are key/value lists: no header, the key in bold.
 */
function TableView({ head, rows }: { head: Inline[][]; rows: Inline[][][] }) {
  const labels = head.map(inlineText)
  const hasHead = labels.some(Boolean)
  return (
    <div className="mt-6 first:mt-0 sm:overflow-x-auto">
      <table className="w-full border-collapse text-left text-[14px] leading-6 max-sm:block">
        {hasHead && (
          <thead className="max-sm:hidden">
            <tr>
              {head.map((cell, i) => (
                <th key={i} scope="col" className="border-b border-line-strong py-3 pr-4 align-bottom text-label text-ink">
                  <InlineContent nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="max-sm:block">
          {rows.map((row, r) => (
            <tr key={r} className="max-sm:block max-sm:border-b max-sm:border-line max-sm:py-3">
              {row.map((cell, c) => (
                <td
                  key={c}
                  data-label={hasHead ? labels[c] : undefined}
                  className={cn(
                    'border-b border-line py-3 pr-4 align-top [overflow-wrap:anywhere] max-sm:block max-sm:border-0 max-sm:py-1 max-sm:pr-0',
                    hasHead && 'max-sm:before:block max-sm:before:text-label max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]',
                    !hasHead && c === 0 && 'font-semibold text-ink sm:w-[34%]',
                  )}
                >
                  <InlineContent nodes={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A fact the client or counsel still has to supply, e.g. [[LEGAL_NAME]]. */
function Chip({ name }: { name: string }) {
  const { t } = useI18n()
  return (
    <mark
      data-placeholder={name}
      title={t('legal.placeholder')}
      className="rounded-sm bg-warning-soft px-1 py-px font-mono text-[0.82em] text-warning ring-1 ring-warning/30 ring-inset [overflow-wrap:anywhere]"
    >
      {name}
      <span className="sr-only"> ({t('legal.placeholder')})</span>
    </mark>
  )
}

function InlineContent({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return n.text
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-ink">
            <InlineContent nodes={n.children} />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <InlineContent nodes={n.children} />
          </em>
        )
      case 'code':
        return (
          <code key={i} className="rounded-sm bg-subtle px-1 py-px text-[0.85em] [overflow-wrap:anywhere]">
            {n.text}
          </code>
        )
      case 'placeholder':
        return <Chip key={i} name={n.name} />
      case 'link':
        return <LegalLink key={i} href={n.href} nodes={n.children} />
    }
  })
}

/** Links between the two pages go to this site's own routes; [[DOMAIN]] is not known yet. External links open a new tab. */
function LegalLink({ href, nodes }: { href: string; nodes: Inline[] }) {
  const cls = 'underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-ink'
  const local = href.replace(/^\[\[DOMAIN\]\]/, '')
  if (local === '/privacy' || local === '/terms')
    return (
      <Link to={local === '/privacy' ? PRIVACY_PATH : TERMS_PATH} className={cls}>
        <InlineContent nodes={nodes} />
      </Link>
    )
  if (/^https:\/\//.test(href))
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <InlineContent nodes={nodes} />
      </a>
    )
  return <InlineContent nodes={nodes} />
}
