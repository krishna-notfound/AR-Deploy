import 'react'

type ModelViewerAttributes = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
  src?: string
  'ios-src'?: string
  poster?: string
  alt?: string
  ar?: boolean
  'ar-modes'?: string
  'ar-scale'?: 'auto' | 'fixed'
  'ar-placement'?: 'floor' | 'wall'
  'camera-controls'?: boolean
  'touch-action'?: string
  'shadow-intensity'?: string
  'shadow-softness'?: string
  exposure?: string
  'environment-image'?: string
  'interaction-prompt'?: 'auto' | 'none'
  'camera-orbit'?: string
  'min-camera-orbit'?: string
  'max-camera-orbit'?: string
  'field-of-view'?: string
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
  'disable-tap'?: boolean
  'auto-rotate'?: boolean
  'auto-rotate-delay'?: string
  'rotation-per-second'?: string
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes
    }
  }
}
