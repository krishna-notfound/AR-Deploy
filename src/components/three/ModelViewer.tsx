// Thin React wrapper around Google's <model-viewer>. Loaded on demand so pages without
// 3D never download it. Uses the library's own capability checks — nothing is faked.
import type { ModelViewerElement } from '@google/model-viewer'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { MeasuredSize } from '@/lib/scale'

let loader: Promise<unknown> | null = null
export function loadModelViewer(): Promise<unknown> {
  loader ??= import('@google/model-viewer')
  return loader
}

export type ArStatus = 'not-presenting' | 'session-started' | 'object-placed' | 'failed'

export interface ModelViewerHandle {
  activateAR: () => Promise<void>
  canActivateAR: () => boolean
  getDimensions: () => MeasuredSize | null
  resetCamera: () => void
}

export interface ModelViewerProps {
  src: string
  iosSrc?: string
  poster?: string
  alt: string
  ar?: boolean
  /** Slow turntable until the visitor interacts (marketing stage). */
  autoRotate?: boolean
  className?: string
  onLoad?: (info: { canActivateAR: boolean; dimensions: MeasuredSize | null }) => void
  onError?: () => void
  onProgress?: (p: number) => void
  onArStatus?: (s: ArStatus) => void
  /** First time the visitor rotates or zooms the model (camera change from user input). */
  onInteract?: () => void
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function ModelViewer(
  { src, iosSrc, poster, alt, ar = false, autoRotate = false, className, onLoad, onError, onProgress, onArStatus, onInteract },
  ref,
) {
  const elRef = useRef<ModelViewerElement | null>(null)
  const [ready, setReady] = useState(false)
  const cbs = useRef({ onLoad, onError, onProgress, onArStatus, onInteract })
  cbs.current = { onLoad, onError, onProgress, onArStatus, onInteract }

  useEffect(() => {
    let alive = true
    loadModelViewer()
      .then(() => alive && setReady(true))
      .catch(() => alive && cbs.current.onError?.())
    return () => {
      alive = false
    }
  }, [])

  useImperativeHandle(ref, () => ({
    activateAR: async () => {
      await elRef.current?.activateAR()
    },
    canActivateAR: () => !!elRef.current?.canActivateAR,
    getDimensions: () => readDims(elRef.current),
    resetCamera: () => {
      const el = elRef.current
      if (!el) return
      el.cameraOrbit = 'auto auto auto'
      el.cameraTarget = 'auto auto auto'
      el.fieldOfView = 'auto'
    },
  }))

  useEffect(() => {
    const el = elRef.current
    if (!ready || !el) return
    const handleLoad = () => cbs.current.onLoad?.({ canActivateAR: !!el.canActivateAR, dimensions: readDims(el) })
    const handleError = () => cbs.current.onError?.()
    const handleProgress = (e: Event) => {
      const p = (e as CustomEvent<{ totalProgress?: number }>).detail?.totalProgress
      if (typeof p === 'number') cbs.current.onProgress?.(p)
    }
    let interacted = false
    const handleCamera = (e: Event) => {
      if (interacted || (e as CustomEvent<{ source?: string }>).detail?.source !== 'user-interaction') return
      interacted = true
      cbs.current.onInteract?.()
    }
    const handleAr = (e: Event) => {
      const s = (e as CustomEvent<{ status?: ArStatus }>).detail?.status
      if (s) cbs.current.onArStatus?.(s)
    }
    el.addEventListener('load', handleLoad)
    el.addEventListener('error', handleError)
    el.addEventListener('progress', handleProgress)
    el.addEventListener('ar-status', handleAr)
    el.addEventListener('camera-change', handleCamera)
    return () => {
      el.removeEventListener('camera-change', handleCamera)
      el.removeEventListener('load', handleLoad)
      el.removeEventListener('error', handleError)
      el.removeEventListener('progress', handleProgress)
      el.removeEventListener('ar-status', handleAr)
    }
  }, [ready])

  if (!ready) return <div className={className} aria-hidden />

  return (
    <model-viewer
      ref={(node: HTMLElement | null) => {
        elRef.current = node as ModelViewerElement | null
      }}
      key={src}
      src={src}
      ios-src={iosSrc}
      poster={poster}
      alt={alt}
      camera-controls
      touch-action="pan-y"
      interaction-prompt="none"
      shadow-intensity="1"
      shadow-softness="0.9"
      exposure="1"
      ar={ar}
      auto-rotate={autoRotate || undefined}
      auto-rotate-delay={autoRotate ? '0' : undefined}
      rotation-per-second={autoRotate ? '14deg' : undefined}
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="fixed"
      ar-placement="floor"
      loading="eager"
      reveal="auto"
      className={className}
    >
      {/* AR is launched by our own button via activateAR(); hide the built-in one. */}
      <span slot="ar-button" hidden />
      <span slot="progress-bar" hidden />
    </model-viewer>
  )
})

function readDims(el: ModelViewerElement | null): MeasuredSize | null {
  if (!el || !el.loaded) return null
  try {
    const d = el.getDimensions()
    return { x: d.x, y: d.y, z: d.z }
  } catch {
    return null
  }
}
