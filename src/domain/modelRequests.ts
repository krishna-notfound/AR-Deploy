// 3D model requests (S4, docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md): a business sends photos
// of a product (or one of its options) and the Sanctus team makes and delivers its GLB/USDZ.
import type { ID, ISODate, LocalizedText, ModelAsset, ModelFormat, Product } from './types'

/** The stored status; the UI calls `rejected` "Declined". */
export type ModelRequestStatus = 'requested' | 'in_progress' | 'delivered' | 'rejected' | 'cancelled'

/** At most one request in these states exists per target (product, or product + option). */
export const OPEN_REQUEST_STATUSES: readonly ModelRequestStatus[] = ['requested', 'in_progress']

export const REQUEST_PHOTOS_MIN = 2
export const REQUEST_PHOTOS_MAX = 10
/** Longest note or decline reason, in characters. */
export const REQUEST_TEXT_MAX = 1000

export interface ModelRequest {
  id: ID
  businessId: ID
  productId: ID
  /** Set when the request is for one of the product's options. */
  variantId?: ID
  status: ModelRequestStatus
  note?: string
  /** The decline reason (sent to the business). */
  reason?: string
  requestedBy?: ID
  handledBy?: ID
  createdAt: ISODate
  updatedAt: ISODate
  startedAt?: ISODate
  deliveredAt?: ISODate
  closedAt?: ISODate
  photoCount: number
  productName: LocalizedText
  businessName: string
  variantName?: LocalizedText
  /** The product's first catalog photo (not a request photo). */
  productPhotoUrl?: string
}

export interface ModelRequestPhoto {
  storagePath: string
  fileName: string
  sizeBytes: number
  url?: string
  /** Demo: picked in this session and gone on reload. */
  sessionOnly?: boolean
  /** Demo: a labelled sample photo of the seed. */
  sample?: boolean
}

export interface ModelRequestDetail extends ModelRequest {
  photos: ModelRequestPhoto[]
  /** Files staged by the Sanctus team; always {} for a business owner. */
  staged: Partial<Record<ModelFormat, ModelAsset>>
  product: Pick<Product, 'id' | 'businessId' | 'name' | 'dimensions' | 'material' | 'category' | 'models' | 'status' | 'images' | 'variants'>
  requestedByLabel?: string
  history: { type: string; at: ISODate; actorLabel?: string }[]
}

/** Per product: its open request, or else how its latest request ended (for the product list badges, R-S4-9). */
export interface ProductRequestState {
  open?: 'requested' | 'in_progress'
  latestClosed?: 'delivered' | 'rejected' | 'cancelled'
}

export type RequestEmailStatus = 'accepted' | 'failed' | 'blocked' | 'skipped' | 'demo'

export interface ModelRequestOutcome {
  status: ModelRequestStatus
  email?: { status: RequestEmailStatus; error?: string }
  /** Some files could not be removed afterwards. */
  cleanup?: 'partial'
}

export interface ModelRequestQuery {
  productId?: ID
  businessId?: ID
  status?: ModelRequestStatus[]
  page?: number
  pageSize?: number
}
