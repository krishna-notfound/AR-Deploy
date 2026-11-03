import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu } from './Menu'

const MENU_HEIGHT = 120
const MENU_WIDTH = 192

function rect(top: number, left: number, size = 32): DOMRect {
  return { top, left, right: left + size, bottom: top + size, width: size, height: size, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

/** jsdom has no layout: give the trigger a rect and the menu a size. */
function mockLayout(trigger: DOMRect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('aria-haspopup') === 'menu' ? trigger : rect(0, 0)
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(MENU_HEIGHT)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(MENU_WIDTH)
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function renderMenu(align: 'start' | 'end' = 'end') {
  render(
    <DropdownMenu
      label="Row actions"
      trigger="..."
      align={align}
      items={[
        { label: 'Open product page', onSelect: () => {} },
        { label: 'Copy product URL', onSelect: () => {} },
      ]}
    />,
  )
}

describe('DropdownMenu', () => {
  beforeEach(() => setViewport(1024, 768))
  afterEach(() => vi.restoreAllMocks())

  it('renders the menu in document.body, outside the trigger wrapper', async () => {
    mockLayout(rect(100, 800))
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Row actions' })
    await userEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: 'Row actions' })
    expect(menu.parentElement).toBe(document.body)
    expect(trigger.parentElement?.contains(menu)).toBe(false)
    expect(menu.style.position).toBe('fixed')
  })

  it('opens below the trigger when there is room, right edge aligned to the trigger', async () => {
    mockLayout(rect(100, 800))
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    const menu = screen.getByRole('menu')
    expect(menu.style.top).toBe('136px') // trigger bottom 132 + 4 gap
    expect(menu.style.left).toBe(`${832 - MENU_WIDTH}px`)
  })

  it('flips above the trigger when it is near the viewport bottom', async () => {
    mockLayout(rect(720, 800)) // bottom 752; only 4px of room below
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    const menu = screen.getByRole('menu')
    expect(menu.style.top).toBe(`${720 - 4 - MENU_HEIGHT}px`)
    expect(menu.style.maxHeight).toBe(`${720 - 4 - 8}px`)
  })

  it('limits the height to the available space as a last resort', async () => {
    setViewport(1024, 200)
    mockLayout(rect(80, 800)) // 80 above, 88 below, menu 120 tall: flips to neither, uses the larger side
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    const menu = screen.getByRole('menu')
    expect(menu.style.maxHeight).toBe(`${200 - 112 - 4 - 8}px`)
  })

  it('stays 8px inside the viewport horizontally', async () => {
    mockLayout(rect(100, 4)) // trigger at the far left; end alignment would go negative
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    expect(screen.getByRole('menu').style.left).toBe('8px')
  })

  it('Escape closes the menu and returns focus to the trigger', async () => {
    mockLayout(rect(100, 800))
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Row actions' })
    await userEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Open product page' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Copy product URL' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('closes on a click outside, including a click inside the portal staying open', async () => {
    mockLayout(rect(100, 800))
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Row actions' }))
    await userEvent.click(screen.getByRole('menu')) // inside the portal: stays open
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
