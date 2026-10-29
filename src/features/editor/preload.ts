// Loaders for the Editor's code-split chunks, shared by the router (React.lazy) and by "preload on intent" so a hover
// or a direct visit starts everything at once instead of one step after the other. This file holds only dynamic imports
// and the small draftPrefetch module, so importing it never pulls Editor code into the dashboard shell's chunk.
import { prefetchContentDraft } from './draftPrefetch'

/** The layout chunk (it bundles PublishDialog and so the generated legal text). Starts the draft request in parallel. */
export const loadEditorLayout = () => {
  prefetchContentDraft()
  return import('./EditorLayout')
}
export const loadPagesScreen = () => import('./PagesScreen')
export const loadPageEditorScreen = () => import('./PageEditorScreen')
export const loadApplyScreen = () => import('./ApplyScreen')
export const loadSocialScreen = () => import('./SocialScreen')

const ignore = () => undefined

/** The screens inside the layout, fetched in parallel (called as soon as the layout chunk runs). */
export function preloadEditorScreens(): void {
  for (const load of [loadPagesScreen, loadPageEditorScreen, loadApplyScreen, loadSocialScreen]) load().catch(ignore)
}

/** Everything the Editor needs for its first screen, in parallel: the layout, the Pages screen and the draft request. */
export function preloadEditor(): void {
  prefetchContentDraft()
  loadEditorLayout().catch(ignore)
  loadPagesScreen().catch(ignore)
}
