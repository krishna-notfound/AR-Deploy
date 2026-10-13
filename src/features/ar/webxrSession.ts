// Custom WebXR furniture session (Mode A, ADR-0018). Loaded on demand only on devices that report
// immersive-ar support. Rendering via three.js (already bundled by <model-viewer>, same version).
//
// What this file guarantees, and what it does not:
// - Real hit testing against detected surfaces; furniture is placed only on upward-facing hits.
// - Anchors when the browser supports them (keeps the item locked to the floor as tracking refines).
// - Real scale: glTF units are metres and the model is never scaled.
// - No occlusion, depth sensing, collision or room measurement: none of that is claimed.
import { Box3, CanvasTexture, CircleGeometry, DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial, NeutralToneMapping, PMREMGenerator, PerspectiveCamera, Quaternion, RingGeometry, Scene, Vector3, WebGLRenderer, type Object3D, type Texture } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { type PlacementEvent, type PlacementState, facingYaw, groundOffset, initialPlacement, isUsableHit, placementReducer } from './placement'

export interface ArSessionController {
  place(): void
  move(): void
  cancelMove(): void
  rotate(dir: 1 | -1): void
  reset(): void
  exit(): void
}

export interface ArSessionOptions {
  glbUrl: string
  /** Element shown over the camera (WebXR DOM overlay). Must already be in the document and visible. */
  overlayRoot: HTMLElement
  onState(state: PlacementState, loading: boolean): void
  /** Called once when the session ends. `error` is set when it ended because something failed. */
  onEnd(result: { error?: 'model'; state: PlacementState }): void
}

