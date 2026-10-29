import { createContext, useContext } from 'react'
import type { DraftEditor } from './useDraftEditor'

/** The Editor's working copy, shared by the shell and its screens (Pages, Application form, Social media). */
export const EditorContext = createContext<DraftEditor | null>(null)

export function useEditor(): DraftEditor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditor must be used inside the Editor layout')
  return editor
}
