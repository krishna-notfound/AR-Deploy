import { type ReactNode, createContext, useCallback, useContext, useEffect, useId, useRef } from 'react'

/**
 * Why Save must wait: a 3D file is still being checked, made lighter or uploaded ('working'), or it waits for the
 * person's scale choice ('waiting'). Until it lands in the form a save would leave it out, and the product would silently
 * lose the model (QA P3D-01).
 */
export type ModelBusy = 'working' | 'waiting'

type Report = (id: string, reason: ModelBusy | null) => void
const BusyContext = createContext<Report | null>(null)

/** The editor wraps its sections in this; `onChange` gets the strongest reason any file has right now, or null. */
export function ModelBusyProvider({ onChange, children }: { onChange: (reason: ModelBusy | null) => void; children: ReactNode }) {
  const reasons = useRef(new Map<string, ModelBusy>())
  const report = useCallback<Report>(
    (id, reason) => {
      if (reason) reasons.current.set(id, reason)
      else reasons.current.delete(id)
      const all = [...reasons.current.values()]
      onChange(all.includes('working') ? 'working' : all.includes('waiting') ? 'waiting' : null)
    },
    [onChange],
  )
  return <BusyContext.Provider value={report}>{children}</BusyContext.Provider>
}

/** A file slot tells the editor it is busy. Outside the editor (no provider) this does nothing. */
export function useReportModelBusy(reason: ModelBusy | null) {
  const report = useContext(BusyContext)
  const id = useId()
  useEffect(() => {
    report?.(id, reason)
  }, [report, id, reason])
  useEffect(() => () => report?.(id, null), [report, id])
}
