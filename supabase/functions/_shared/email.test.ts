// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type EmailConfig, type EmailKind, type LogEntry, readEmailConfig, sendAndLog } from './email'
import { type EmailLang, renderEmail } from './email-templates'
import { verifyUnsubscribeToken } from './emailPrefs'

const USER = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-11-14T10:00:00Z')
const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <hello@sanctus.test>',
  appBaseUrl: 'https://app.sanctus.test',
  testRecipients: [],
  adminNotificationEmail: 'inbox@sanctus.test',
  unsubscribeSecret: 'unsub-secret',
  functionsBaseUrl: 'https://proj.supabase.co/functions/v1',
}

function setup(config: EmailConfig = CONFIG) {
  const logs: LogEntry[] = []
  const bodies: Record<string, unknown>[] = []
  const fetchFn = vi.fn(async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 })
  }) as unknown as typeof fetch
  const deps = { config, fetch: fetchFn, now: () => NOW, log: async (e: LogEntry) => (logs.push(e), `log-${logs.length}`) }
  return { deps, logs, bodies }
}

const send = (deps: ReturnType<typeof setup>['deps'], kind: EmailKind, lang: EmailLang, extra: Record<string, unknown> = {}) =>
  sendAndLog(deps, { ...renderEmail(kind, lang, { businessName: 'Casa', productName: 'Sofa', applicantEmail: 'a@b.test', actionUrl: 'https://app.sanctus.test/x' }), to: 'ana@studio.test', kind, ...extra })

describe('footer on every email (ADR-0078)', () => {
  const kinds: EmailKind[] = [
    'owner_invitation', 'invitation_resend', 'application_confirmation', 'admin_notification', 'team_invitation', 'test',
    'security_notice', 'closure_request', 'application_decision', 'business_notice', 'team_notice', 'model_request_update', 'model_request_staff',
  ]

  it.each(kinds.flatMap((k) => (['en', 'pt'] as const).map((l) => [k, l] as const)))('%s (%s) carries the Privacy Policy and Email preferences links', async (kind, lang) => {
    const { deps, bodies } = setup()
    await send(deps, kind, lang)
    const body = bodies[0] as { html: string; text: string }
    const privacy = lang === 'pt' ? 'Política de Privacidade' : 'Privacy Policy'
    const prefs = lang === 'pt' ? 'Preferências de e-mail' : 'Email preferences'
    expect(body.html).toContain(`href="https://app.sanctus.test/privacy"`)
    expect(body.html).toContain(`href="https://app.sanctus.test/email/preferences"`)
    expect(body.html).toContain(`>${privacy}</a>`)
    expect(body.html).toContain(`>${prefs}</a>`)
    expect(body.text).toContain(`${privacy}: https://app.sanctus.test/privacy`)
    expect(body.text).toContain(`${prefs}: https://app.sanctus.test/email/preferences`)
  })

  it('always-sent emails have no unsubscribe, no List-Unsubscribe header, and one line on why they are sent', async () => {
    const { deps, bodies } = setup()
    await send(deps, 'security_notice', 'en')
    const body = bodies[0] as { html: string; text: string; headers?: unknown }
    expect(body.html).not.toContain('Unsubscribe')
    expect(body.text).not.toContain('Unsubscribe')
    expect(body.headers).toBeUndefined()
    expect(body.text).toContain('You are getting this email because it is about the security of your Sanctus account. It cannot be switched off.')
    expect(body.html).not.toContain('<!--sanctus-footer-->')
  })

  it.each([
    ['owner_invitation', 'someone invited you to Sanctus'],
    ['application_confirmation', 'you applied to Sanctus'],
    ['closure_request', 'you manage the Sanctus platform'],
    ['test', 'This is a test email from Sanctus.'],
    ['admin_notification', 'the Sanctus notification inbox'],
  ] as const)('%s says why it is sent', async (kind, phrase) => {
    const { deps, bodies } = setup()
    await send(deps, kind, 'en')
    expect((bodies[0] as { text: string }).text).toContain(phrase)
  })

  it('says why in Portuguese for a Portuguese email', async () => {
    const { deps, bodies } = setup()
    await send(deps, 'application_decision', 'pt')
    expect((bodies[0] as { text: string }).text).toContain('Recebe este e-mail porque se candidatou à Sanctus. Não pode ser desativado.')
  })
})

describe('optional emails: unsubscribe link and headers (ADR-0078)', () => {
  it.each(['en', 'pt'] as const)('adds an Unsubscribe link and the one-click headers (%s)', async (lang) => {
    const { deps, bodies } = setup()
    await send(deps, 'business_notice', lang, { optional: { userId: USER, type: 'business_notices' } })
    const body = bodies[0] as { html: string; text: string; headers: Record<string, string> }
    const label = lang === 'pt' ? 'Cancelar subscrição' : 'Unsubscribe'
    const link = /href="(https:\/\/app\.sanctus\.test\/email\/unsubscribe\?t=([^"]+))"[^>]*>([^<]*)</.exec(body.html)
    expect(link?.[3]).toBe(label)
    expect(body.text).toContain(`${label}: ${link![1]}`)
    // The header goes to the function (a POST target); the link goes to the page.
    expect(body.headers['List-Unsubscribe']).toBe(`<https://proj.supabase.co/functions/v1/email-unsubscribe?t=${link![2]}>`)
    expect(body.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(body.text).not.toContain('cannot be switched off')
    expect(await verifyUnsubscribeToken('unsub-secret', link![2]!, NOW)).toEqual({ ok: true, userId: USER, type: 'business_notices' })
  })

  it('blocks an optional email when the unsubscribe secret is missing, and logs it', async () => {
    const { deps, bodies, logs } = setup({ ...CONFIG, unsubscribeSecret: '' })
    const r = await send(deps, 'business_notice', 'en', { optional: { userId: USER, type: 'business_notices' } })
    expect(r).toMatchObject({ status: 'blocked', error: 'unsubscribe_not_configured' })
    expect(bodies).toHaveLength(0)
    expect(logs[0]).toMatchObject({ status: 'blocked', error: 'unsubscribe_not_configured' })
  })

  it('still sends always-sent emails when the unsubscribe secret is missing', async () => {
    const { deps, bodies } = setup({ ...CONFIG, unsubscribeSecret: '' })
    expect((await send(deps, 'security_notice', 'en')).status).toBe('accepted')
    expect(bodies).toHaveLength(1)
  })
})

describe('readEmailConfig reads the unsubscribe settings', () => {
  it('takes EMAIL_UNSUBSCRIBE_SECRET and derives the functions URL from SUPABASE_URL', () => {
    const env: Record<string, string> = { RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.test', APP_BASE_URL: 'https://x.test/', EMAIL_UNSUBSCRIBE_SECRET: ' s3 ', SUPABASE_URL: 'https://p.supabase.co/' }
    const r = readEmailConfig((n) => env[n])
    expect(r.ok && r.config.unsubscribeSecret).toBe('s3')
    expect(r.ok && r.config.functionsBaseUrl).toBe('https://p.supabase.co/functions/v1')
  })

  it('does not make the secret mandatory: security emails must keep working', () => {
    const r = readEmailConfig((n) => ({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.test', APP_BASE_URL: 'https://x.test' })[n])
    expect(r.ok).toBe(true)
  })
})
