import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import EditorLayout from './EditorLayout'
import { useEditor } from './EditorContext'

const ACCOUNT_KEY = 'arfurn:account'
const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))

/** A stand-in screen: one button that edits the document, as a real screen does. */
function Probe() {
  const { draft, setDraft } = useEditor()
  return (
    <div>
      <p data-testid="ig">{draft.social.instagram ?? ''}</p>
      <button type="button" onClick={() => setDraft((d) => ({ ...d, social: { ...d.social, instagram: 'https://instagram.com/sanctus' } }))}>
        Edit
      </button>
      <button type="button" onClick={() => setDraft((d) => ({ ...d, customPages: [...d.customPages, { id: 'p1', slug: 'Bad Slug', title: { en: 'About' }, body: { en: 'x' }, showInFooter: false, order: 0 }] }))}>
        Break
      </button>
    </div>
  )
}

function renderEditor() {
  const router = createMemoryRouter([{ path: '/admin/editor', element: <EditorLayout />, children: [{ path: 'pages', element: <Probe /> }] }], { initialEntries: ['/admin/editor/pages'] })
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  )
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  asStaff('admin')
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('Editor navigation', () => {
  it('shows the Editor item to staff with content.manage and hides it from Team', { timeout: 30_000 }, async () => {
    window.history.replaceState(null, '', '/admin')
    const admin = render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Website editor' })).toHaveAttribute('href', '/admin/editor')
    admin.unmount()

    asStaff('team')
    window.history.replaceState(null, '', '/admin')
    render(<App />)
    const teamNav = await screen.findByRole('navigation', { name: 'Main' })
    await within(teamNav).findByRole('link', { name: /Overview/ })
    expect(within(teamNav).queryByRole('link', { name: 'Website editor' })).toBeNull()
  })
})

describe('Editor shell', () => {
  it('Publish says "No changes" and is disabled until the draft differs from the published content', async () => {
    renderEditor()
    const publish = await screen.findByRole('button', { name: 'No changes' })
    expect(publish).toBeDisabled()
    expect(screen.getByText('Nothing published yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeEnabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('autosaves, then Publish confirms with the counts of summarizeChanges and publishes', { timeout: 20_000 }, async () => {
    const publishSpy = vi.spyOn(content, 'publishContent')
    renderEditor()
    await screen.findByRole('button', { name: 'No changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Publish 1 change to the live site?')).toBeInTheDocument()
    const list = within(dialog).getByRole('list', { name: 'Changes by group' })
    expect(within(list).getByText('Social links').parentElement).toHaveTextContent('1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Live: version 1')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('button', { name: 'No changes' })).toBeDisabled()
    const pub = await content.getPublishedChrome()
    expect(pub.ok && pub.data.social.instagram).toBe('https://instagram.com/sanctus')
  })

  it('a draft_conflict shows the reload banner; Reload brings the other change in', { timeout: 20_000 }, async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'No changes' })
    // Someone else saves first.
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    const other = { ...s.data.draft, social: { facebook: 'https://facebook.com/x' } }
    await content.saveContentDraft(other, s.data.draftUpdatedAt)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 6000 })
    expect(alert).toHaveTextContent('Someone else changed the draft. Reload to see their changes.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByTestId('ig')).toHaveTextContent('')
  })

  it('lists problems and keeps Publish disabled while the draft is invalid', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'No changes' })
    await userEvent.click(screen.getByRole('button', { name: 'Break' }))
    const summary = await screen.findByText('1 problem to fix before publishing')
    await userEvent.click(summary)
    expect(screen.getByText(/Use lowercase letters, numbers and single hyphens only\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('History lists versions newest first and Restore loads one into the draft with a notice', { timeout: 30_000 }, async () => {
    // Two published versions.
    for (const url of ['https://instagram.com/one', 'https://instagram.com/two']) {
      const s = await content.getContentDraft()
      if (!s.ok) throw new Error('draft')
      const saved = await content.saveContentDraft({ ...s.data.draft, social: { instagram: url } }, s.data.draftUpdatedAt)
      if (!saved.ok) throw new Error('save')
      await content.publishContent(saved.data.draftUpdatedAt)
    }
    const restoreSpy = vi.spyOn(content, 'restoreContentVersion')
    renderEditor()
    await screen.findByText('Live: version 2')
    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    const dialog = await screen.findByRole('dialog', { name: 'History' })
    const rows = await within(dialog).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(/^Version 2,/)
    expect(rows[1]).toHaveTextContent(/^Version 1,/)
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'Restore this version' }))
    const confirm = await screen.findByRole('dialog', { name: 'Restore version 1 into the draft?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Restore this version' }))
    await waitFor(() => expect(restoreSpy).toHaveBeenCalledWith(1, expect.any(String)))
    expect(await screen.findByText('Restored version 1 into the draft. Publish to make it live.')).toBeInTheDocument()
    expect(screen.getByTestId('ig')).toHaveTextContent('https://instagram.com/one')
    // The live site did not change.
    expect(screen.getByText('Live: version 2')).toBeInTheDocument()
    await act(async () => {})
  })
})
