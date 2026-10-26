// Minimal types for the two three.js example modules the editor's "Build from GLB" uses (ADR-0039).
// three ships no TypeScript types; only what usdzFromGlb.ts calls is declared here.
declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  export class GLTFLoader {
    parseAsync(data: ArrayBuffer | string, path: string): Promise<{ scene: object }>
  }
}

declare module 'three/examples/jsm/exporters/USDZExporter.js' {
  export interface USDZExporterOptions {
    quickLookCompatible?: boolean
    maxTextureSize?: number
    ar?: { anchoring: { type: 'plane' }; planeAnchoring: { alignment: 'horizontal' | 'vertical' | 'any' } }
  }
  export class USDZExporter {
    parseAsync(scene: object, options?: USDZExporterOptions): Promise<Uint8Array>
  }
}
