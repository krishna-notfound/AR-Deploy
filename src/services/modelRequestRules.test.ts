import { describe, expect, it } from 'vitest'
import * as rules from './modelRequestRules'

/** Spec §8.3 (minus model_request_limit: no open-request limit, owner decision 2026-10-26) plus the plan's two keys. */
const EXPECTED: Record<string, [string, string]> = {
  own_models_not_allowed: ['PERMISSION', '3D files for this business are made by the Sanctus team. Request a 3D model instead.'],
  own_models_admin_only: ['PERMISSION', 'Only the Sanctus team can change this setting, from the business page.'],
  model_request_open: ['CONFLICT', 'This product already has an open 3D model request.'],
  model_request_photos_count: ['VALIDATION', 'Add 2 to 10 photos.'],
  model_request_photo_missing: ['VALIDATION', "A photo didn't finish uploading. Remove it and add it again."],
  model_request_needs_dimensions: ['VALIDATION', "Add the product's width, height and depth first. The 3D model is made to that size."],
  model_request_target_invalid: ['VALIDATION', 'That option no longer exists. Reload and choose again.'],
  model_request_not_cancellable: ['CONFLICT', 'The Sanctus team has started on this model. To stop it, contact the Sanctus team.'],
  model_request_needs_glb: ['VALIDATION', 'Upload the GLB file before delivering. It is needed for the 3D view and Android AR.'],
  models_changed_elsewhere: ['CONFLICT', 'The Sanctus team delivered a 3D model while you were editing. Reload to see it.'],
  invalid_transition: ['CONFLICT', 'This request has changed. Reload to see its current status.'],
  reason_required: ['VALIDATION', 'Write a reason. It is sent to the business.'],
  model_request_not_found: ['NOT_FOUND', "This request doesn't exist or was removed with its product."],
  model_request_note_too_long: ['VALIDATION', 'Keep the note to 1000 characters.'],
  model_request_file_invalid: ['VALIDATION', "Upload the file again. It didn't reach storage."],
}

describe('S4 Task 2: model request errors', () => {
  it('every §8.3 key except model_request_limit maps to its exact copy and code', () => {
    for (const [key, [code, message]] of Object.entries(EXPECTED)) {
      expect(rules.MODEL_REQUEST_ERRORS[key], key).toEqual({ code, message, reason: key })
      expect(rules.modelRequestError(key), key).toEqual({ code, message, reason: key })
    }
    expect(rules.modelRequestError('model_request_limit')).toBeUndefined()
    expect(rules.modelRequestError('forbidden')).toMatchObject({ code: 'PERMISSION', reason: 'forbidden' })
    expect(rules.modelRequestError('aal2_required')).toMatchObject({ code: 'PERMISSION', message: 'This needs 2FA. Sign in with your authenticator code first.', reason: 'aal2_required' })
    expect(rules.modelRequestError('something_else')).toBeUndefined()
  })

  it("model_request_open with option reads 'This option already has…'", () => {
    expect(rules.modelRequestError('model_request_open', { option: true })).toEqual({ code: 'CONFLICT', message: 'This option already has an open 3D model request.', reason: 'model_request_open' })
  })
})
