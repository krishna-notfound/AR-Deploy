// Where the full-screen settings hub returns to: the page that opened it travels in the router state.

/** Router state that tells the hub where its close button and Esc go back to. */
export interface SettingsReturnState {
  from: string
}

/** Pass as a link's `state` when opening settings, so closing returns to `here` (path plus query). */
export const settingsReturnState = (here: string): SettingsReturnState => ({ from: here })

/** The page that opened settings, if the router state names a dashboard page outside the hub. */
export function readReturnState(state: unknown): string | null {
  const from = (state as Partial<SettingsReturnState> | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return null
  return /^\/(admin|dashboard)\/settings(\/|$|\?)/.test(from) ? null : from
}
