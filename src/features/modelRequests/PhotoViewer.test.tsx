import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { ModelRequestPhoto } from '@/domain/modelRequests'
import { PhotoThumb, PhotoViewer } from './PhotoViewer'

// Final review: a signed photo link expires after an hour, so Retry and a failed download must ask the page for
// fresh links (its refetch signs them again) instead of retrying the same dead URL.
const download = vi.hoisted(() => ({ fn: vi.fn<(url: string, name: string) => Promise<void>>() }))
vi.mock('@/lib/download', () => ({ downloadUrl: download.fn }))

const photo: ModelRequestPhoto = { storagePath: 'b/r/p.jpg', fileName: 'p.jpg', sizeBytes: 1000, url: 'https://x.test/signed?token=old' }

afterEach(() => {
  download.fn.mockReset()
})

describe('PhotoViewer: expired links (final review)', () => {
  it('a thumbnail whose link failed asks for fresh links on Retry, even though it has a URL', async () => {
    const onReload = vi.fn()
    render(<PhotoThumb photo={photo} index={0} onOpen={() => undefined} onReload={onReload} />)
    fireEvent.error(document.querySelector('img')!)
    expect(await screen.findByText("This photo couldn't be loaded.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /^Open photo 1:/ })).toBeInTheDocument()
  })

  it('the viewer image asks for fresh links on Retry', async () => {
    const onReload = vi.fn()
    render(
      <ToastProvider>
        <PhotoViewer photos={[photo]} index={0} onIndex={() => undefined} onClose={() => undefined} onReload={onReload} />
      </ToastProvider>,
    )
    fireEvent.error(screen.getByRole('img', { name: 'p.jpg' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it("a failed download asks for fresh links and says 'Try again.'", async () => {
    download.fn.mockRejectedValue(new Error('download failed (400)'))
    const onReload = vi.fn()
    render(
      <ToastProvider>
        <PhotoViewer photos={[photo]} index={0} onIndex={() => undefined} onClose={() => undefined} onReload={onReload} />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Download original' }))
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(download.fn).toHaveBeenCalledWith(photo.url, 'p.jpg')
    expect(await screen.findByText("The photo couldn't be downloaded.")).toBeInTheDocument()
    expect(screen.getByText('Try again.')).toBeInTheDocument()
  })
})
