import type { Dimensions } from '@/domain/types'
import { toMeters } from './format'

export interface MeasuredSize {
  x: number
  y: number
  z: number
}

/**
 * Likely cause of a mismatch, so the admin knows what to fix (the model is never rescaled):
 * - axis-swap:   width and depth are swapped (model turned 90°; glTF expects the front facing +Z)
 * - wrong-unit:  the numbers fit the other unit (cm vs in)
 * - model-units: the file was authored in cm or mm instead of metres
 * - uniform:     every axis is off by the same factor
 */
export type ScaleMismatchReason = 'axis-swap' | 'wrong-unit' | 'model-units' | 'uniform'

export type ScaleCheck =
  | { status: 'verified'; measured: MeasuredSize; expected: MeasuredSize }
  | { status: 'mismatch'; measured: MeasuredSize; expected: MeasuredSize; maxDeviation: number; reason?: ScaleMismatchReason; factor?: number }
  | { status: 'unknown' }

export const SCALE_TOLERANCE = 0.05
/** Small items: allow at least 1 cm, below that the check measures rounding, not the model. */
export const MIN_TOLERANCE_M = 0.01

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
  const within = (m: number, e: number) => Math.abs(m - e) <= Math.max(tolerance * e, MIN_TOLERANCE_M)
  if (within(measured.x, expected.x) && within(measured.y, expected.y) && within(measured.z, expected.z)) return { status: 'verified', measured, expected }

  const dev = (m: number, e: number) => Math.abs(m - e) / e
  const maxDeviation = Math.max(dev(measured.x, expected.x), dev(measured.y, expected.y), dev(measured.z, expected.z))
  const mismatch = { status: 'mismatch' as const, measured, expected, maxDeviation }
  if (within(measured.x, expected.z) && within(measured.z, expected.x) && within(measured.y, expected.y)) return { ...mismatch, reason: 'axis-swap' }
  const ratios = [measured.x / expected.x, measured.y / expected.y, measured.z / expected.z].sort((a, b) => a - b)
  if (ratios[2]! / ratios[0]! > 1 + 2 * tolerance) return mismatch // shape differs: no single cause to name
  const k = ratios[1]!
  const near = (target: number) => Math.abs(k / target - 1) < 0.08
  if (near(2.54) || near(1 / 2.54)) return { ...mismatch, reason: 'wrong-unit', factor: k }
  if ([100, 1000, 0.01, 0.001, 39.37, 0.0254].some(near)) return { ...mismatch, reason: 'model-units', factor: k }
  return { ...mismatch, reason: 'uniform', factor: k }
}
