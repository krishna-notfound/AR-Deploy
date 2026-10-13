// Placement state machine and geometry for the custom WebXR mode. Pure: no WebXR or three.js here,
// so the interaction rules are unit-tested without camera hardware.
//
// Interaction model (Google AR design guidance, single furniture item):
//   scanning → (floor found) aiming → Place → placed ⇄ Move (object follows the reticle) → Place here / Cancel
//   Rotate ±15° around the vertical axis only; no scaling (real size is fixed); Reset = place again.
//   One action per control: screen taps only ever mean "place here", never drag or rotate.

export const ROTATE_STEP_DEG = 15
const MIN_DISTANCE_M = 0.3
const MAX_DISTANCE_M = 8
const MIN_UP_Y = 0.85 // cos ≈ 32°: floors, rugs and low platforms; not walls or slopes

export type Phase = 'starting' | 'scanning' | 'aiming' | 'placed' | 'moving'

export interface PlacementState {
  phase: Phase
  surface: boolean
  trackingLost: boolean
  /** Rotation chosen by the user on top of the initial face-the-viewer yaw. */
  yawOffsetDeg: number
  /** Last placement attempt failed because no floor was under the reticle. */
  lastPlaceFailed: boolean
  metrics: { startedAt: number; firstPlacementMs: number | null; failedPlacements: number; moves: number; rotations: number }
}

export type PlacementEvent =
  | { type: 'started'; now: number }
  | { type: 'surface'; found: boolean }
  | { type: 'tracking'; lost: boolean }
  | { type: 'place'; now: number }
  | { type: 'move' }
  | { type: 'cancel-move' }
  | { type: 'rotate'; dir: 1 | -1 }
  | { type: 'reset' }

export function initialPlacement(): PlacementState {
  return {
    phase: 'starting',
    surface: false,
    trackingLost: false,
    yawOffsetDeg: 0,
    lastPlaceFailed: false,
    metrics: { startedAt: 0, firstPlacementMs: null, failedPlacements: 0, moves: 0, rotations: 0 },
  }
}

export function placementReducer(s: PlacementState, e: PlacementEvent): PlacementState {
  switch (e.type) {
    case 'started':
      return { ...s, phase: s.surface ? 'aiming' : 'scanning', metrics: { ...s.metrics, startedAt: e.now } }
    case 'surface': {
      const waiting = s.phase === 'scanning' || s.phase === 'aiming'
      return { ...s, surface: e.found, lastPlaceFailed: e.found ? false : s.lastPlaceFailed, phase: waiting ? (e.found ? 'aiming' : 'scanning') : s.phase }
    }
    case 'tracking':
      return { ...s, trackingLost: e.lost }
  }
  if (s.trackingLost) return s // ignore actions until the phone knows where it is again
  switch (e.type) {
    case 'place': {
      if (s.phase !== 'aiming' && s.phase !== 'moving' && s.phase !== 'scanning') return s
      if (!s.surface) return { ...s, lastPlaceFailed: true, metrics: { ...s.metrics, failedPlacements: s.metrics.failedPlacements + 1 } }
      const first = s.metrics.firstPlacementMs ?? e.now - s.metrics.startedAt
      const moves = s.phase === 'moving' ? s.metrics.moves + 1 : s.metrics.moves
      return { ...s, phase: 'placed', lastPlaceFailed: false, metrics: { ...s.metrics, firstPlacementMs: first, moves } }
    }
    case 'move':
      return s.phase === 'placed' ? { ...s, phase: 'moving' } : s
    case 'cancel-move':
      return s.phase === 'moving' ? { ...s, phase: 'placed' } : s
    case 'rotate':
      if (s.phase !== 'placed') return s
      return { ...s, yawOffsetDeg: (s.yawOffsetDeg + e.dir * ROTATE_STEP_DEG + 360) % 360, metrics: { ...s.metrics, rotations: s.metrics.rotations + 1 } }
    case 'reset':
      return { ...s, phase: s.surface ? 'aiming' : 'scanning', yawOffsetDeg: 0, lastPlaceFailed: false }
  }
  return s
}

export type HintKey =
  | 'ar.session.loading'
  | 'ar.session.scan'
  | 'ar.session.tapToPlace'
  | 'ar.session.noSurface'
  | 'ar.session.placed'
  | 'ar.session.moving'
  | 'ar.session.trackingLost'

/** The one instruction to show right now (teach the next action, nothing more). */
export function hintFor(s: PlacementState): HintKey {
  if (s.trackingLost) return 'ar.session.trackingLost'
  if (s.lastPlaceFailed) return 'ar.session.noSurface'
  switch (s.phase) {
    case 'starting':
      return 'ar.session.loading'
    case 'scanning':
      return 'ar.session.scan'
    case 'aiming':
      return 'ar.session.tapToPlace'
    case 'moving':
      return 'ar.session.moving'
    case 'placed':
      return 'ar.session.placed'
  }
}

/** A hit is usable for furniture when it faces up (floor-like) and is a comfortable distance away. */
export function isUsableHit({ upY, distance }: { upY: number; distance: number }): boolean {
  return upY >= MIN_UP_Y && distance >= MIN_DISTANCE_M && distance <= MAX_DISTANCE_M
}

/** Yaw (radians, around +Y) that turns a glTF model's front (+Z) towards the camera. */
export function facingYaw(camera: { x: number; z: number }, point: { x: number; z: number }): number {
  return Math.atan2(camera.x - point.x, camera.z - point.z)
}

type Vec = { x: number; y: number; z: number }
/** Offset that puts the centre of the model's base at its local origin (models with odd pivots still sit on the floor). */
export function groundOffset(box: { min: Vec; max: Vec }): Vec {
  const r = (v: number) => Math.round(v * 1e6) / 1e6
  return { x: r(-(box.min.x + box.max.x) / 2), y: r(-box.min.y), z: r(-(box.min.z + box.max.z) / 2) }
}
