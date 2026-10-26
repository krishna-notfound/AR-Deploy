import { readFileSync } from 'node:fs'
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { LEGAL_CONTENT } from './content.generated'
import { parseInline, parseMarkdown } from './markdown'
import { LEGAL_DRAFT_FILES, stripDraftingNotes } from './source'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom has no scrolling; ScrollRestoration calls it
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('legal content', () => {
  it('is generated from the current drafts (run `node scripts/legal-content.mjs` after editing one)', () => {
    for (const [doc, langs] of Object.entries(LEGAL_DRAFT_FILES)) {
      for (const [lang, path] of Object.entries(langs)) {
        const expected = stripDraftingNotes(readFileSync(path, 'utf8'))
        expect(LEGAL_CONTENT[doc as keyof typeof LEGAL_CONTENT][lang as 'en' | 'pt'], `${doc}.${lang}`).toBe(expected)
      }
    }
  })

  it('leaves the drafting notes for counsel out and keeps everything else', () => {
    const md = 'Before\n\n> *Drafting note for counsel: ask about [[DPO]].*\n\nAfter\n\n> **In short:** kept.'
    expect(stripDraftingNotes(md)).toBe('Before\n\nAfter\n\n> **In short:** kept.')
    for (const langs of Object.values(LEGAL_CONTENT)) {
      for (const text of Object.values(langs)) {
        expect(text).not.toMatch(/Drafting note|Nota de redação/)
        expect(text).toMatch(/^\*\*(DRAFT|RASCUNHO) — /)
      }
    }
  })

  it('parses placeholders, links whose address is a placeholder, and tables inside quotes', () => {
    expect(parseInline('The [Privacy Policy]([[DOMAIN]]/privacy) of [[LEGAL_NAME]], **bold** *it*')).toEqual([
      { type: 'text', text: 'The ' },
      { type: 'link', href: '[[DOMAIN]]/privacy', children: [{ type: 'text', text: 'Privacy Policy' }] },
      { type: 'text', text: ' of ' },
      { type: 'placeholder', name: 'LEGAL_NAME' },
      { type: 'text', text: ', ' },
      { type: 'strong', children: [{ type: 'text', text: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'it' }] },
    ])
    const [quote] = parseMarkdown('> **At a glance**\n>\n> | | |\n> |---|---|\n> | **Who** | [[LEGAL_NAME]] |')
    expect(quote?.type === 'quote' && quote.children.map((b) => b.type)).toEqual(['paragraph', 'table'])
  })
})

describe('/privacy and /terms', () => {
  it('shows the English privacy policy with the draft line, contents links and placeholder chips', async () => {
    openApp('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent("DRAFT — to be reviewed and approved by the client's lawyer before publication.")
    expect(screen.getByText(/^Last updated:/)).toBeInTheDocument()
    // The contents list links every section to its anchor.
    const contents = screen.getByRole('navigation', { name: 'Contents' })
    const link = within(contents).getByRole('link', { name: '5. Cookies and device storage' })
    expect(link).toHaveAttribute('href', '#5-cookies-and-device-storage')
    expect(document.getElementById('5-cookies-and-device-storage')).toHaveTextContent('5. Cookies and device storage')
    // [[TOKENS]] stay visible as "to be completed" chips; no client fact is filled in.
    const chips = document.querySelectorAll('mark[data-placeholder]')
    expect(chips.length).toBeGreaterThan(20)
    expect(document.querySelector('mark[data-placeholder="LEGAL_NAME"]')).toHaveAttribute('title', 'To be completed')
    // Every Markdown mark was understood: no stray tokens, asterisks, backticks or pipes in the text.
    expect(document.body.textContent).not.toMatch(/\[\[|\*|`|\|/)
    // "In short" boxes and tables are kept; the drafting note for counsel is not shown.
    expect(screen.getAllByText('In short:').length).toBeGreaterThan(5)
    expect(screen.getAllByRole('table').length).toBeGreaterThan(5)
    expect(document.body.textContent).not.toContain('Drafting note')
    expect(document.title).toBe('Privacy Policy · Sanctus')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toMatch(/^How Sanctus handles personal data/)
  })

  it('shows the pt-PT text in Portuguese', async () => {
    openApp('/terms?lang=pt')
    expect(await screen.findByRole('heading', { level: 1, name: 'Termos e Condições' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('RASCUNHO — a rever e aprovar pelo advogado do cliente antes da publicação.')
    expect(screen.getByRole('heading', { level: 2, name: 'Parte A: Todos' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Índice' })).getAllByRole('link').length).toBeGreaterThan(20)
    await waitFor(() => expect(document.documentElement.lang).toBe('pt-PT'))
    expect(document.title).toBe('Termos e Condições · Sanctus')
    // The Terms link to the privacy policy goes to this site's own page ([[DOMAIN]] is not known yet).
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacy')
  })

  it('switches language in place', async () => {
    openApp('/privacy')
    await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })
    screen.getByRole('radio', { name: 'PT' }).click()
    expect(await screen.findByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeInTheDocument()
  })
})

describe('footer links to the legal pages', () => {
  const expectLegalLinks = async (privacy = 'Privacy', terms = 'Terms') => {
    const nav = await screen.findByRole('navigation', { name: privacy === 'Privacy' ? 'Legal' : 'Informação legal' })
    expect(within(nav).getByRole('link', { name: privacy })).toHaveAttribute('href', '/privacy')
    expect(within(nav).getByRole('link', { name: terms })).toHaveAttribute('href', '/terms')
  }

  it('on the landing page', async () => {
    openApp('/')
    await expectLegalLinks()
  })

  it('on a catalog page, in Portuguese', async () => {
    openApp('/catalog/nordhaus?lang=pt')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    await expectLegalLinks('Privacidade', 'Termos')
  })

  it('on a product page', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { level: 1 })
    await expectLegalLinks()
  })
})

describe('every legal page renders its Markdown completely', () => {
  it.each([['/privacy'], ['/privacy?lang=pt'], ['/terms'], ['/terms?lang=pt']])('%s', async (url) => {
    openApp(url)
    await screen.findByRole('heading', { level: 1 })
    const main = screen.getByRole('main')
    expect(main.textContent).not.toMatch(/\[\[|\*|`|\||^#|\n#/)
    expect(main.querySelectorAll('mark[data-placeholder]').length).toBeGreaterThan(10)
  })
})
