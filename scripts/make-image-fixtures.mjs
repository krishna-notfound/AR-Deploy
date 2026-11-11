// Generates the test pictures in tests/fixtures/images/ for the image crop dialog (ADR-0063), using Chromium from
// Playwright (already a dev dependency): each picture is drawn on a canvas and saved as PNG or JPEG.
// Every picture is asymmetric (a coloured border per side and a big letter F), so a stretched, mirrored or wrongly
// cropped result can be told from the original.
// Run: node scripts/make-image-fixtures.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'images')
mkdirSync(out, { recursive: true })

/** name, size, file type, and the background: 'color' (a gradient), 'white' (an object on white) or 'clear' (transparent PNG). */
const FIXTURES = [
  { name: 'square.jpg', w: 1000, h: 1000, type: 'image/jpeg', bg: 'color' },
  { name: 'portrait.jpg', w: 900, h: 1200, type: 'image/jpeg', bg: 'color' },
  { name: 'landscape.jpg', w: 1600, h: 1000, type: 'image/jpeg', bg: 'color' },
  { name: 'wide-4x1.jpg', w: 2000, h: 500, type: 'image/jpeg', bg: 'color' },
  { name: 'tall-1x4.jpg', w: 500, h: 2000, type: 'image/jpeg', bg: 'color' },
  { name: 'transparent.png', w: 800, h: 800, type: 'image/png', bg: 'clear' },
  { name: 'white-background.jpg', w: 1200, h: 900, type: 'image/jpeg', bg: 'white' },
  { name: 'large-4000.jpg', w: 4000, h: 3000, type: 'image/jpeg', bg: 'color' },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of FIXTURES) {
  const dataUrl = await page.evaluate(({ w, h, type, bg }) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    if (bg === 'color') {
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, '#d9c9a8')
      grad.addColorStop(1, '#6e8a7a')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    } else if (bg === 'white') {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, w, h)
    }
    const m = Math.min(w, h)
    // A border per side: top red, right green, bottom blue, left yellow.
    const b = Math.max(6, Math.round(m / 40))
    g.fillStyle = '#c0392b'
    g.fillRect(0, 0, w, b)
    g.fillStyle = '#27ae60'
    g.fillRect(w - b, 0, b, h)
    g.fillStyle = '#2980b9'
    g.fillRect(0, h - b, w, b)
    g.fillStyle = '#f1c40f'
    g.fillRect(0, 0, b, h)
    // The object: a rounded block (or a circle for the transparent one) and a big F, not centred, so mirroring shows.
    g.fillStyle = bg === 'white' ? '#3a352f' : '#1d1c1a'
    if (bg === 'clear') {
      g.beginPath()
      g.arc(w * 0.5, h * 0.5, m * 0.36, 0, Math.PI * 2)
      g.fill()
    } else {
      g.fillRect(w * 0.22, h * 0.3, w * 0.56, h * 0.4)
    }
    g.fillStyle = '#f3f0e9'
    g.font = `bold ${Math.round(m * 0.38)}px sans-serif`
    g.textBaseline = 'middle'
    g.fillText('F', w * 0.34, h * 0.52)
    return c.toDataURL(type, 0.86)
  }, f)
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  writeFileSync(join(out, f.name), bytes)
  console.log(f.name, `${f.w}x${f.h}`, `${Math.round(bytes.length / 1024)} KB`)
}
await browser.close()
