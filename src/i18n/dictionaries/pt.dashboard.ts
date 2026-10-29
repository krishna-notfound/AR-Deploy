import type { TranslationKey } from './en'
import { ptAdmin } from './pt.admin'
import { ptApplications } from './pt.applications'
import { ptBusiness } from './pt.business'
import { ptEditor } from './pt.editor'
import { ptProducts } from './pt.products'
import { ptSettings } from './pt.settings'
import { ptTeam } from './pt.team'
import { ptUi } from './pt.ui'

// pt-PT for the dashboard dictionary (en.dashboard.ts). Loaded only when the language is Portuguese. Missing keys fall back to English.
export const ptDashboard: Partial<Record<TranslationKey, string>> = {
  ...ptEditor,
  ...ptApplications,
  ...ptAdmin,
  ...ptProducts,
  ...ptBusiness,
  ...ptSettings,
  ...ptTeam,
  ...ptUi,
}