/** Starts the session. Call directly from the tap handler: browsers require a user gesture. Rejects if AR cannot start. */
export async function startArSession(opts: ArSessionOptions): Promise<ArSessionController> {
  const xr = navigator.xr
  if (!xr) throw new Error('WebXR is not available')
  const session = await xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['anchors'],
    domOverlay: { root: opts.overlayRoot },
  })

  // ---- state ----
  let state = initialPlacement()
  let loading = true
  let ended = false
  let endError: 'model' | undefined
  const dispatch = (e: PlacementEvent) => {
    const next = placementReducer(state, e)
    if (next !== state) {
      state = next
      opts.onState(state, loading)
    }
  }

  // ---- three.js ----
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')
  renderer.toneMapping = NeutralToneMapping // same look as the 3D viewer
  const viewCamera = new PerspectiveCamera(70, 1, 0.01, 50) // pose and projection are replaced by the XR camera
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.add(new HemisphereLight(0xffffff, 0x8a8478, 0.6))
  const sun = new DirectionalLight(0xffffff, 0.8)
  sun.position.set(0.5, 2, 1)
  scene.add(sun)

  const reticle = makeReticle()
  scene.add(reticle)

  // pivot: position + yaw on the floor; inner: model shifted so the centre of its base is the pivot origin.
  const pivot = new Group()
  pivot.visible = false
  scene.add(pivot)

  const disposables: { dispose(): void }[] = [renderer, pmrem, envTexture]

  // ---- WebXR ----
  await renderer.xr.setSession(session)
  const refSpace = renderer.xr.getReferenceSpace()!
  const viewerSpace = await session.requestReferenceSpace('viewer')
  const hitSource = await session.requestHitTestSource!({ space: viewerSpace })!

  let lastHit: XRHitTestResult | null = null
  const lastHitMatrix = new Matrix4()
  let anchor: XRAnchor | null = null
  let baseYaw = 0
  const placedPosition = new Vector3()
  const beforeMove = { position: new Vector3(), anchor: null as XRAnchor | null }
  const camera = new Vector3()
  const tmpQ = new Quaternion()
  const up = new Vector3()
  const hitPoint = new Vector3()

  const applyYaw = () => (pivot.rotation.y = baseYaw + (state.yawOffsetDeg * Math.PI) / 180)

  const placeAtLastHit = async () => {
    const wasMoving = state.phase === 'moving'
    const hit = lastHit
    dispatch({ type: 'place', now: performance.now() })
    if (state.phase !== 'placed' || !hit) return
    placedPosition.setFromMatrixPosition(lastHitMatrix)
    if (!wasMoving) baseYaw = facingYaw(camera, placedPosition) // first placement faces the viewer; moves keep the chosen turn
    pivot.position.copy(placedPosition)
    pivot.visible = true
    applyYaw()
    // Anchor to the surface where supported, so refinements of the floor move the item with it.
    anchor?.delete()
    anchor = null
    try {
      anchor = (await hit.createAnchor?.()) ?? null
    } catch {
      anchor = null // fixed position in the local space is still stable on ARCore
    }
  }

  // Screen taps that are not on a control mean "place here" (controls are marked data-xr-control).
  const onBeforeSelect = (e: Event) => {
    if ((e.target as Element | null)?.closest?.('[data-xr-control]')) e.preventDefault()
  }
  opts.overlayRoot.addEventListener('beforexrselect', onBeforeSelect)
  const onSelect = () => {
    if (state.phase === 'aiming' || state.phase === 'moving' || state.phase === 'scanning') void placeAtLastHit()
  }
  session.addEventListener('select', onSelect)

  renderer.setAnimationLoop((_time, frame) => {
    if (!frame) return
    const pose = frame.getViewerPose(refSpace)
    const lost = !pose || pose.emulatedPosition
    if (lost !== state.trackingLost) dispatch({ type: 'tracking', lost })
    if (pose) camera.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z)

    // Surface under the centre of the screen.
    let usable = false
    if (!lost) {
      for (const hit of frame.getHitTestResults(hitSource)) {
        const hp = hit.getPose(refSpace)
        if (!hp) continue
        lastHitMatrix.fromArray(hp.transform.matrix)
        tmpQ.setFromRotationMatrix(lastHitMatrix)
        up.set(0, 1, 0).applyQuaternion(tmpQ)
        hitPoint.setFromMatrixPosition(lastHitMatrix)
        if (isUsableHit({ upY: up.y, distance: camera.distanceTo(hitPoint) })) {
          usable = true
          lastHit = hit
          break
        }
      }
    }
    if (!usable) lastHit = null
    if (usable !== state.surface) dispatch({ type: 'surface', found: usable })

    const aiming = state.phase === 'aiming' || state.phase === 'moving'
    reticle.visible = usable && aiming && !loading
    if (reticle.visible) reticle.matrix.copy(lastHitMatrix)

    if (state.phase === 'moving' && usable) {
      // The item follows the reticle while moving ("move the phone and the object follows").
      pivot.position.setFromMatrixPosition(lastHitMatrix)
    } else if (state.phase === 'placed' && anchor && frame.trackedAnchors?.has(anchor)) {
      const ap = frame.getPose(anchor.anchorSpace, refSpace)
      if (ap) pivot.position.set(ap.transform.position.x, ap.transform.position.y, ap.transform.position.z)
    }
    renderer.render(scene, viewCamera)
  })

  const cleanup = () => {
    if (ended) return
    ended = true
    renderer.setAnimationLoop(null)
    session.removeEventListener('select', onSelect)
    opts.overlayRoot.removeEventListener('beforexrselect', onBeforeSelect)
    hitSource.cancel()
    anchor?.delete()
    scene.traverse((o) => disposeObject(o))
    for (const d of disposables) d.dispose()
    opts.onEnd({ error: endError, state })
  }
  session.addEventListener('end', cleanup)

  dispatch({ type: 'started', now: performance.now() })

  // Load the model after the session is up (the tap gesture is spent on requestSession).
  // Same decoders and locations as <model-viewer>, so a compressed GLB that works in 3D also works here.
  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
  const ktx2 = new KTX2Loader().setTranscoderPath('https://www.gstatic.com/basis-universal/versioned/2021-04-15-ba1c3e4/').detectSupport(renderer)
  disposables.push(draco, ktx2)
  new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).loadAsync(opts.glbUrl).then(
    (gltf) => {
      if (ended) return
      const model: Object3D = gltf.scene
      const box = new Box3().setFromObject(model)
      const o = groundOffset(box)
      model.position.set(o.x, o.y, o.z)
      pivot.add(model)
      pivot.add(makeContactShadow(box.max.x - box.min.x, box.max.z - box.min.z))
      loading = false
      opts.onState(state, loading)
    },
    () => {
      endError = 'model'
      void session.end()
    },
  )

  return {
    place: () => void placeAtLastHit(),
    move: () => {
      if (state.phase !== 'placed') return
      beforeMove.position.copy(pivot.position)
      beforeMove.anchor = anchor
      dispatch({ type: 'move' })
    },
    cancelMove: () => {
      if (state.phase !== 'moving') return
      pivot.position.copy(beforeMove.position)
      anchor = beforeMove.anchor
      dispatch({ type: 'cancel-move' })
    },
    rotate: (dir) => {
      dispatch({ type: 'rotate', dir })
      applyYaw()
    },
    reset: () => {
      anchor?.delete()
      anchor = null
      pivot.visible = false
      baseYaw = 0
      dispatch({ type: 'reset' })
      applyYaw()
    },
    exit: () => void session.end(),
  }
}

function makeReticle(): Mesh {
  const ring = new Mesh(new RingGeometry(0.11, 0.14, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }))
  const dot = new Mesh(new CircleGeometry(0.02, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xfe6f2d }))
  ring.add(dot)
  ring.matrixAutoUpdate = false
  ring.visible = false
  return ring
}

/** Soft elliptical shadow under the footprint so the item reads as standing on the floor. */
function makeContactShadow(width: number, depth: number): Mesh {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const mesh = new Mesh(new CircleGeometry(0.5, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false }))
  mesh.scale.set(width * 1.25, 1, depth * 1.25)
  mesh.position.y = 0.002
  mesh.renderOrder = -1
  return mesh
}

function disposeObject(o: Object3D) {
  const m = o as Mesh
  m.geometry?.dispose()
  const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
  for (const mat of mats) {
    for (const v of Object.values(mat)) if (v && typeof (v as Texture).dispose === 'function' && (v as Texture).isTexture) (v as Texture).dispose()
    mat.dispose()
  }
}
