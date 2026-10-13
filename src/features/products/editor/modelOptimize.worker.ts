// Runs the GLB optimization off the main thread so the editor stays responsive on large files.
import { optimizeGlb } from './modelOptimize'

self.onmessage = async (e: MessageEvent<File>) => {
  self.postMessage(await optimizeGlb(e.data))
}
