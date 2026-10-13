import { describe, expect, it } from 'vitest'
import { AR_DEFAULT_PREFERENCE, CUSTOM_WEBXR_ENABLED, chooseArMode } from './capability'
import { ROTATE_STEP_DEG, SETTLE_DROP_M, SETTLE_MS, facingYaw, groundOffset, hintFor, initialPlacement, isUsableHit, placementReducer, settleOffset } from './placement'

describe('chooseArMode', () => {
  const base = { hasModel: true, modelState: 'loaded' as const, webxrAR: false, nativeAR: false }

  it('prefers the custom WebXR mode when immersive-ar is supported', () => {
    expect(chooseArMode({ ...base, webxrAR: true, nativeAR: true })).toEqual({ mode: 'webxr' })
  })

  it('uses the native viewer (Quick Look / Scene Viewer) when WebXR AR is unavailable', () => {
    expect(chooseArMode({ ...base, nativeAR: true })).toEqual({ mode: 'native', webxrBeta: false })
  })

  it('offers no AR without a model, with a failed model or on unsupported devices', () => {
    expect(chooseArMode({ ...base, hasModel: false, webxrAR: true })).toEqual({ mode: 'none', reason: 'no-model' })
    expect(chooseArMode({ ...base, modelState: 'error', webxrAR: true })).toEqual({ mode: 'none', reason: 'model-error' })
    expect(chooseArMode(base)).toEqual({ mode: 'none', reason: 'unsupported' })
  })

  it('waits while the model or capability check is still loading', () => {
    expect(chooseArMode({ ...base, modelState: 'loading', webxrAR: true })).toEqual({ mode: 'checking' })
    expect(chooseArMode({ ...base, webxrAR: null })).toEqual({ mode: 'checking' })
  })

  it('falls back to native after the WebXR session failed to start', () => {
    expect(chooseArMode({ ...base, webxrAR: true, nativeAR: true, webxrFailed: true })).toEqual({ mode: 'native', webxrBeta: false })
    expect(chooseArMode({ ...base, webxrAR: true, webxrFailed: true })).toEqual({ mode: 'none', reason: 'failed' })
  })

  it('stops offering the native viewer after it reported a failure (no dead button)', () => {
    expect(chooseArMode({ ...base, nativeAR: true, nativeFailed: true })).toEqual({ mode: 'none', reason: 'failed' })
    expect(chooseArMode({ ...base, webxrAR: true, nativeAR: true, nativeFailed: true, prefer: 'native' })).toEqual({ mode: 'webxr' })
  })

  it('native-first (pending client approval): native viewer, with our WebXR session as a beta option', () => {
    expect(chooseArMode({ ...base, webxrAR: true, nativeAR: true, prefer: 'native' })).toEqual({ mode: 'native', webxrBeta: true })
    expect(chooseArMode({ ...base, webxrAR: true, prefer: 'native' })).toEqual({ mode: 'webxr' })
    expect(chooseArMode({ ...base, webxrAR: true, nativeAR: true, webxrFailed: true, prefer: 'native' })).toEqual({ mode: 'native', webxrBeta: false })
  })

  it('ships with our custom WebXR session off: AR goes through <model-viewer> as in the last good version', () => {
    expect(CUSTOM_WEBXR_ENABLED).toBe(false)
  })

  it('keeps the current WebXR-first default until the client approves a change', () => {
    expect(AR_DEFAULT_PREFERENCE).toBe('webxr')
  })
})

