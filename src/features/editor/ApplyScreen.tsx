import { useEditor } from './EditorContext'
import { ApplyFormEditor } from './apply/ApplyFormEditor'

/** /admin/editor/apply: the application form builder edits `draft.applyForm`; the shell owns saving and publishing. */
export default function ApplyScreen() {
  const { draft, setDraft } = useEditor()
  return <ApplyFormEditor draft={draft} onChange={(next) => setDraft(() => next)} />
}
