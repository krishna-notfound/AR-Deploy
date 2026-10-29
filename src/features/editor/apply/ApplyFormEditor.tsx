import type { SiteContent } from '@/domain/siteContent'

/**
 * The application form builder screen (/admin/editor/apply). The Editor shell owns autosave, publish and history; the
 * builder only edits `draft.applyForm` and hands the whole next document back through `onChange`.
 * This file is a stub; the application form track replaces it.
 */
export interface ApplyFormEditorProps {
  draft: SiteContent
  onChange: (next: SiteContent) => void
}

export function ApplyFormEditor(_props: ApplyFormEditorProps) {
  return null
}