describe('placementReducer', () => {
  const start = () => placementReducer(initialPlacement(), { type: 'started', now: 1000 })

  it('scans first, then asks to place once a floor is found', () => {
    let s = start()
    expect(s.phase).toBe('scanning')
    expect(hintFor(s)).toBe('ar.session.scan')
    s = placementReducer(s, { type: 'surface', found: true })
    expect(s.phase).toBe('aiming')
    expect(hintFor(s)).toBe('ar.session.tapToPlace')
  })

  it('places on the surface and records time-to-first-placement', () => {
    let s = placementReducer(start(), { type: 'surface', found: true })
    s = placementReducer(s, { type: 'place', now: 4200 })
    expect(s.phase).toBe('placed')
    expect(s.metrics.firstPlacementMs).toBe(3200)
  })

  it('does not place without a surface and counts the failed attempt', () => {
    const s = placementReducer(start(), { type: 'place', now: 2000 })
    expect(s.phase).toBe('scanning')
    expect(s.metrics.failedPlacements).toBe(1)
    expect(hintFor(s)).toBe('ar.session.noSurface')
  })

  it('moves only after an explicit Move, and Cancel keeps the old placement', () => {
    let s = placementReducer(placementReducer(start(), { type: 'surface', found: true }), { type: 'place', now: 2000 })
    s = placementReducer(s, { type: 'move' })
    expect(s.phase).toBe('moving')
    expect(hintFor(s)).toBe('ar.session.moving')
    s = placementReducer(s, { type: 'cancel-move' })
    expect(s.phase).toBe('placed')
    expect(s.metrics.moves).toBe(0)
  })

  it('confirming a move places again and counts it', () => {
    let s = placementReducer(placementReducer(start(), { type: 'surface', found: true }), { type: 'place', now: 2000 })
    s = placementReducer(placementReducer(s, { type: 'move' }), { type: 'place', now: 3000 })
    expect(s.phase).toBe('placed')
    expect(s.metrics.moves).toBe(1)
    expect(s.metrics.firstPlacementMs).toBe(1000)
  })

  it('rotates in fixed 15° steps around the vertical axis only when placed', () => {
    let s = placementReducer(start(), { type: 'rotate', dir: 1 })
    expect(s.yawOffsetDeg).toBe(0)
    s = placementReducer(placementReducer(s, { type: 'surface', found: true }), { type: 'place', now: 2000 })
    s = placementReducer(s, { type: 'rotate', dir: 1 })
    s = placementReducer(s, { type: 'rotate', dir: 1 })
    s = placementReducer(s, { type: 'rotate', dir: -1 })
    expect(ROTATE_STEP_DEG).toBe(15)
    expect(s.yawOffsetDeg).toBe(15)
    expect(s.metrics.rotations).toBe(3)
    for (let i = 0; i < 24; i++) s = placementReducer(s, { type: 'rotate', dir: 1 })
    expect(s.yawOffsetDeg).toBe(15) // wraps at 360°
  })

  it('reset clears placement and rotation but keeps the session', () => {
    let s = placementReducer(placementReducer(start(), { type: 'surface', found: true }), { type: 'place', now: 2000 })
    s = placementReducer(placementReducer(s, { type: 'rotate', dir: 1 }), { type: 'reset' })
    expect(s.phase).toBe('aiming') // floor still in view
    expect(s.yawOffsetDeg).toBe(0)
  })

  it('pauses guidance while tracking is lost and resumes afterwards', () => {
    let s = placementReducer(placementReducer(start(), { type: 'surface', found: true }), { type: 'place', now: 2000 })
    s = placementReducer(s, { type: 'tracking', lost: true })
    expect(hintFor(s)).toBe('ar.session.trackingLost')
    expect(placementReducer(s, { type: 'place', now: 2500 }).metrics.moves).toBe(0) // no actions while lost
    s = placementReducer(s, { type: 'tracking', lost: false })
    expect(hintFor(s)).toBe('ar.session.placed')
  })
})

describe('placement geometry', () => {
  it('accepts only upward-facing surfaces within a comfortable distance', () => {
    expect(isUsableHit({ upY: 0.99, distance: 2 })).toBe(true)
    expect(isUsableHit({ upY: 0.2, distance: 2 })).toBe(false) // wall
    expect(isUsableHit({ upY: 0.99, distance: 12 })).toBe(false) // too far
    expect(isUsableHit({ upY: 0.99, distance: 0.1 })).toBe(false) // under the phone
  })

  it('turns the model so its front (+Z) faces the camera', () => {
    expect(facingYaw({ x: 0, z: 2 }, { x: 0, z: 0 })).toBeCloseTo(0)
    expect(facingYaw({ x: 2, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(Math.PI / 2)
  })

  it('moves the model origin to the centre of its base so it sits on the floor', () => {
    expect(groundOffset({ min: { x: -1, y: 0.2, z: -0.4 }, max: { x: 1.2, y: 1, z: 0.6 } })).toEqual({ x: -0.1, y: -0.2, z: -0.1 })
  })
})

describe('settleOffset (item drops onto the floor when placed)', () => {
  it('starts above the floor, eases down and rests exactly on it', () => {
    expect(settleOffset(0)).toBeCloseTo(SETTLE_DROP_M)
    const mid = settleOffset(SETTLE_MS / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(SETTLE_DROP_M / 2) // ease-out: most of the fall happens early
    expect(settleOffset(SETTLE_MS)).toBe(0)
    expect(settleOffset(10_000)).toBe(0)
  })
  it('does not move at all when the user prefers reduced motion', () => {
    expect(settleOffset(0, true)).toBe(0)
  })
})
