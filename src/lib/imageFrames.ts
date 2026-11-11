// One module for the shape of every picture frame (ADR-0063, ADR-0064). Components take their aspect and fit from here,
// never from a hardcoded `aspect-[…]` class, so a frame changes in one place and the crop dialog crops to the same shape.

export type ImageFrameKey = 'product' | 'hero' | 'banner' | 'collection' | 'aboutMain' | 'aboutDetail' | 'aboutThird' | 'catalogBanner' | 'imageText' | 'qr' | 'logo' | 'avatar'

export interface ImageFrame {
  /** Width divided by height: what the crop dialog and the stored crop use. */
  aspect: number
  /** The Tailwind aspect class that gives a box this shape. Written out in full so Tailwind finds it. */
  aspectClass: string
  /**
   * How a picture sits in its frame. `contain`: a cropped file fills the frame exactly and an uncropped ("whole") one
   * shows whole on the frame's plain colour. `cover`: full-width bands (hero, banner) trim the sides on narrow screens.
   */
  fit: 'contain' | 'cover'
  /** The object-fit class for `fit`. */
  fitClass: 'object-contain' | 'object-cover'
}

const contain = (aspect: number, aspectClass: string): ImageFrame => ({ aspect, aspectClass, fit: 'contain', fitClass: 'object-contain' })
const cover = (aspect: number, aspectClass: string): ImageFrame => ({ aspect, aspectClass, fit: 'cover', fitClass: 'object-cover' })

export const IMAGE_FRAMES: Record<ImageFrameKey, ImageFrame> = {
  // Product and variant photos: catalogue card, product page stage and thumbnails, More photos, admin thumbnails, editor grid.
  product: contain(4 / 5, 'aspect-[4/5]'),
  hero: cover(16 / 9, 'aspect-[16/9]'),
  banner: cover(16 / 9, 'aspect-[16/9]'),
  collection: contain(4 / 5, 'aspect-[4/5]'),
  aboutMain: contain(4 / 5, 'aspect-[4/5]'),
  aboutDetail: contain(1, 'aspect-square'),
  // The About grid's third box takes the height the 4:5 main photo leaves under the square detail: about 2:3 (a gap less).
  // Cover, so the few pixels of the gap are trimmed instead of showing as bars.
  aboutThird: cover(2 / 3, 'aspect-[2/3]'),
  // The catalogue top (ADR-0065): a full-width band whose height follows the screen, so its box is not 2:1. The picture is cropped to
  // 2:1 and covers the band, which trims its sides on a narrow screen (and its top and bottom on a very wide one).
  catalogBanner: cover(2 / 1, 'aspect-[2/1]'),
  imageText: contain(4 / 3, 'aspect-[4/3]'),
  qr: contain(4 / 3, 'aspect-[4/3]'),
  logo: contain(1, 'aspect-square'),
  avatar: contain(1, 'aspect-square'),
}

export const imageFrame = (key: ImageFrameKey): ImageFrame => IMAGE_FRAMES[key]
