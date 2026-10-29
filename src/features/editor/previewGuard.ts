import type { ApplicationInput } from '@/domain/types'
import { service } from '@/services'
import { ok } from '@/services/catalogService'

/** The reference the preview's thank-you screen shows. It is not a real application. */
export const PREVIEW_REFERENCE = 'PREVIEW-0000'

/**
 * Makes sure the application form shown in the Editor's preview cannot send anything: while the preview is open, the page's
 * submit call is answered with a sample confirmation and never reaches the real service (the real Apply page is rendered, not a
 * copy of it). Returns the function that puts the real call back.
 */
export function guardApplicationSubmit(): () => void {
  const target = service as { submitApplication: (input: ApplicationInput) => ReturnType<typeof service.submitApplication> }
  const original = target.submitApplication
  target.submitApplication = async () => ok({ id: 'preview', reference: PREVIEW_REFERENCE })
  return () => {
    target.submitApplication = original
  }
}
