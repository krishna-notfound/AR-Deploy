import type { Dimensions, LengthUnit } from '@/domain/types'
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
 * with the entered product dimensions. Never rescales by itself (ADR-0006); only the upload step does, on the user's choice (ADR-0058).
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

/** A real piece measures between these on every side; outside them the model file is wrong, not the dimensions. */
export const MODEL_SIZE_MIN_M = 0.01
export const MODEL_SIZE_MAX_M = 10

/**
 * "Use the model's size" (owner 2026-11-04): when the entered dimensions do not match a plausible model, the model's
 * measured size as form values in `unit` (half centimetres, quarter inches). Null when there is nothing to fix, or when
 * the file itself is wrong (in other units, under 1 cm or over 10 m on a side): it must never overwrite good dimensions.
 */
export function modelSizeSuggestion(scale: ScaleCheck, unit: LengthUnit): { width: string; height: string; depth: string } | null {
  if (scale.status !== 'mismatch' || scale.reason === 'model-units') return null
  const { x, y, z } = scale.measured
  if (![x, y, z].every((v) => v >= MODEL_SIZE_MIN_M && v <= MODEL_SIZE_MAX_M)) return null
  const step = unit === 'cm' ? 2 : 4
  const value = (m: number) => String(Math.round((unit === 'cm' ? m * 100 : (m * 100) / 2.54) * step) / step)
  return { width: value(x), height: value(y), depth: value(z) }
}

/** The unit conversions a file authored in millimetres, centimetres or inches needs to reach metres (ADR-0058). */
export const UNIT_SCALE_FACTORS = { mm: 0.001, cm: 0.01, in: 0.0254 } as const
export type ScaleUnitLabel = 'mm' | 'cm' | 'in' | 'custom'

export interface ScaleProposal {
  /** units: the entered dimensions match after a known conversion; too-large / too-small: the size is outside 1 cm to 10 m. */
  kind: 'too-large' | 'too-small' | 'units'
  suggested: { factor: number; label: ScaleUnitLabel }
  reason: 'dimensions-match' | 'over-10m' | 'under-1cm'
}

const labelFor = (factor: number): ScaleUnitLabel => {
  const hit = (Object.entries(UNIT_SCALE_FACTORS) as [keyof typeof UNIT_SCALE_FACTORS, number][]).find(([, f]) => Math.abs(f - factor) < 1e-9)
  return hit ? hit[0] : 'custom'
}

/** A furniture piece's longest side sits in this range (m); it picks between mm, cm and inches when nothing else decides. */
const PLAUSIBLE_LONGEST_M = [0.3, 3] as const

/**
 * Whether a freshly measured GLB (metres, as glTF defines them) needs a "Fix the scale" step before upload, and the
 * factor to suggest. Triggers when a side is over 10 m, when the longest side is under 1 cm (a thin rug or panel is not
 * a unit mistake, so one thin side alone does not count), or when the product's entered dimensions match after
 * x0.001 / x0.01 / x0.0254 (the 'model-units' test checkScale uses). Never rescales anything: the caller applies a
 * factor only on the person's choice (ADR-0058, amending ADR-0006).
 */
export function scaleProposal(measured: MeasuredSize, dims?: Dimensions): ScaleProposal | null {
  const sides = [measured.x, measured.y, measured.z]
  if (!sides.every((v) => Number.isFinite(v) && v > 0)) return null
  const longest = Math.max(...sides)

  if (dims) {
    const check = checkScale(measured, dims)
    if (check.status === 'mismatch' && check.reason === 'model-units' && check.factor) {
      // check.factor = how many times larger the model is than the entered size; the fix is its inverse, snapped to a known one.
      const fix = [UNIT_SCALE_FACTORS.mm, UNIT_SCALE_FACTORS.cm, UNIT_SCALE_FACTORS.in, 100, 1000].find((f) => Math.abs(check.factor! * f - 1) < 0.08)
      if (fix) return { kind: 'units', suggested: { factor: fix, label: labelFor(fix) }, reason: 'dimensions-match' }
    }
  }

  if (longest > MODEL_SIZE_MAX_M) {
    const units = [UNIT_SCALE_FACTORS.mm, UNIT_SCALE_FACTORS.cm, UNIT_SCALE_FACTORS.in]
    const fits = units.find((f) => longest * f >= PLAUSIBLE_LONGEST_M[0] && longest * f <= PLAUSIBLE_LONGEST_M[1])
    const factor = fits ?? 10 ** -Math.ceil(Math.log10(longest / PLAUSIBLE_LONGEST_M[1]))
    return { kind: 'too-large', suggested: { factor, label: labelFor(factor) }, reason: 'over-10m' }
  }
  if (longest < MODEL_SIZE_MIN_M) {
    const factor = 10 ** Math.ceil(Math.log10(PLAUSIBLE_LONGEST_M[0] / longest))
    return { kind: 'too-small', suggested: { factor, label: 'custom' }, reason: 'under-1cm' }
  }
  return null
}
