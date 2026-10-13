import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { ArSessionOverlay, type ArOverlayHandlers } from './ArSessionOverlay'
import { type PlacementEvent, type PlacementState, initialPlacement, placementReducer } from './placement'

const run = (...events: PlacementEvent[]) => events.reduce(placementReducer, initialPlacement())
const STARTED: PlacementEvent = { type: 'started', now: 0 }
const FLOOR: PlacementEvent = { type: 'surface', found: true }
const PLACE: PlacementEvent = { type: 'place', now: 1000 }

function setup(state: PlacementState, extra: { loading?: boolean; error?: string | null; scaleVerified?: boolean } = {}) {
  const handlers: ArOverlayHandlers = { onPlace: vi.fn(), onMove: vi.fn(), onCancelMove: vi.fn(), onRotate: vi.fn(), onReset: vi.fn(), onExit: vi.fn() }
  render(
    <LanguageProvider>
      <ArSessionOverlay state={state} loading={extra.loading ?? false} error={extra.error ?? null} dims="219 × 102 × 79 cm" scaleVerified={extra.scaleVerified ?? true} {...handlers} />
    </LanguageProvider>,
  )
  return { handlers, user: userEvent.setup() }
}

beforeEach(() => sessionStorage.clear())

describe('ArSessionOverlay', () => {
  it('while scanning: explains what to do and cannot place yet', () => {
    setup(run(STARTED))
    expect(screen.getByRole('status')).toHaveTextContent('Move your phone slowly')
    expect(screen.getByRole('button', { name: 'Place here' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('with a floor in view: one primary action, Place here', async () => {
    const { handlers, user } = setup(run(STARTED, FLOOR))
    await user.click(screen.getByRole('button', { name: 'Place here' }))
    expect(handlers.onPlace).toHaveBeenCalledOnce()
  })

  it('after placing: Move, rotate 15° either way and Start over; no Place button', async () => {
    const { handlers, user } = setup(run(STARTED, FLOOR, PLACE))
    expect(screen.queryByRole('button', { name: 'Place here' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await user.click(screen.getByRole('button', { name: 'Rotate left 15°' }))
    await user.click(screen.getByRole('button', { name: 'Rotate right 15°' }))
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(handlers.onMove).toHaveBeenCalledOnce()
    expect(handlers.onRotate).toHaveBeenNthCalledWith(1, -1)
    expect(handlers.onRotate).toHaveBeenNthCalledWith(2, 1)
    expect(handlers.onReset).toHaveBeenCalledOnce()
  })

  it('while moving: Place here confirms and Cancel keeps the old spot', async () => {
    const { handlers, user } = setup(run(STARTED, FLOOR, PLACE, { type: 'move' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Place here' }))
    expect(handlers.onCancelMove).toHaveBeenCalledOnce()
    expect(handlers.onPlace).toHaveBeenCalledOnce()
  })

  it('always offers Exit and shows the real size, marked only when verified', async () => {
    const { handlers, user } = setup(run(STARTED, FLOOR, PLACE), { scaleVerified: false })
    expect(screen.getByText('219 × 102 × 79 cm')).toBeInTheDocument()
    expect(screen.getByText('Size not verified')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Exit AR' }))
    expect(handlers.onExit).toHaveBeenCalledOnce()
  })

  it('marks every control so screen taps on it are not treated as "place here"', () => {
    setup(run(STARTED, FLOOR, PLACE))
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('data-xr-control')
  })

  it('shows loading and error states', () => {
    setup(run(STARTED), { loading: true })
    expect(screen.getByRole('status')).toHaveTextContent('Loading the 3D model')
  })

  it('is translated to Portuguese', () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    setup(run(STARTED, FLOOR))
    expect(screen.getByRole('button', { name: 'Colocar aqui' })).toBeInTheDocument()
  })
})
