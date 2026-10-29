// The dashboard dictionary (admin, business, settings, team, products, editor, applications, shared components): loaded when a dashboard
// route opens, never on the public pages (ADR-0045). Keys the public pages need are in en.shared.ts instead. English master.
import { enAdmin } from './en.admin'
import { enApplications } from './en.applications'
import { enBusiness } from './en.business'
import { enEditor } from './en.editor'
import { enProducts } from './en.products'
import { enSettings } from './en.settings'
import { enTeam } from './en.team'
import { enUi } from './en.ui'

export const enDashboard = {
  ...enEditor,
  ...enApplications,
  ...enAdmin,
  ...enProducts,
  ...enBusiness,
  ...enSettings,
  ...enTeam,
  ...enUi,
} as const
