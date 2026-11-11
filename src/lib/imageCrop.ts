// Crop maths and rendering for the image crop dialog (ADR-0063). Pure helpers first; renderCrop is the only part that
// touches a canvas. Nothing here is automatic: a crop exists only because the user chose it, and the original is never touched.
import type { ImageCrop } from '@/domain/types'
import { decode, ImageTooLargeError, imageSize, MAX_PIXELS } from './image'

/**
 * A rectangle in the ORIGINAL picture's pixels (EXIF orientation applied). It may extend past the picture: a "whole
 * picture" save of a picture that is not the frame's shape is the smallest frame-shaped rectangle around it.
 */
export type CropArea = ImageCrop

export interface Size {
  width: number
  height: number
}

/** The picture as the cropper shows it: displayed size at zoom 1 and its real pixel size. */
export interface MediaSize extends Size {
  naturalWidth: number
  naturalHeight: number
}

/** The cropper's position: the picture centre's offset from the frame centre (display px) and its zoom. */
export interface CropView {
  crop: { x: number; y: number }
  zoom: number
}

/** Output of renderCrop: the long side is at most 2000 px, WebP at 0.85 (JPEG where WebP cannot be written). */
export const CROP_OUTPUT = { maxSide: 2000, type: 'image/webp', quality: 0.85 } as const

/** The whole picture, fitted: the smallest frame-shaped rectangle that contains it, centred on it. */
export function fitWholeCrop(imgW: number, imgH: number, aspect: number): CropArea {
  if (imgW / imgH >= aspect) {
    const height = imgW / aspect
    return { x: 0, y: (imgH - height) / 2, width: imgW, height }
  }
  const width = imgH * aspect
  return { x: (imgW - width) / 2, y: 0, width, height: imgH }
}

/** "Fill the frame": the largest frame-shaped rectangle inside the picture, centred on it. */
export function fillFrameCrop(imgW: number, imgH: number, aspect: number): CropArea {
  if (imgW / imgH >= aspect) {
    const width = imgH * aspect
    return { x: (imgW - width) / 2, y: 0, width, height: imgH }
  }
  const height = imgW / aspect
  return { x: 0, y: (imgH - height) / 2, width: imgW, height }
}

/** Slack for rounding: the crop may sit half a pixel outside the picture and still count as covered. */
const EDGE_SLACK = 0.5

/** True when the crop lies inside the picture, so the frame has picture all over it (no empty margin). */
export function coversFrame(crop: CropArea, imgW: number, imgH: number): boolean {
  return crop.x >= -EDGE_SLACK && crop.y >= -EDGE_SLACK && crop.x + crop.width <= imgW + EDGE_SLACK && crop.y + crop.height <= imgH + EDGE_SLACK
}

/** True when the crop shares at least some picture with the frame (a crop entirely off the picture cannot be saved). */
export function touchesPicture(crop: CropArea, imgW: number, imgH: number): boolean {
  return Math.min(crop.x + crop.width, imgW) - Math.max(crop.x, 0) > 0 && Math.min(crop.y + crop.height, imgH) - Math.max(crop.y, 0) > 0
}

/**
 * The cropper's zoom for the two named states, where zoom 1 is the picture fitted in the stage: `whole` shows all of
 * the picture inside the frame, `fill` covers the frame with it. Equal when the picture already has the frame's shape.
 */
export function zoomLimits(media: Size, frame: Size): { whole: number; fill: number } {
  const fw = frame.width / media.width
  const fh = frame.height / media.height
  return { whole: Math.min(fw, fh), fill: Math.max(fw, fh) }
}

/** The crop (in picture pixels) that a cropper position and zoom show in the frame. */
export function cropFromView(view: CropView, media: MediaSize, frame: Size): CropArea {
  const k = media.width / media.naturalWidth // display px per picture px at zoom 1
  const { crop, zoom } = view
  return {
    x: ((media.width - frame.width / zoom) / 2 - crop.x / zoom) / k,
    y: ((media.height - frame.height / zoom) / 2 - crop.y / zoom) / k,
    width: frame.width / (zoom * k),
    height: frame.height / (zoom * k),
  }
}

