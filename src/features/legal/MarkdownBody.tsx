import { type ReactNode, useMemo } from 'react'
import { Link } from 'react-router'
import { isAllowedLinkHref } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { PRIVACY_PATH, TERMS_PATH } from '@/lib/urls'
import { type Block, type Inline, inlineText, parseMarkdown, slugify } from './markdown'

// The renderer of the Markdown subset (markdown.ts) shared by Terms, Privacy and custom pages. It builds React elements
// only (never HTML strings), shows raw HTML as text, and renders a link whose scheme is not https:, mailto: or a site path
// as plain text (the editor refuses such links on save; this is the second check, on render).

export type Heading = { id: string; level: 1 | 2 | 3; depth: number; children: Inline[] }
export type Item = { block: Block; heading?: Heading }

/** Gives every heading an anchor id and a nesting depth. `contents` holds the headings of level 1 and 2. */
export function itemsOf(blocks: Block[]): { body: Item[]; contents: Heading[] } {
  const used = new Set<string>()
  const contents: Heading[] = []
  const body: Item[] = []
  let inPart = false
  for (const block of blocks) {
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
  return { body, contents }
}

/** The body of a custom page: Markdown in, headings, paragraphs, lists, tables and quotes out. */
export function MarkdownBody({ markdown, className }: { markdown: string; className?: string }) {
  const { body } = useMemo(() => itemsOf(parseMarkdown(markdown)), [markdown])
  return (
    <article className={cn('min-w-0 text-[15px] leading-7 text-ink-body', className)}>
      {body.map((item, i) => (
        <BlockView key={i} block={item.block} heading={item.heading} />
      ))}
    </article>
  )
}

/** First paragraph of a Markdown text as plain text, cut to `max` characters, for the page's meta description. */
export function firstParagraph(markdown: string, max = 160): string {
  const p = parseMarkdown(markdown).find((b) => b.type === 'paragraph')
  const text = p?.type === 'paragraph' ? inlineText(p.children).replace(/\s+/g, ' ').trim() : ''
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function BlockView({ block, heading }: { block: Block; heading?: Heading }) {
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

export function InlineContent({ nodes }: { nodes: Inline[] }): ReactNode {
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
        return <BodyLink key={i} href={n.href} nodes={n.children} />
    }
  })
}

/**
 * Links between the two legal pages go to this site's own routes ([[DOMAIN]] is not known yet). Other site paths are
 * client-side links, https: and mailto: are plain anchors (https opens a new tab). Anything else is plain text.
 */
function BodyLink({ href, nodes }: { href: string; nodes: Inline[] }) {
  const cls = 'underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-ink'
  const local = href.replace(/^\[\[DOMAIN\]\]/, '')
  if (local === '/privacy' || local === '/terms')
    return (
      <Link to={local === '/privacy' ? PRIVACY_PATH : TERMS_PATH} className={cls}>
        <InlineContent nodes={nodes} />
      </Link>
    )
  if (!isAllowedLinkHref(href)) return <InlineContent nodes={nodes} />
  if (href.startsWith('/'))
    return (
      <Link to={href} className={cls}>
        <InlineContent nodes={nodes} />
      </Link>
    )
  if (/^https:\/\//i.test(href))
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        <InlineContent nodes={nodes} />
      </a>
    )
  return (
    <a href={href} className={cls}>
      <InlineContent nodes={nodes} />
    </a>
  )
}
