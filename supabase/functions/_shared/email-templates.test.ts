// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { REASON_MAX_LENGTH, applicationDecisionEmail, businessNoticeEmail, closureCancelledEmail, modelRequestUpdateEmail, renderEmail, teamNoticeEmail } from './email-templates'

describe('invitation email with a code (ADR-0027)', () => {
  it('shows the code in the HTML and text, in both languages, with a plain page link', () => {
    for (const lang of ['en', 'pt'] as const) {
      const e = renderEmail('owner_invitation', lang, { businessName: 'Casa', actionUrl: 'https://app.test/accept-invite?lang=' + lang, code: '48213907' })
      expect(e.html).toContain('48213907')
      expect(e.text).toContain('48213907')
      expect(e.text).toContain(lang === 'en' ? 'Your code: 48213907' : 'Seu código: 48213907')
      expect(e.html).not.toContain('/auth/v1/verify')
    }
  })

  it('refuses a code that is not 6 to 10 digits', () => {
    expect(() => renderEmail('owner_invitation', 'en', { code: '12ab5678' })).toThrow()
    expect(() => renderEmail('owner_invitation', 'en', { code: '<b>1</b>' })).toThrow()
  })
})

describe('team invitation email (ADR-0030)', () => {
  const data = {
    role: 'admin' as const,
    permissions: ['applications.approve', 'businesses.view'],
    actionUrl: 'https://x.app/join#t=abc',
    expiresAt: '2026-11-01T12:00:00Z',
    note: '<b>hi</b>',
    inviterName: 'Owner',
  }

  it('names the role, lists what it can do, escapes the note and gives the expiry', () => {
    const e = renderEmail('team_invitation', 'en', data)
    expect(e.subject).toBe("You're invited to Sanctus")
    expect(e.html).toContain('as <strong>Admin</strong>')
    // R-W6-5: the role's permissions at send time, with the dashboard labels, in the dashboard order.
    expect(e.text).toContain('As Admin you can:\n- View businesses\n- Approve applications')
    expect(e.html).toContain('&lt;b&gt;hi&lt;/b&gt;')
    expect(e.html).not.toContain('<b>hi</b>')
    expect(e.html).toContain('Accept invitation')
    expect(e.html).toContain('1 November 2026')
    expect(e.html).toContain('contact the platform owner')
    expect(e.text).toContain('https://x.app/join#t=abc')
  })

  it('a role with no permissions gets no list and no "you can"', () => {
    const e = renderEmail('team_invitation', 'en', { ...data, permissions: [] })
    expect(e.text).toContain('join the platform as Admin.\n')
    expect(e.text).not.toContain('you can')
    expect(e.html).not.toContain('<li')
  })

  it('refuses a note over 500 characters', () => {
    expect(() => renderEmail('team_invitation', 'en', { ...data, note: 'x'.repeat(501) })).toThrow()
  })
})

describe('application emails (S1.5 Task 4, R-W2-1, §11.2)', () => {
  it("the confirmation email says 'If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email.' (EN) and the PT line", () => {
    const en = renderEmail('application_confirmation', 'en')
    expect(en.text).toContain("If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email.")
    expect(en.text).not.toContain('We will email you when')
    const pt = renderEmail('application_confirmation', 'pt')
    expect(pt.text).toContain('Se for aprovada, receberá um convite para configurar o seu catálogo. Se não for possível, informamos por email.')
    expect(pt.text).not.toContain('Enviaremos um e-mail quando')
  })

  it('the decision email has the §11.2 copy in both languages, and the reason line only when given', () => {
    const en = applicationDecisionEmail('en', 'Casa')
    expect(en.subject).toBe('Your Sanctus application for Casa')
    expect(en.text).toContain('Thank you for applying to list Casa on Sanctus. After review, we are not able to approve this application.')
    expect(en.text).toContain('You are welcome to apply again if your situation changes.')
    expect(en.text).not.toContain('Reason:')
    expect(applicationDecisionEmail('en', 'Casa', 'Too small').text).toContain('Reason: Too small')
    const pt = applicationDecisionEmail('pt', 'Casa', 'Pequena')
    expect(pt.subject).toBe('A sua candidatura à Sanctus para Casa')
    expect(pt.text).toContain('Motivo: Pequena')
    expect(pt.text).toContain('Pode candidatar-se novamente se a sua situação mudar.')
  })

  it('escapes the business name and the reason in the HTML', () => {
    const e = applicationDecisionEmail('en', 'A <i>B</i>', 'x <b>y</b>\nz')
    expect(e.html).not.toContain('<i>B</i>')
    expect(e.html).not.toContain('<b>y</b>')
    expect(e.html).toContain('A &lt;i&gt;B&lt;/i&gt;')
    expect(e.text).toContain('Reason: x <b>y</b>\nz')
  })

  it('refuses a reason over 1000 characters', () => {
    expect(() => applicationDecisionEmail('en', 'Casa', 'x'.repeat(1001))).toThrow()
    expect(() => applicationDecisionEmail('en', 'Casa', 'x'.repeat(1000))).not.toThrow()
  })
})

