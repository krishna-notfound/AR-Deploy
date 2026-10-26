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
