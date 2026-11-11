// The company's own catalogue banner in the shared company form (ADR-0065): next to the logo, for the platform admin (edit) and the
// company owner, saved with the other fields, removable (back to the default). The crop dialog is a stand-in; the service is the demo one.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { CROP } from '@/test/cropDialogStub'
import { BusinessForm, type BusinessFormMode } from './BusinessForm'

vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub'))

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => vi.restoreAllMocks())

function Edit({ mode }: { mode: BusinessFormMode }) {
  const q = useServiceQuery(() => service.getBusinessById('biz_nord'), [])
  return q.data ? <BusinessForm business={q.data} mode={mode} /> : <p>loading</p>
}

function renderForm(mode: BusinessFormMode) {
  const router = createMemoryRouter([{ path: '/b', element: mode === 'create' ? <BusinessForm business={null} mode="create" /> : <Edit mode={mode} /> }], { initialEntries: ['/b'] })
  render(
    <LanguageProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </LanguageProvider>,
  )
}

const stubUploads = () =>
  vi
    .spyOn(service, 'uploadAsset')
    .mockImplementation(async ({ kind }) => ok({ url: kind === 'bannerOriginal' ? 'data:image/jpeg;base64,orig' : 'data:image/webp;base64,copy', status: 'valid' } as never))
const png = () => new File([new Uint8Array(64)], 'shop.png', { type: 'image/png' })
const saved = async () => {
  const r = await service.getBusinessById('biz_nord')
  if (!r.ok) throw new Error('read')
  return r.data
}

describe.each<[string, BusinessFormMode]>([
  ['the platform admin editing a company', 'edit'],
  ['the company owner', 'owner'],
])('the banner field: %s', (_who, mode) => {
  it('sits next to the logo and starts without a banner', async () => {
    renderForm(mode)
    expect(await screen.findByText('Catalogue banner')).toBeInTheDocument()
    expect(screen.getByLabelText(/^(Upload|Replace) logo/).compareDocumentPosition(screen.getByLabelText('Upload banner')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit picture: catalogue banner' })).toBeNull()
  })

  it('upload, then Save changes sends only the banner, and the company keeps it', async () => {
    const user = userEvent.setup()
    stubUploads()
    const update = vi.spyOn(service, 'updateBusiness')
    renderForm(mode)
    await user.upload(await screen.findByLabelText('Upload banner'), png())
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    await screen.findByRole('button', { name: 'Edit picture: catalogue banner' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]![1]).toEqual({ banner: { url: 'data:image/webp;base64,copy', originalUrl: 'data:image/jpeg;base64,orig', crop: CROP } })
    expect((await saved()).banner).toEqual({ url: 'data:image/webp;base64,copy', originalUrl: 'data:image/jpeg;base64,orig', crop: CROP })
  })

  it('Remove then Save changes clears the banner (back to the default)', async () => {
    const user = userEvent.setup()
    const biz = await saved()
    await service.updateBusiness(biz.id, { banner: { url: 'data:image/webp;base64,old' } })
    const update = vi.spyOn(service, 'updateBusiness')
    renderForm(mode)
    await user.click(await screen.findByRole('button', { name: 'Remove the banner (use the default)' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0]![1]).toEqual({ banner: undefined })
    expect((await saved()).banner).toBeUndefined()
  })

  it('an unsaved banner makes the form dirty; nothing is sent without Save', async () => {
    const user = userEvent.setup()
    stubUploads()
    const update = vi.spyOn(service, 'updateBusiness')
    renderForm(mode)
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeDisabled()
    await user.upload(screen.getByLabelText('Upload banner'), png())
    await user.click(await screen.findByRole('button', { name: 'Save crop' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled())
    expect(update).not.toHaveBeenCalled()
  })
})

describe('the banner field when a company is created', () => {
  it('asks to save the company first (the banner needs its folder), with no dead button', async () => {
    renderForm('create')
    expect(await screen.findByText('Save the company first, then you can add a banner.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload banner')).toBeNull()
  })
})
