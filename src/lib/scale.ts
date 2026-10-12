import type { Dimensions } from '@/domain/types'
import { toMeters } from './format'

export interface MeasuredSize {
  x: number
  y: number
  z: number
}

export type ScaleCheck =
  | { status: 'verified'; measured: MeasuredSize; expected: MeasuredSize }
  | { status: 'mismatch'; measured: MeasuredSize; expected: MeasuredSize; maxDeviation: number }
  | { status: 'unknown' }

export const SCALE_TOLERANCE = 0.05

/**
 * Compares the model's measured bounding box (meters, from model-viewer getDimensions())
 * with the entered product dimensions. Never used to rescale the model (ADR-0006).
 */
export function checkScale(measured: MeasuredSize | null | undefined, dims: Dimensions, tolerance = SCALE_TOLERANCE): ScaleCheck {
  if (!measured) return { status: 'unknown' }
  const expected: MeasuredSize = {
    x: toMeters(dims.width, dims.unit),
    y: toMeters(dims.height, dims.unit),
    z: toMeters(dims.depth, dims.unit),
  }
  if (expected.x <= 0 || expected.y <= 0 || expected.z <= 0) return { status: 'unknown' }
  if (![measured.x, measured.y, measured.z].every((v) => Number.isFinite(v) && v > 0)) return { status: 'unknown' }
  const dev = (m: number, e: number) => Math.abs(m - e) / e
  const maxDeviation = Math.max(dev(measured.x, expected.x), dev(measured.y, expected.y), dev(measured.z, expected.z))
  return maxDeviation <= tolerance
    ? { status: 'verified', measured, expected }
    : { status: 'mismatch', measured, expected, maxDeviation }
}
