// The heading above a catalogue's pieces from the Website Editor (ADR-0067): the published text in the current language, else the
// built-in "The pieces" / "As peças". Whole-app renders in demo mode.
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent, type TextPair } from '@/domain/siteContent'
import { content, service } from '@/services'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

async function publishHeading(catalogHeading: TextPair) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), chrome: { catalogHeading } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear()
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

describe('the catalogue heading', () => {
  it('is the built-in heading when nothing is published', async () => {
    openApp('/catalog/nordhaus')
    expect(await screen.findByRole('heading', { level: 2, name: 'The pieces' })).toBeInTheDocument()
  })

  it('is the published heading on every catalogue', async () => {
    await publishHeading({ en: 'Our collection', pt: 'A nossa coleção' })
    const view = openApp('/catalog/nordhaus')
    expect(await screen.findByRole('heading', { level: 2, name: 'Our collection' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'The pieces' })).toBeNull()
    view.unmount()
    openApp('/catalog/casa-lisboa')
    expect(await screen.findByRole('heading', { level: 2, name: 'Our collection' })).toBeInTheDocument()
  })

  it('in Portuguese is the Portuguese heading, or the built-in one when only English was written', async () => {
    await publishHeading({ en: 'Our collection' })
    localStorage.setItem('arfurn:lang', 'pt')
    openApp('/catalog/nordhaus')
    expect(await screen.findByRole('heading', { level: 2, name: 'As peças' })).toBeInTheDocument()
  })
})
