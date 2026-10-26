import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { embedProductPageUrl, productEmbedUrl } from '@/lib/urls'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import { embedSnippet } from '../products/EmbedCodeDialog'

// The real web component needs WebGL: a plain custom tag here.
vi.mock('@google/model-viewer', () => ({}))

function openApp(url: string, account?: { role: 'business_admin'; businessId: string }) {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('embed page (ADR-0026)', { timeout: 20_000 }, () => {
  it('renders a published product without the public page chrome, and records an embed view (R-W5-3)', { timeout: 20_000 }, async () => {
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/embed/products/casa-lisboa/glam-velvet-sofa')
    expect(await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByText('Casa Lisboa Interiors')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Language' })).toBeNull() // no PublicShell header
    await waitFor(() => expect(document.querySelector('model-viewer')).not.toBeNull())
    expect(document.querySelector('model-viewer')).not.toHaveAttribute('ar')
    await waitFor(() => expect(record).toHaveBeenCalledWith(expect.objectContaining({ type: 'embed_view' })))
    expect(record).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'view' }))
  })

  it('opens the full product page in a new tab for AR, on the chosen finish, and records no AR launch', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const record = vi.spyOn(service, 'recordEvent')
    const chair = await service.getProductById('prd_sheen_chair')
    if (!chair.ok) throw new Error(chair.error.message)
    const second = chair.data.variants[1]
    if (!second) throw new Error('seed: the Sheen chair has several finishes')
    openApp('/embed/products/nordhaus/sheen-lounge-chair?lang=en')
    await screen.findByRole('heading', { name: 'Sheen Lounge Chair', level: 1 }, { timeout: 10_000 })
    await user.click(screen.getByRole('radio', { name: new RegExp(second.name.en) }))
    const link = screen.getByRole('link', { name: /View in your space \(opens Sanctus\)/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link).toHaveAttribute('href', embedProductPageUrl({ slug: 'nordhaus' }, { slug: 'sheen-lounge-chair' }, { tenant: false, variantId: second.id, lang: 'en' }))
    expect(link.getAttribute('href')).toBe(`${window.location.origin}/products/nordhaus/sheen-lounge-chair?variant=${second.id}&lang=en`)
    link.addEventListener('click', (e) => e.preventDefault()) // jsdom cannot open tabs
    await user.click(link)
    await act(async () => {})
    expect(record).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ar_activation' }))
  })

  it('shows "Product not available" for a draft, even to its signed-in owner, never an empty product', async () => {
    const spy = vi.spyOn(service, 'getPublicProduct')
    openApp('/embed/products/nordhaus/oslo-bar-stool?preview=1', { role: 'business_admin', businessId: 'biz_nord' })
    expect(await screen.findByRole('heading', { name: 'Product not available' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith('nordhaus', 'oslo-bar-stool')
    expect(screen.queryByText('Oslo Bar Stool')).toBeNull()
  })

  it('shows "Product not available" for an unknown product', async () => {
    openApp('/embed/products/casa-lisboa/no-such-piece')
    expect(await screen.findByRole('heading', { name: 'Product not available' }, { timeout: 10_000 })).toBeInTheDocument()
  })

  it('shows an error with a retry when loading fails', async () => {
    vi.spyOn(service, 'getPublicProduct').mockResolvedValue(fail('UNKNOWN', 'offline'))
    openApp('/embed/products/casa-lisboa/glam-velvet-sofa')
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Product not available' })).toBeNull()
  })
})

describe('"Embed on your website" in the owner dashboard', () => {
  it('offers the iframe code with the embed URL, and nothing for drafts', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    openApp('/dashboard/products', { role: 'business_admin', businessId: 'biz_casa' })
    const table = await screen.findByRole('table', {}, { timeout: 10_000 })
    const row = (await within(table).findByRole('link', { name: 'Glam Velvet Sofa' })).closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Actions for Glam Velvet Sofa' }))
    await user.click(screen.getByRole('menuitem', { name: 'Embed on your website' }))
    const dialog = await screen.findByRole('dialog', { name: 'Embed on your website' })
    const url = productEmbedUrl({ slug: 'casa-lisboa' }, { slug: 'glam-velvet-sofa' })
    const code = (within(dialog).getByRole('textbox', { name: 'Embed code' }) as HTMLTextAreaElement).value
    expect(code).toContain(`src="${url}"`)
    expect(code).toContain('loading="lazy"')
    expect(code).toContain('allow="fullscreen"')
    expect(code).toMatch(/title="Glam Velvet Sofa – Casa Lisboa Interiors"/)
    expect(within(dialog).getByText(/AR opens on the Sanctus product page/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Portuguese' }))
    expect((within(dialog).getByRole('textbox', { name: 'Embed code' }) as HTMLTextAreaElement).value).toContain(`src="${url}?lang=pt"`)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    const drafts = await service.getProducts({ businessId: 'biz_casa', status: 'draft' })
    const draft = drafts.ok ? drafts.data[0] : undefined
    if (!draft) throw new Error('seed has a Casa Lisboa draft')
    const draftRow = within(table).getByRole('link', { name: draft.name.en }).closest('tr') as HTMLElement
    await user.click(within(draftRow).getByRole('button', { name: `Actions for ${draft.name.en}` }))
    await user.click(screen.getByRole('menuitem', { name: 'Embed on your website (not public yet)' }))
    const draftDialog = await screen.findByRole('dialog', { name: 'Embed on your website' })
    expect(within(draftDialog).getByText('Not public yet.')).toBeInTheDocument()
    expect(within(draftDialog).queryByRole('textbox')).toBeNull()
  })

  it('escapes the title in the snippet', () => {
    expect(embedSnippet('https://x.example.com/embed/products/a', 'Sofa "Lux" <b>')).toContain('title="Sofa &quot;Lux&quot; &lt;b&gt;"')
  })
})

describe('vercel.json framing headers', () => {
  type Rule = { source: string; headers: { key: string; value: string }[] }
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { headers: Rule[] }
  /** Vercel applies every matching rule in order; a later rule's value for the same key wins. */
  const headersFor = (path: string) => {
    const out = new Map<string, string>()
    for (const rule of config.headers) if (new RegExp(`^${rule.source}$`).test(path)) for (const h of rule.headers) out.set(h.key, h.value)
    return out
  }

  it('lets any website frame the embed routes and nothing else', () => {
    for (const path of ['/embed/products/casa-lisboa/glam-velvet-sofa', '/embed/products/glam-velvet-sofa'])
      expect(headersFor(path).get('Content-Security-Policy')).toBe('frame-ancestors *')
    for (const path of ['/', '/products/casa-lisboa/glam-velvet-sofa', '/catalog/casa-lisboa', '/dashboard', '/admin/products', '/login', '/embed', '/embedded/x'])
      expect(headersFor(path).get('Content-Security-Policy')).toBe("frame-ancestors 'none'")
  })

  it('keeps the other security headers on the embed routes', () => {
    const h = headersFor('/embed/products/casa-lisboa/glam-velvet-sofa')
    expect(h.get('X-Content-Type-Options')).toBe('nosniff')
    expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(h.get('Permissions-Policy')).toBeTruthy()
    expect(h.get('Content-Security-Policy-Report-Only')).toBeTruthy()
  })
})
