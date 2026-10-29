import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { LEGAL_CONTENT } from '../legal/content.generated'
import { MarkdownField } from './MarkdownField'

const ACCOUNT_KEY = 'arfurn:account'

function openEditor(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

function Field({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start)
  return <MarkdownField label="Body" lang="en" value={value} onChange={setValue} />
}

describe('MarkdownField toolbar', () => {
  it('inserts Markdown at the cursor and keeps the selection useful', async () => {
    render(<Field start="say hello now" />)
    const box = screen.getByRole('textbox', { name: 'Body' }) as HTMLTextAreaElement
    box.focus()
    box.setSelectionRange(4, 9)
    await userEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(box.value).toBe('say **hello** now')
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('hello')

    box.setSelectionRange(box.value.length, box.value.length)
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(box.value).toBe('say **hello** now[link text](https://)')
    expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('https://')

    box.setSelectionRange(0, 0)
    await userEvent.click(screen.getByRole('button', { name: 'Heading' }))
    expect(box.value.startsWith('## say')).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(box.value.startsWith('- ## say')).toBe(true)
  })

  it('previews the text with the public renderer: raw HTML stays text and a javascript: link is not a link', async () => {
    render(<Field start={'**Hi** <b>raw</b> [bad](javascript:alert(1)) [ok](https://example.com)'} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Preview' }))
    expect(screen.getByText('Hi').tagName).toBe('STRONG')
    expect(screen.getByText(/<b>raw<\/b>/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByRole('link', { name: 'ok' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('b')).toBeNull()
  })
})

describe('Editor in Portuguese', () => {
  it('shows the shell and the pages list in pt-PT', { timeout: 30_000 }, async () => {
    openEditor('/admin/editor/pages?lang=pt')
    expect(await screen.findByRole('heading', { level: 1, name: 'Editor do site' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Sem alterações' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Nova página' })).toBeInTheDocument()
    expect(screen.getByText('Ainda nada publicado')).toBeInTheDocument()
  })
})

describe('Pages screen', () => {
  it('lists Terms and Privacy as Original and a new page as New, and creates a page that is not in the footer', { timeout: 30_000 }, async () => {
    openEditor('/admin/editor')
    const table = await screen.findByRole('table')
    const terms = within(table).getByRole('link', { name: 'Terms' }).closest('tr')!
    expect(within(terms).getByText('Original')).toBeInTheDocument()
    expect(within(table).getByText('/privacy')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'New page' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Untitled page' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Title \(English\)/ }), 'About us')
    // The address follows the title until it is typed by hand.
    expect(screen.getByRole('textbox', { name: /Address/ })).toHaveValue('about-us')
    await userEvent.click(screen.getByRole('link', { name: 'All pages' }))
    const row = (await screen.findByRole('link', { name: 'About us' })).closest('tr')!
    expect(within(row).getByText('New')).toBeInTheDocument()
    expect(within(row).getByText('/pages/about-us')).toBeInTheDocument()
    expect(within(row).getByText('No')).toBeInTheDocument()
  })

  it('shows slug messages: reserved word, duplicate, bad format', { timeout: 30_000 }, async () => {
    openEditor('/admin/editor')
    const create = async (title: string) => {
      await userEvent.click(await screen.findByRole('button', { name: 'New page' }))
      await userEvent.type(await screen.findByRole('textbox', { name: /Title \(English\)/ }), title)
      return screen.getByRole('textbox', { name: /Address/ })
    }
    const first = await create('Shipping')
    expect(first).toHaveValue('shipping')
    await userEvent.click(screen.getByRole('link', { name: 'All pages' }))

    const second = await create('Returns')
    await userEvent.clear(second)
    await userEvent.type(second, 'admin')
    expect(await screen.findByText('This address is reserved by the site. Choose another.')).toBeInTheDocument()
    await userEvent.clear(second)
    await userEvent.type(second, 'shipping')
    expect(await screen.findByText('Another page already uses this address.')).toBeInTheDocument()
    await userEvent.clear(second)
    await userEvent.type(second, 'Bad Slug-')
    expect(second).toHaveValue('bad-slug-')
    expect(await screen.findByText('Use lowercase letters, numbers and single hyphens only.')).toBeInTheDocument()
    // Problems also list in the top bar and keep Publish disabled.
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('asks before deleting a page', { timeout: 30_000 }, async () => {
    openEditor('/admin/editor')
    await userEvent.click(await screen.findByRole('button', { name: 'New page' }))
    await userEvent.type(await screen.findByRole('textbox', { name: /Title \(English\)/ }), 'Old news')
    await userEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Old news"?' })
    // Cancel keeps it.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('heading', { level: 2, name: 'Old news' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete page' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText(/No extra pages yet/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Old news' })).toBeNull()
  })

  it('Terms starts from the built-in text; editing marks it Edited and Reset brings the original back', { timeout: 30_000 }, async () => {
    openEditor('/admin/editor/pages/terms')
    const [en] = (await screen.findAllByRole('textbox')) as HTMLTextAreaElement[]
    expect(en!.value).toBe(LEGAL_CONTENT.terms.en)
    fireEvent.change(en!, { target: { value: '# My terms\n\nShort.' } })
    expect(await screen.findByText(/You edited this text/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reset to original' }))
    await waitFor(() => expect((screen.getAllByRole('textbox')[0] as HTMLTextAreaElement).value).toBe(LEGAL_CONTENT.terms.en))
    expect(screen.queryByText(/You edited this text/)).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'All pages' }))
    const row = (await screen.findByRole('link', { name: 'Terms' })).closest('tr')!
    expect(within(row).getByText('Original')).toBeInTheDocument()
  })

  it('footer panel orders the footer pages and previews the footer', { timeout: 30_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    const page = (id: string, title: string, order: number) => ({ id, slug: id, title: { en: title }, body: { en: 'x' }, showInFooter: true, order })
    await content.saveContentDraft({ ...s.data.draft, customPages: [page('shipping', 'Shipping', 0), page('returns', 'Returns', 1)] }, s.data.draftUpdatedAt)
    openEditor('/admin/editor/pages')
    const preview = await screen.findByTestId('footer-preview')
    expect(preview).toHaveTextContent('Privacy · Terms · Shipping · Returns')
    await userEvent.click(screen.getByRole('button', { name: 'Move Returns up' }))
    expect(screen.getByTestId('footer-preview')).toHaveTextContent('Privacy · Terms · Returns · Shipping')
  })
})