describe('business_notice (R-W7-2, §11.2)', () => {
  const FOOTER = {
    en: "You can see this change under 'Changes by the platform team' in your dashboard. Contact the Sanctus team if you have questions.",
    pt: "Pode ver esta alteração em 'Alterações da equipa da plataforma' no seu painel. Contacte a equipa Sanctus se tiver dúvidas.",
  }
  const CASES = [
    ['paused', 'en', 'Your Sanctus catalog has been paused', "The Sanctus team paused the public catalog of Casa. Customers who open its link or QR code can't see it for now. Your products and settings are kept."],
    ['paused', 'pt', 'O seu catálogo Sanctus foi pausado', 'A equipa Sanctus pausou o catálogo público de Casa. Quem abrir o link ou o código QR não o consegue ver por agora. Os seus produtos e definições são mantidos.'],
    ['live', 'en', 'Your Sanctus catalog is live', 'The Sanctus team made the catalog of Casa public. Customers can now open it from its link and QR code.'],
    ['live', 'pt', 'O seu catálogo Sanctus está disponível', 'A equipa Sanctus tornou público o catálogo de Casa. Os clientes já o podem abrir pelo link e pelo código QR.'],
    ['product_unpublished', 'en', 'A product was unpublished from your catalog', 'The Sanctus team unpublished Oslo sofa. It is kept as a draft in your dashboard.'],
    ['product_unpublished', 'pt', 'Um produto foi retirado do seu catálogo', 'A equipa Sanctus retirou Oslo sofa do catálogo. Fica guardado como rascunho no seu painel.'],
    ['product_deleted', 'en', 'A product was removed from your catalog', 'The Sanctus team deleted Oslo sofa, with its photos and 3D files.'],
    ['product_deleted', 'pt', 'Um produto foi eliminado do seu catálogo', 'A equipa Sanctus eliminou Oslo sofa, com as suas fotos e ficheiros 3D.'],
  ] as const

  it.each(CASES)('%s (%s): subject, body and the footer', (event, lang, subject, body) => {
    const e = businessNoticeEmail(lang, event, { businessName: 'Casa', productName: 'Oslo sofa' })
    expect(e.subject).toBe(subject)
    expect(e.text).toContain(body)
    expect(e.text).toContain(FOOTER[lang])
    expect(e.html).toContain(FOOTER[lang].replace(/'/g, '&#39;'))
  })

  it('escapes the business and product names in the HTML', () => {
    const e = businessNoticeEmail('en', 'product_deleted', { businessName: 'Casa', productName: '<b>Sofa</b>' })
    expect(e.html).not.toContain('<b>Sofa</b>')
    expect(e.html).toContain('&lt;b&gt;Sofa&lt;/b&gt;')
  })
})

describe('S1.5 Task 13: staff emails (§11.3)', () => {
  it('teamNoticeEmail: "{email} left the Sanctus team", with the role, the date and the audit-log note', () => {
    const e = teamNoticeEmail('ana@sanctus.test', 'team', '25 October 2026')
    expect(e.subject).toBe('ana@sanctus.test left the Sanctus team')
    expect(e.text).toContain(
      "ana@sanctus.test (Team) deleted their Sanctus account on 25 October 2026. Their access ended and their sessions were signed out. Their past actions show as 'Deleted user (Team)' in the audit log.",
    )
    expect(e.html).not.toContain('href=')
    expect(teamNoticeEmail('<x>@a.test', 'admin', '1 May 2026').html).toContain('&lt;x&gt;@a.test')
  })

  it('closureCancelledEmail: "Closure request cancelled: {businessName}" and the status it is back to', () => {
    const e = closureCancelledEmail('Casa & Co', 'active')
    expect(e.subject).toBe('Closure request cancelled: Casa & Co')
    expect(e.text).toContain('The owner of Casa & Co cancelled their account-closure request. The catalog is back to live.')
    expect(e.html).toContain('Casa &amp; Co')
    expect(closureCancelledEmail('Casa', 'draft').text).toContain('The catalog is back to draft.')
    expect(closureCancelledEmail('Casa', 'inactive').text).toContain('The catalog is back to paused.')
  })
})

describe('S4 Task 7: model_request_update (R-S4-15, §9.2)', () => {
  const END = { en: 'Contact the Sanctus team if you have questions.', pt: 'Contacte a equipa Sanctus se tiver dúvidas.' }
  const name = (opt?: string) => `Oslo sofa${opt ? ` (${opt})` : ''}`
  const CASES = [
    ['delivered_published', 'en', 'The 3D model for Oslo sofa is ready', 'The Sanctus team finished the 3D model for {n}. It is now attached to the product, and customers can view it in 3D and in AR on the product page.'],
    ['delivered_published', 'pt', 'O modelo 3D de Oslo sofa está pronto', 'A equipa Sanctus terminou o modelo 3D de {n}. Já está associado ao produto, e os clientes podem vê-lo em 3D e em AR na página do produto.'],
    ['delivered_draft', 'en', 'The 3D model for Oslo sofa is ready', "The Sanctus team finished the 3D model for {n}. It is attached to the product in your dashboard. Publish the product when you're ready, and customers can view it in 3D and in AR."],
    ['delivered_draft', 'pt', 'O modelo 3D de Oslo sofa está pronto', 'A equipa Sanctus terminou o modelo 3D de {n}. Já está associado ao produto no seu painel. Publique o produto quando quiser, e os clientes poderão vê-lo em 3D e em AR.'],
    ['declined', 'en', 'Your 3D model request for Oslo sofa', "The Sanctus team couldn't make the 3D model for {n} from this request. Reason: Too blurry. You can send a new request from the product in your dashboard."],
    ['declined', 'pt', 'O seu pedido de modelo 3D para Oslo sofa', 'A equipa Sanctus não conseguiu criar o modelo 3D de {n} com este pedido. Motivo: Too blurry. Pode enviar um novo pedido a partir do produto no seu painel.'],
  ] as const

  it.each(CASES.flatMap((c) => [[...c, undefined], [...c, 'Walnut']] as const))('%s (%s), option %s: subject, body and closing line', (event, lang, subject, body, option) => {
    const e = modelRequestUpdateEmail(lang, event, { productName: 'Oslo sofa', optionName: option, reason: 'Too blurry' })
    expect(e.subject).toBe(subject)
    expect(e.text).toContain(body.replace('{n}', name(option)).replace('Reason: Too blurry.', 'Reason: Too blurry.'))
    expect(e.text).toContain(END[lang])
    expect(e.html).toContain(END[lang])
  })

  it('a reason with markup and newlines is escaped in html and kept in text', () => {
    const reason = '<b>Too</b> blurry\nTry "again" & resend'
    const e = modelRequestUpdateEmail('en', 'declined', { productName: 'Sofa', reason })
    expect(e.html).not.toContain('<b>Too</b>')
    expect(e.html).toContain('&lt;b&gt;Too&lt;/b&gt; blurry')
    expect(e.html).toContain('&amp; resend')
    expect(e.text).toContain(reason)
  })

  it('a reason over REASON_MAX_LENGTH throws', () => {
    expect(() => modelRequestUpdateEmail('en', 'declined', { productName: 'Sofa', reason: 'x'.repeat(REASON_MAX_LENGTH + 1) })).toThrow(/reason/)
    expect(() => modelRequestUpdateEmail('en', 'declined', { productName: 'Sofa', reason: 'x'.repeat(REASON_MAX_LENGTH) })).not.toThrow()
  })

  it('product and option names are escaped in the html', () => {
    const e = modelRequestUpdateEmail('pt', 'delivered_published', { productName: '<i>Sofa</i>', optionName: 'A&B' })
    expect(e.html).toContain('&lt;i&gt;Sofa&lt;/i&gt; (A&amp;B)')
  })
})
