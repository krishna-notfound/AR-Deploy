// Both parts together. Tests and tools only: importing this puts the whole dashboard dictionary in the bundle (ADR-0045).
import { enCore } from './en'
import { enDashboard } from './en.dashboard'
import { ptCore } from './pt'
import { ptDashboard } from './pt.dashboard'

export const en = { ...enCore, ...enDashboard } as const
export const pt: Partial<Record<keyof typeof en, string>> = { ...ptCore, ...ptDashboard }
