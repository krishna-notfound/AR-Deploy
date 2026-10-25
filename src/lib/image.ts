// Browser-side image helpers (canvas only, no dependency).

/**
 * Crops an image to its centre square and scales it to `size` x `size` px, for profile photos. The result is WebP at
 * quality 0.9, or JPEG at 0.9 where the browser cannot write WebP (it then hands back PNG, which we do not keep).
 * Rejects when the file cannot be decoded as an image.
 */
export async function squareResize(file: File, size = 256): Promise<Blob> {
  const source = await decode(file)
  try {
    const side = Math.min(source.width, source.height)
    if (!side) throw new Error('The image has no pixels.')
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source.image, Math.round((source.width - side) / 2), Math.round((source.height - side) / 2), side, side, 0, 0, size, size)
    const webp = await encode(canvas, 'image/webp')
    if (webp?.type === 'image/webp') return webp
    const jpeg = await encode(canvas, 'image/jpeg')
    if (jpeg?.type === 'image/jpeg') return jpeg
    throw new Error('The image could not be encoded.')
  } finally {
    source.close()
  }
}

interface Decoded {
  image: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    // Honours the photo's EXIF orientation, so phone portraits are not drawn sideways.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('The image could not be read.'))
      el.src = url
    })
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: 'image/webp' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9))
}
