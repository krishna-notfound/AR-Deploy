// 3D model request errors (S4 spec §8.3), shared by the demo and Supabase services. The database raises each key as
// the exception message; this is the fixed copy shown for it. There is no open-request limit (owner decision
// 2026-10-26), so `model_request_limit` has no entry.
import { type ServiceError, type ServiceErrorCode, TEAM_ERRORS } from './catalogService'

const entry = (code: ServiceErrorCode, message: string) => ({ code, message })

const COPY: Record<string, { code: ServiceErrorCode; message: string }> = {
  own_models_not_allowed: entry('PERMISSION', '3D files for this business are made by the Sanctus team. Request a 3D model instead.'),
  own_models_admin_only: entry('PERMISSION', 'Only the Sanctus team can change this setting, from the business page.'),
  model_request_open: entry('CONFLICT', 'This product already has an open 3D model request.'),
  model_request_photos_count: entry('VALIDATION', 'Add 2 to 10 photos.'),
  model_request_photo_missing: entry('VALIDATION', "A photo didn't finish uploading. Remove it and add it again."),
  model_request_needs_dimensions: entry('VALIDATION', "Add the product's width, height and depth first. The 3D model is made to that size."),
  model_request_target_invalid: entry('VALIDATION', 'That option no longer exists. Reload and choose again.'),
  model_request_not_cancellable: entry('CONFLICT', 'The Sanctus team has started on this model. To stop it, contact the Sanctus team.'),
  model_request_needs_glb: entry('VALIDATION', 'Upload the GLB file before delivering. It is needed for the 3D view and Android AR.'),
  models_changed_elsewhere: entry('CONFLICT', 'The Sanctus team delivered a 3D model while you were editing. Reload to see it.'),
  invalid_transition: entry('CONFLICT', 'This request has changed. Reload to see its current status.'),
  reason_required: entry('VALIDATION', 'Write a reason. It is sent to the business.'),
  model_request_not_found: entry('NOT_FOUND', "This request doesn't exist or was removed with its product."),
  model_request_note_too_long: entry('VALIDATION', 'Keep the note to 1000 characters.'),
  model_request_file_invalid: entry('VALIDATION', "Upload the file again. It didn't reach storage."),
}

/** Every S4 refusal by key, with `reason` = the key. */
export const MODEL_REQUEST_ERRORS: Record<string, ServiceError> = Object.fromEntries(
  Object.entries(COPY).map(([reason, e]) => [reason, { ...e, reason }]),
)

/**
 * The service error for a refusal key, or undefined for a key S4 doesn't know. `forbidden` and `aal2_required` keep
 * the existing team copy. `option`: the request was for one of the product's options.
 */
export function modelRequestError(key: string, ctx?: { option?: boolean }): ServiceError | undefined {
  if (key === 'forbidden' || key === 'aal2_required') {
    const team = TEAM_ERRORS[key]!
    return { code: team.code, message: team.message, reason: key }
  }
  if (!Object.hasOwn(MODEL_REQUEST_ERRORS, key)) return undefined
  const e = MODEL_REQUEST_ERRORS[key]!
  if (key === 'model_request_open' && ctx?.option) return { ...e, message: 'This option already has an open 3D model request.' }
  return { ...e }
}
