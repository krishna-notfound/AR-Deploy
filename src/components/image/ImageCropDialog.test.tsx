import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { fillFrameCrop, fitWholeCrop } from '@/lib/imageCrop'
import { ImageCropDialog, type ImageCropDialogProps } from './ImageCropDialog'

// The real cropper needs a laid-out browser (sizes, image load); here it reports a 400x200 display of a 2000x1000
// picture and shows the position and zoom it was given. Its drag and wheel handling is the library's.
const lib = vi.hoisted(() => ({ media: { width: 400, height: 200, naturalWidth: 2000, naturalHeight: 1000 } }))
vi.mock('react-easy-crop', async () => {
  const React = await import('react')
  type P = {
    crop: { x: number; y: number }
    zoom: number
    cropSize: { width: number; height: number }
    minZoom: number
    maxZoom: number
    onMediaLoaded: (m: typeof lib.media) => void
    onCropChange: (p: { x: number; y: number }) => void
    onZoomChange: (z: number) => void
    cropperProps?: Record<string, string>
  }
  function FakeCropper(p: P) {
      const loaded = React.useRef(p.onMediaLoaded)
      loaded.current = p.onMediaLoaded
      React.useEffect(() => loaded.current(lib.media), [])
      return (
        <div
          data-testid="cropper"
          tabIndex={0}
          aria-label={p.cropperProps?.['aria-label']}
          data-zoom={p.zoom}
          data-x={p.crop.x}
          data-y={p.crop.y}
          data-min={p.minZoom}
          data-max={p.maxZoom}
          data-frame={`${p.cropSize.width}x${p.cropSize.height}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') p.onCropChange({ x: p.crop.x + 10, y: p.crop.y })
          }}
        >
          <button type="button" onClick={() => p.onZoomChange(p.zoom * 2)}>
            wheel
          </button>
        </div>
      )
  }
  return { default: FakeCropper }
})

const renderCrop = vi.hoisted(() => vi.fn())
vi.mock('@/lib/imageCrop', async (orig) => ({ ...(await orig<typeof import('@/lib/imageCrop')>()), renderCrop }))

const ASPECT = 4 / 5
const file = () => new File(['x'], 'sofa.jpg', { type: 'image/jpeg' })
const attr = (name: string) => Number(screen.getByTestId('cropper').getAttribute(name))

function setup(props: Partial<ImageCropDialogProps> = {}, lang?: 'pt') {
  if (lang) localStorage.setItem(LANG_KEY, lang)
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(
    <LanguageProvider>
      <ImageCropDialog file={file()} aspect={ASPECT} title="Adjust the photo" onSave={onSave} onCancel={onCancel} {...props} />
    </LanguageProvider>,
  )
  return { onSave, onCancel, user: userEvent.setup() }
}

beforeEach(() => {
  localStorage.clear()
  lib.media = { width: 400, height: 200, naturalWidth: 2000, naturalHeight: 1000 }
  renderCrop.mockReset()
  renderCrop.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }))
  URL.createObjectURL = vi.fn(() => 'blob:test/picture')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

// Frame in jsdom (nothing is laid out): 288 px wide (320 less 2x16 padding), 360 tall. The picture is shown 400x200, so
// zoom 1 shows it fitted in the stage; the frame is as wide as the picture at zoom 0.72, as tall at 1.8.
const WHOLE_ZOOM = 288 / 400
const FILL_ZOOM = 360 / 200

describe('ImageCropDialog', () => {
  it('opens on the whole picture, fitted, with a note that it does not fill the frame', async () => {
    setup()
    expect(await screen.findByRole('dialog', { name: 'Adjust the photo' })).toBeInTheDocument()
    await screen.findByTestId('cropper')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("This picture doesn't fill the frame."))
    expect(attr('data-zoom')).toBeCloseTo(WHOLE_ZOOM, 5)
    expect(attr('data-min')).toBeCloseTo(WHOLE_ZOOM, 5)
    expect(attr('data-x')).toBeCloseTo(0, 5)
    expect(attr('data-y')).toBeCloseTo(0, 5)
    expect(screen.getByTestId('cropper')).toHaveAttribute('data-frame', '288x360')
  })

  it('Fill the frame covers the frame (no nudge) and Show whole picture goes back', async () => {
    const { user } = setup()
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Fill the frame' }))
    expect(attr('data-zoom')).toBeCloseTo(FILL_ZOOM, 5)
    expect(screen.queryByText("This picture doesn't fill the frame.")).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show whole picture' }))
    expect(attr('data-zoom')).toBeCloseTo(WHOLE_ZOOM, 5)
    expect(screen.getByText("This picture doesn't fill the frame.")).toBeInTheDocument()
  })

  it('Save of the untouched dialog sends the whole picture: a crop reaching past it, whole: true', async () => {
    const { user, onSave } = setup()
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const result = onSave.mock.calls[0]![0]
    const expected = fitWholeCrop(2000, 1000, ASPECT)
    expect(result.whole).toBe(true)
    expect(result.crop.x).toBeCloseTo(expected.x, 1)
    expect(result.crop.y).toBeCloseTo(expected.y, 1)
    expect(result.crop.width).toBeCloseTo(expected.width, 1)
    expect(result.crop.height).toBeCloseTo(expected.height, 1)
    expect(result.blob.type).toBe('image/webp')
    expect(renderCrop).toHaveBeenCalledWith(expect.any(File), result.crop)
  })

  it('Fill the frame then Save sends the centred cover crop, whole: false', async () => {
    const { user, onSave } = setup()
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Fill the frame' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const result = onSave.mock.calls[0]![0]
    const expected = fillFrameCrop(2000, 1000, ASPECT)
    expect(result.whole).toBe(false)
    expect(result.crop.x).toBeCloseTo(expected.x, 1)
    expect(result.crop.width).toBeCloseTo(expected.width, 1)
    expect(result.crop.height).toBeCloseTo(1000, 1)
  })

  it('starts from initialCrop, and Reset returns to it', async () => {
    const initialCrop = { x: 900, y: 0, width: 800, height: 1000 }
    const { user, onSave } = setup({ initialCrop })
    await screen.findByTestId('cropper')
    expect(attr('data-zoom')).toBeCloseTo(FILL_ZOOM, 5)
    await user.click(screen.getByRole('button', { name: 'Show whole picture' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(attr('data-zoom')).toBeCloseTo(FILL_ZOOM, 5)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]![0].crop.x).toBeCloseTo(900, 1)
  })

  it('zooms with the slider, the buttons, the + and − keys and the wheel (the cropper)', async () => {
    const { user } = setup()
    await screen.findByTestId('cropper')
    const start = attr('data-zoom')
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(attr('data-zoom')).toBeCloseTo(start * 1.25, 5)
    await user.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(attr('data-zoom')).toBeCloseTo(start, 5)
    screen.getByTestId('cropper').focus()
    await user.keyboard('+')
    expect(attr('data-zoom')).toBeCloseTo(start * 1.25, 5)
    await user.keyboard('-')
    expect(attr('data-zoom')).toBeCloseTo(start, 5)
    await user.click(screen.getByRole('button', { name: 'wheel' }))
    expect(attr('data-zoom')).toBeCloseTo(start * 2, 5)
    const slider = screen.getByRole('slider', { name: 'Zoom' })
    expect(slider).toHaveAttribute('min')
    act(() => {
      slider.focus()
    })
  })

  it('moves with the arrow keys', async () => {
    const { user } = setup()
    await screen.findByTestId('cropper')
    screen.getByTestId('cropper').focus()
    await user.keyboard('{ArrowRight}')
    expect(attr('data-x')).toBe(10)
    await user.keyboard('{ArrowRight}')
    expect(attr('data-x')).toBe(20)
  })

  it('Cancel, Escape and the close button call onCancel; nothing is saved', async () => {
    const { user, onCancel, onSave } = setup()
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: /^close/i }))
    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onSave).not.toHaveBeenCalled()
    expect(renderCrop).not.toHaveBeenCalled()
  })

  it('shows Saving… while onSave runs and stays open with an error if it throws', async () => {
    let fail!: (e: Error) => void
    const { user } = setup({ onSave: () => new Promise<void>((_, reject) => (fail = reject)) })
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: /Saving/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await act(async () => fail(new Error('boom')))
    expect(await screen.findByRole('alert')).toHaveTextContent('The picture could not be saved. Try again.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('a picture over the size limit says so', async () => {
    const { ImageTooLargeError } = await import('@/lib/image')
    renderCrop.mockRejectedValue(new ImageTooLargeError())
    const { user } = setup()
    await screen.findByTestId('cropper')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
  })

  it('opens a stored original from src (fetched into a blob)', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png' })))
    vi.stubGlobal('fetch', fetchMock)
    const { user, onSave } = setup({ file: undefined, src: 'https://signed.test/original.png?token=1' })
    await screen.findByTestId('cropper')
    expect(fetchMock).toHaveBeenCalledWith('https://signed.test/original.png?token=1')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(renderCrop.mock.calls[0]![0]).toBeInstanceOf(Blob)
  })

  it('a picture that cannot be opened shows an error and nothing to save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    setup({ file: undefined, src: 'https://signed.test/gone.png' })
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be opened')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a picture already in the frame shape fills it: no note, whole: false', async () => {
    lib.media = { width: 320, height: 400, naturalWidth: 800, naturalHeight: 1000 }
    const { user, onSave } = setup()
    await screen.findByTestId('cropper')
    expect(screen.queryByText("This picture doesn't fill the frame.")).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0]![0].whole).toBe(false)
  })

  it('is in Portuguese (pt-PT) with the language switched', async () => {
    setup({}, 'pt')
    await screen.findByTestId('cropper')
    for (const name of ['Preencher a moldura', 'Mostrar a imagem inteira', 'Repor', 'Cancelar', 'Guardar', 'Aproximar', 'Afastar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByText('Esta imagem não preenche a moldura.')).toBeInTheDocument()
  })

  it('the picture and frame controls are all real buttons with names (no dead buttons)', async () => {
    setup()
    await screen.findByTestId('cropper')
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAccessibleName()
  })
})
