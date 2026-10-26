// A small parser for the Markdown subset the legal drafts use (no dependency, ADR-0010 / CLAUDE.md): headings,
// paragraphs, "-" and "1." lists, pipe tables, ">" quotes (which may hold tables and lists), "---" rules, and inline
// **bold**, *italic*, `code`, [links](href) and [[PLACEHOLDER]] tokens. Anything else is kept as plain text.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  /** A fact the client or counsel must supply ([[LEGAL_NAME]]); shown as a "to be completed" chip. */
  | { type: 'placeholder'; name: string }

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { type: 'quote'; children: Block[] }
  | { type: 'rule' }

const INLINE = /\[\[([A-Z0-9_]+)\]\]|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of src.matchAll(INLINE)) {
    const at = m.index
    if (at > last) out.push({ type: 'text', text: src.slice(last, at) })
    if (m[1] !== undefined) out.push({ type: 'placeholder', name: m[1] })
    else if (m[2] !== undefined) out.push({ type: 'strong', children: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ type: 'em', children: parseInline(m[3]) })
    else if (m[4] !== undefined) out.push({ type: 'code', text: m[4] })
    else out.push({ type: 'link', href: m[6]!, children: parseInline(m[5]!) })
    last = at + m[0].length
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) })
  return out
}

/** Plain text of inline content (placeholders as their [[TOKEN]]), for ids and accessible names. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.type === 'text' || n.type === 'code' ? n.text : n.type === 'placeholder' ? `[[${n.name}]]` : inlineText(n.children)))
    .join('')
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => parseInline(c.trim()))

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/
const isTableRule = (l: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(l.trim())

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const text = heading[2]!.trim()
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, text, children: parseInline(text) })
      i++
      continue
    }
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (line.startsWith('>')) {
      const inner: string[] = []
      while (i < lines.length && lines[i]!.startsWith('>')) inner.push(lines[i++]!.replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', children: parseMarkdown(inner.join('\n')) })
      continue
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableRule(lines[i + 1]!)) {
      const head = cells(line)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!))
      blocks.push({ type: 'table', head, rows })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      const ordered = /\d/.test(item[2]!)
      const items: Inline[][] = []
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]!)
        if (!m || /\d/.test(m[2]!) !== ordered) break
        items.push(parseInline(m[3]!))
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    // Paragraph: consecutive plain lines.
    const para: string[] = [lines[i++]!.trim()]
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|>|\||-{3,}\s*$)/.test(lines[i]!) && !LIST_ITEM.test(lines[i]!)) para.push(lines[i++]!.trim())
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) })
  }
  return blocks
}

/** Ids for headings: lower case, accents removed, words joined by "-" ("A1. What Sanctus is" → "a1-what-sanctus-is"). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\[\[|\]\]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