/** The inverse of cropFromView: where to put the cropper to show `area` in the frame. */
export function viewFromCrop(area: CropArea, media: MediaSize, frame: Size): CropView {
  const k = media.width / media.naturalWidth
  const zoom = frame.width / (area.width * k)
  return {
    zoom,
    crop: {
      x: (zoom * media.width) / 2 - frame.width / 2 - zoom * area.x * k,
      y: (zoom * media.height) / 2 - frame.height / 2 - zoom * area.y * k,
    },
  }
}

/** A new zoom that keeps the point under the frame's centre where it is (the picture grows and shrinks around the middle of the frame). */
export function zoomAroundCenter(view: CropView, zoom: number): CropView {
  const ratio = zoom / view.zoom
  return { zoom, crop: { x: view.crop.x * ratio, y: view.crop.y * ratio } }
}

/**
 * Keeps at least `margin` display px of the picture inside the frame, so the picture can be moved anywhere in or around
 * the frame but never entirely out of it (a crop with no picture in it cannot be saved).
 */
export function clampView(view: CropView, media: Size, frame: Size, margin = 24): CropView {
  const reachX = Math.max(0, (media.width * view.zoom + frame.width) / 2 - margin)
  const reachY = Math.max(0, (media.height * view.zoom + frame.height) / 2 - margin)
  const clamp = (v: number, reach: number) => Math.min(reach, Math.max(-reach, v))
  return { zoom: view.zoom, crop: { x: clamp(view.crop.x, reachX), y: clamp(view.crop.y, reachY) } }
}

/** The pixel size of the rendered crop: the long side capped at `maxSide`, never below 1 px. */
export function outputSize(crop: CropArea, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height))
  return { width: Math.max(1, Math.round(crop.width * scale)), height: Math.max(1, Math.round(crop.height * scale)) }
}

type Canvas2D = {
  width: number
  height: number
  getContext(id: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
}

function makeCanvas(width: number, height: number): { canvas: Canvas2D; encode: (type: string, quality: number) => Promise<Blob | null> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    return { canvas, encode: (type, quality) => canvas.convertToBlob({ type, quality }).catch(() => null) }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, encode: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)) }
}

/**
 * Draws `crop` of `source` onto a canvas and returns it as WebP (JPEG where the browser cannot write WebP).
 * - EXIF orientation is applied, so `crop` is in the picture as people see it.
 * - The long side is scaled down to `maxSide` (2000 by default), never up.
 * - Any part of the crop outside the picture stays transparent in WebP and is flattened to white in the JPEG fallback.
 * - Rejects with ImageTooLargeError above 100 MP, and with an Error when the file cannot be decoded or the crop misses it.
 */
export async function renderCrop(
  source: Blob,
  crop: CropArea,
  options: { maxSide?: number; type?: string; quality?: number } = {},
): Promise<Blob> {
  const { maxSide, type, quality } = { ...CROP_OUTPUT, ...options }
  // The header gives the size before any pixels are decoded (a small file can claim a huge canvas).
  const header = await imageSize(source)
  if (header && header.width * header.height > MAX_PIXELS) throw new ImageTooLargeError()
  const decoded = await decode(source).catch(() => {
    throw new Error("The image couldn't be read.")
  })
  try {
    if (decoded.width * decoded.height > MAX_PIXELS) throw new ImageTooLargeError()
    if (!touchesPicture(crop, decoded.width, decoded.height)) throw new Error('The chosen area has no picture in it.')
    const size = outputSize(crop, maxSide)
    // The part of the picture inside the crop, and where it lands on the canvas.
    const sx = Math.max(0, crop.x)
    const sy = Math.max(0, crop.y)
    const sw = Math.min(decoded.width, crop.x + crop.width) - sx
    const sh = Math.min(decoded.height, crop.y + crop.height) - sy
    const dx = ((sx - crop.x) * size.width) / crop.width
    const dy = ((sy - crop.y) * size.height) / crop.height
    const dw = (sw * size.width) / crop.width
    const dh = (sh * size.height) / crop.height

    const { canvas, encode } = makeCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    const paint = () => {
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(decoded.image, sx, sy, sw, sh, dx, dy, dw, dh)
    }
    paint()
    const first = await encode(type, quality)
    if (first && first.type === type) return first
    // No WebP here: JPEG has no transparency, so paint white under the picture first.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.width, size.height)
    paint()
    const jpeg = await encode('image/jpeg', quality)
    if (jpeg && jpeg.type === 'image/jpeg') return jpeg
    throw new Error('The image could not be encoded.')
  } finally {
    decoded.close()
  }
}
