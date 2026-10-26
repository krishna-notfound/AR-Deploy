import { describe, expect, it } from 'vitest'
import { EMAIL_KIND_LABEL } from './labels'

describe('EMAIL_KIND_LABEL (S1.5 R-W8-6)', () => {
  it("has team_invitation 'Team invitation', security_code 'Security code', security_notice 'Security notice', closure_request 'Closure request', application_decision 'Application decision', business_notice 'Business notice', team_notice 'Team notice'", () => {
    expect(EMAIL_KIND_LABEL).toMatchObject({
      team_invitation: 'Team invitation',
      security_code: 'Security code',
      security_notice: 'Security notice',
      closure_request: 'Closure request',
      application_decision: 'Application decision',
      business_notice: 'Business notice',
      team_notice: 'Team notice',
    })
  })
})

describe('S4 Task 2: model request labels', () => {
  it("eventLabel('business_own_models_changed', {to:false}) = 'Own 3D uploads turned off' and the five model_request labels", async () => {
    const { eventLabel, EMAIL_KIND_LABEL } = await import('./labels')
    expect(eventLabel('business_own_models_changed', { to: false })).toBe('Own 3D uploads turned off')
    expect(eventLabel('business_own_models_changed', { to: true })).toBe('Own 3D uploads allowed')
    expect(eventLabel('business_own_models_changed')).toBe('Own 3D uploads turned off')
    expect(eventLabel('model_request_created')).toBe('3D model requested')
    expect(eventLabel('model_request_cancelled')).toBe('3D model request cancelled')
    expect(eventLabel('model_request_started')).toBe('3D model work started')
    expect(eventLabel('model_request_delivered')).toBe('3D model delivered')
    expect(eventLabel('model_request_rejected')).toBe('3D model request declined')
    expect(EMAIL_KIND_LABEL.model_request_update).toBe('3D model update')
  })
})
