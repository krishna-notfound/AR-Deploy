// Email content for each kind, EN and PT (design/23-email.md). Plain HTML with inline styles (email clients
// ignore stylesheets) plus a text version. Every inserted value is escaped. PT wording follows the landing
// copy (Brazilian Portuguese) until the client confirms the dialect (open decision C6).
import type { EmailKind } from './email.ts'
import { type MemberRole, permissionBullets } from './team.ts'

export type EmailLang = 'en' | 'pt'

export interface TemplateData {
  /** Business name, where the email is about one business. */
  businessName?: string
  /** The action link (invitation page, review page). Must be an absolute https:// URL. */
  actionUrl?: string
  /** One-time code for the owner to type on the invitation page (ADR-0027). Digits only. */
  code?: string
  /** Applicant or invitee email, shown in admin notifications. */
  applicantEmail?: string
  /** Team invitation (ADR-0030): the role offered, the inviter's optional note, and when the link expires (ISO). */
  role?: MemberRole
  /** The role's permission keys at send time (platform_role_permissions), listed with the dashboard labels (R-W6-5). */
  permissions?: string[]
  note?: string
  expiresAt?: string
  inviterName?: string
  /** Account security notice (S1): which change the email reports. */
  notice?: SecurityNotice
  /** Closure alert for the admin inbox: the account that asked to close. */
  accountEmail?: string
  /** Application decision (R-W2-1): the rejection reason, only when the reviewer ticked "Include the reason in the email". */
  reason?: string
  /** Business notice (R-W7-2): which platform change the owner is told about, and the product's name for product changes. */
  businessEvent?: BusinessNoticeEvent
  productName?: string
  /** Team notice (R-W6-3): the day the member closed their account, already formatted. */
  closedOn?: string
  /** Inbox closure alert (R-W7-9): the request was cancelled, and the catalog status it went back to. */
  closureCancelled?: boolean
  catalogStatus?: string
}

/** The platform-team changes a business owner is emailed about (R-W7-2, §11.2). */
export type BusinessNoticeEvent = 'paused' | 'live' | 'product_unpublished' | 'product_deleted'

/** The account changes a security notice can report (spec §7). */
export type SecurityNotice =
  | '2fa_enabled'
  | '2fa_disabled'
  | 'recovery_used'
  | 'recovery_regenerated'
  | '2fa_reset_by_owner'
  | 'closure_requested'
  | 'closure_completed'
  | 'closure_restored'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Copy = { subject: string; heading: string; body: string; bodyHtml?: string; list?: string[]; quote?: string; closing?: string; cta?: string; note?: string }

const ROLE_NAME: Record<MemberRole, string> = { admin: 'Admin', team: 'Team' }
const longDate = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : ''

// The platform console is English only, so the team invitation has one wording for both languages.
const teamInvitation = (d: TemplateData): Copy => {
  const role = ROLE_NAME[d.role ?? 'team']
  const list = permissionBullets(d.permissions ?? [])
  const can = list.length ? ` As ${role} you can:` : ''
  return {
    subject: "You're invited to Sanctus",
    heading: "You're invited to Sanctus",
    body: `Hi,

The Sanctus team has invited you to join the platform as ${role}.${can}`,
    bodyHtml: `Hi,</p><p style="margin:16px 0 0">The Sanctus team has invited you to join the platform as <strong>${esc(role)}</strong>.${esc(can)}`,
    list: list.length ? list : undefined,
    quote: d.note ? `${d.inviterName ? `${d.inviterName}: ` : ''}${d.note}` : undefined,
    cta: 'Accept invitation',
    note: `This link works once and expires on ${longDate(d.expiresAt)}. Not expecting this invitation? You can ignore this email, or contact the platform owner.`,
  }
}

// Account security emails (S1). The account pages are English only, so each has one wording for both languages.
// The code email carries no link at all: a security code next to a button is what phishing looks like.
const securityCode = (): Copy => ({
  subject: 'Your Sanctus security code',
  heading: 'Your security code',
  body: 'Use this code to confirm the change you started in Sanctus. It expires in 10 minutes and works once. If you did not ask for it, you can ignore this email: nothing changes without the code.',
})

const NOT_YOU = 'If this was not you, sign in and change your password, then contact the Sanctus team.'
const NOTICE: Record<SecurityNotice, Omit<Copy, 'cta'>> = {
  '2fa_enabled': {
    subject: 'Two-step verification is on',
    heading: 'Two-step verification is on',
    body: 'Your Sanctus account now asks for a code from your authenticator app when you sign in. Keep your recovery codes somewhere safe.',
    note: NOT_YOU,
  },
  '2fa_disabled': {
    subject: 'Two-step verification was turned off',
    heading: 'Two-step verification was turned off',
    body: 'Your Sanctus account no longer asks for an authenticator code when you sign in. Your recovery codes no longer work.',
    note: NOT_YOU,
  },
  recovery_used: {
    subject: 'A recovery code was used on your account',
    heading: 'A recovery code was used',
    body: 'Someone signed in to your Sanctus account with a recovery code. Two-step verification is now off and your other recovery codes no longer work. Set up two-step verification again from your security settings.',
    note: NOT_YOU,
  },
  recovery_regenerated: {
    subject: 'New recovery codes were created',
    heading: 'New recovery codes were created',
    body: 'A new set of recovery codes was created for your Sanctus account. The previous codes no longer work.',
    note: NOT_YOU,
  },
  '2fa_reset_by_owner': {
    subject: 'Your two-step verification was reset',
    heading: 'Your two-step verification was reset',
    body: 'The platform owner reset two-step verification on your Sanctus account. Your authenticator app and recovery codes no longer work. Sign in and set up two-step verification again.',
    note: 'If you did not ask for this, contact the Sanctus team.',
  },
  closure_requested: {
    subject: 'We received your request to close your account',
    heading: 'Your closure request is with us',
    body: 'Your catalogue is now offline and the Sanctus team will close your account. Until then you can cancel the request from your account settings, and your catalogue goes back to how it was.',
    note: 'If you did not ask for this, sign in, cancel the request and change your password.',
  },
  closure_completed: {
    subject: 'Your Sanctus account was closed',
    heading: 'Your account was closed',
    body: 'Your Sanctus account, your business and its catalogue have been deleted, as you asked. This cannot be undone.',
  },
  closure_restored: {
    subject: 'Your Sanctus account stays open',
    heading: 'Your account stays open',
    body: 'The Sanctus team cancelled the closure of your account. Your catalogue is back to how it was before you asked to close it.',
    note: 'If you still want to close your account, you can ask again from your account settings.',
  },
}
const securityNotice = (d: TemplateData): Copy => ({ ...NOTICE[d.notice ?? '2fa_disabled'], cta: 'Open Sanctus' })

// R-W7-9 (§11.3): the same inbox alert kind, when the owner withdraws the request.
const CATALOG_STATUS_WORD: Record<string, string> = { active: 'live', draft: 'draft', inactive: 'paused' }
const closureRequest = (d: TemplateData): Copy => d.closureCancelled ? {
  subject: `Closure request cancelled: ${d.businessName ?? ''}`,
  heading: `Closure request cancelled: ${d.businessName ?? ''}`,
  body: `The owner of ${d.businessName ?? ''} cancelled their account-closure request. The catalog is back to ${CATALOG_STATUS_WORD[d.catalogStatus ?? ''] ?? 'its earlier status'}.`,
  cta: 'Open Sanctus',
} : ({
  subject: 'An account asked to be closed',
  heading: 'An account asked to be closed',
  body: `${d.accountEmail ?? 'A business owner'} asked to close their Sanctus account. Their catalogue is now offline. Review the request in the platform console: complete the closure, or restore the account.`,
  cta: 'Open Sanctus',
})

// Application decision (R-W2-1, §11.2): sent on rejection only. The reason is the reviewer's text, so it is escaped in
// the HTML (white-space keeps its line breaks) and kept as written in the text version.
const applicationDecision: Record<EmailLang, (d: TemplateData) => Copy> = {
  en: (d) => ({
    subject: `Your Sanctus application for ${d.businessName ?? ''}`,
    heading: `Your Sanctus application for ${d.businessName ?? ''}`,
    body: `Thank you for applying to list ${d.businessName ?? ''} on Sanctus. After review, we are not able to approve this application.`,
    quote: d.reason ? `Reason: ${d.reason}` : undefined,
    closing: 'You are welcome to apply again if your situation changes.',
  }),
  pt: (d) => ({
    subject: `A sua candidatura à Sanctus para ${d.businessName ?? ''}`,
    heading: `A sua candidatura à Sanctus para ${d.businessName ?? ''}`,
    body: `Obrigado pela sua candidatura para apresentar ${d.businessName ?? ''} na Sanctus. Após análise, não nos é possível aprovar esta candidatura.`,
    quote: d.reason ? `Motivo: ${d.reason}` : undefined,
    closing: 'Pode candidatar-se novamente se a sua situação mudar.',
  }),
}

// Business notice (R-W7-2, §11.2): the platform team changed the owner's catalogue. No link: the footer names the
// dashboard card where the change is listed.
const BUSINESS_NOTICE: Record<EmailLang, Record<BusinessNoticeEvent, (d: TemplateData) => { subject: string; body: string }>> = {
  en: {
    paused: (d) => ({
      subject: 'Your Sanctus catalog has been paused',
      body: `The Sanctus team paused the public catalog of ${d.businessName ?? ''}. Customers who open its link or QR code can't see it for now. Your products and settings are kept.`,
    }),
    live: (d) => ({
      subject: 'Your Sanctus catalog is live',
      body: `The Sanctus team made the catalog of ${d.businessName ?? ''} public. Customers can now open it from its link and QR code.`,
    }),
    product_unpublished: (d) => ({
      subject: 'A product was unpublished from your catalog',
      body: `The Sanctus team unpublished ${d.productName ?? ''}. It is kept as a draft in your dashboard.`,
    }),
    product_deleted: (d) => ({
      subject: 'A product was removed from your catalog',
      body: `The Sanctus team deleted ${d.productName ?? ''}, with its photos and 3D files.`,
    }),
  },
  pt: {
    paused: (d) => ({
      subject: 'O seu catálogo Sanctus foi pausado',
      body: `A equipa Sanctus pausou o catálogo público de ${d.businessName ?? ''}. Quem abrir o link ou o código QR não o consegue ver por agora. Os seus produtos e definições são mantidos.`,
    }),
    live: (d) => ({
      subject: 'O seu catálogo Sanctus está disponível',
      body: `A equipa Sanctus tornou público o catálogo de ${d.businessName ?? ''}. Os clientes já o podem abrir pelo link e pelo código QR.`,
    }),
    product_unpublished: (d) => ({
      subject: 'Um produto foi retirado do seu catálogo',
      body: `A equipa Sanctus retirou ${d.productName ?? ''} do catálogo. Fica guardado como rascunho no seu painel.`,
    }),
    product_deleted: (d) => ({
      subject: 'Um produto foi eliminado do seu catálogo',
      body: `A equipa Sanctus eliminou ${d.productName ?? ''}, com as suas fotos e ficheiros 3D.`,
    }),
  },
}
const BUSINESS_NOTICE_FOOTER: Record<EmailLang, string> = {
  en: "You can see this change under 'Changes by the platform team' in your dashboard. Contact the Sanctus team if you have questions.",
  pt: "Pode ver esta alteração em 'Alterações da equipa da plataforma' no seu painel. Contacte a equipa Sanctus se tiver dúvidas.",
}
const businessNotice = (lang: EmailLang) => (d: TemplateData): Copy => {
  const c = BUSINESS_NOTICE[lang][d.businessEvent ?? 'paused'](d)
  return { subject: c.subject, heading: c.subject, body: c.body, closing: BUSINESS_NOTICE_FOOTER[lang] }
}

// Team notice (R-W6-3, §11.3): a staff member closed their own account. Sent to each platform Owner; no link.
const teamNotice = (d: TemplateData): Copy => {
  const role = d.role ? ROLE_NAME[d.role] : 'Team'
  return {
    subject: `${d.accountEmail ?? ''} left the Sanctus team`,
    heading: `${d.accountEmail ?? ''} left the Sanctus team`,
    body: `${d.accountEmail ?? ''} (${role}) deleted their Sanctus account on ${d.closedOn ?? ''}. Their access ended and their sessions were signed out. Their past actions show as 'Deleted user (${role})' in the audit log.`,
  }
}

/** Every email kind has its copy in COPY below. */
export type TemplateKind = EmailKind

const COPY: Record<TemplateKind, Record<EmailLang, (d: TemplateData) => Copy>> = {
  team_invitation: { en: teamInvitation, pt: teamInvitation },
  security_code: { en: securityCode, pt: securityCode },
  security_notice: { en: securityNotice, pt: securityNotice },
  closure_request: { en: closureRequest, pt: closureRequest },
  application_decision: applicationDecision,
  business_notice: { en: businessNotice('en'), pt: businessNotice('pt') },
  team_notice: { en: teamNotice, pt: teamNotice },
  owner_invitation: {
    en: (d) => ({
      subject: `You're invited to manage ${d.businessName ?? 'your catalogue'} on Sanctus`,
      heading: 'Your Sanctus account is ready',
      body: `The Sanctus team has created an owner account for ${d.businessName ?? 'your business'}. Open the invitation page, enter this email address and the code below, then choose your password.`,
      cta: 'Open the invitation page',
      note: 'The code works once and expires after an hour. If it has expired, ask the Sanctus team to send a new invitation.',
    }),
    pt: (d) => ({
      subject: `Convite para gerenciar ${d.businessName ?? 'seu catálogo'} na Sanctus`,
      heading: 'Sua conta Sanctus está pronta',
      body: `A equipe Sanctus criou uma conta de proprietário para ${d.businessName ?? 'sua empresa'}. Abra a página do convite, informe este endereço de e-mail e o código abaixo e depois defina sua senha.`,
      cta: 'Abrir a página do convite',
      note: 'O código funciona uma vez e expira em uma hora. Se tiver expirado, peça à equipe Sanctus um novo convite.',
    }),
  },
  invitation_resend: {
    en: (d) => ({
      subject: `New invitation code for ${d.businessName ?? 'your Sanctus account'}`,
      heading: 'Here is a new invitation code',
      body: 'Your previous invitation code no longer works. Open the invitation page and enter this email address and the code below to set your password.',
      cta: 'Open the invitation page',
      note: 'Only the newest code works. It expires after an hour.',
    }),
    pt: (d) => ({
      subject: `Novo código de convite para ${d.businessName ?? 'sua conta Sanctus'}`,
      heading: 'Aqui está um novo código de convite',
      body: 'O código de convite anterior já não funciona. Abra a página do convite e informe este endereço de e-mail e o código abaixo para definir sua senha.',
      cta: 'Abrir a página do convite',
      note: 'Apenas o código mais recente funciona. Ele expira em uma hora.',
    }),
  },
  // Goes to an address typed into a public form, so it carries no applicant-supplied text: anything inserted here
  // would let the form send arbitrary content to arbitrary inboxes (SEC-23).
  application_confirmation: {
    en: () => ({
      subject: 'We received your application',
      heading: 'Thank you, your application is with us',
      body: "The Sanctus team reviews every business before its catalogue goes public. If we approve it, you will receive an invitation to set up your catalog. If we can't, we will tell you by email. If you did not apply, you can ignore this email.",
    }),
    pt: () => ({
      subject: 'Recebemos sua candidatura',
      heading: 'Obrigado, recebemos sua candidatura',
      body: 'A equipe Sanctus analisa cada empresa antes de o catálogo ficar público. Se for aprovada, receberá um convite para configurar o seu catálogo. Se não for possível, informamos por email. Se você não se candidatou, pode ignorar este e-mail.',
    }),
  },
  admin_notification: {
    en: (d) => ({
      subject: `New business awaiting review: ${d.businessName ?? 'unnamed'}`,
      heading: 'A business is waiting for approval',
      body: `${d.businessName ?? 'A business'}${d.applicantEmail ? ` (${d.applicantEmail})` : ''} is waiting for review.`,
      cta: 'Open the review',
    }),
    pt: (d) => ({
      subject: `Nova empresa aguardando análise: ${d.businessName ?? 'sem nome'}`,
      heading: 'Uma empresa aguarda aprovação',
      body: `${d.businessName ?? 'Uma empresa'}${d.applicantEmail ? ` (${d.applicantEmail})` : ''} aguarda análise.`,
      cta: 'Abrir a análise',
    }),
  },
  test: {
    en: () => ({
      subject: 'Sanctus test email',
      heading: 'Email sending works',
      body: 'This is a test message from the Sanctus platform. No action is needed.',
    }),
    pt: () => ({
      subject: 'E-mail de teste Sanctus',
      heading: 'O envio de e-mails funciona',
      body: 'Esta é uma mensagem de teste da plataforma Sanctus. Nenhuma ação é necessária.',
    }),
  },
}

/** The longest rejection reason (business_applications.decision_reason is at most 1000 characters). */
export const REASON_MAX_LENGTH = 1000

const CODE_LABEL: Record<EmailLang, string> = { en: 'Your code', pt: 'Seu código' }

export function renderEmail(kind: TemplateKind, lang: EmailLang, data: TemplateData = {}): RenderedEmail {
  if (data.actionUrl && !/^https:\/\/[^\s]+$/.test(data.actionUrl)) throw new Error('actionUrl must be an absolute https:// URL')
  if (data.code !== undefined && !/^\d{6,10}$/.test(data.code)) throw new Error('code must be 6 to 10 digits')
  if (data.note !== undefined && data.note.length > 500) throw new Error('note must be at most 500 characters')
  if (data.reason !== undefined && [...data.reason].length > REASON_MAX_LENGTH) throw new Error(`reason must be at most ${REASON_MAX_LENGTH} characters`)
  const c = COPY[kind][lang](data)
  const codeBlock = data.code
    ? `<p style="margin:28px 0 0;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6E6559">${esc(CODE_LABEL[lang])}</p>
<p style="margin:8px 0 0;font:500 30px/1.2 'Courier New',Courier,monospace;letter-spacing:0.28em;color:#1D1C1A">${esc(data.code)}</p>`
    : ''
  const button =
    c.cta && data.actionUrl
      ? `<p style="margin:32px 0"><a href="${esc(data.actionUrl)}" style="display:inline-block;background:#1D1C1A;color:#F3F0E9;text-decoration:none;font:500 12px/1 Helvetica,Arial,sans-serif;letter-spacing:0.18em;text-transform:uppercase;padding:16px 28px">${esc(c.cta)}</a></p>`
      : ''
  const html = `<!doctype html><html lang="${lang === 'pt' ? 'pt' : 'en'}"><body style="margin:0;background:#F3F0E9;padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FAF8F3;border:1px solid #D9D3C7">
<tr><td style="padding:40px 40px 8px;font:400 15px/1 Georgia,'Times New Roman',serif;letter-spacing:0.42em;color:#1D1C1A">SANCTUS</td></tr>
<tr><td style="padding:16px 40px 40px;font:400 15px/1.7 Helvetica,Arial,sans-serif;color:#3A352F">
<h1 style="margin:16px 0;font:400 28px/1.2 Georgia,'Times New Roman',serif;color:#1D1C1A">${esc(c.heading)}</h1>
<p style="margin:0">${c.bodyHtml ?? esc(c.body)}</p>
${c.list ? `<ul style="margin:12px 0 0;padding-left:20px">${c.list.map((li) => `<li style="margin:4px 0">${esc(li)}</li>`).join('')}</ul>` : ''}
${c.quote ? `<p style="margin:20px 0 0;padding:12px 16px;border-left:2px solid #8A765C;background:#F3F0E9;white-space:pre-line">${esc(c.quote)}</p>` : ''}
${c.closing ? `<p style="margin:16px 0 0">${esc(c.closing)}</p>` : ''}
${codeBlock}
${button}
${c.note ? `<p style="margin:0;font-size:13px;color:#5A5148">${esc(c.note)}</p>` : ''}
${data.actionUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#6E6559;word-break:break-all">${esc(data.actionUrl)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`
  const text = [c.heading, '', c.body, ...(c.list ? c.list.map((li) => `- ${li}`) : []), ...(c.quote ? ['', c.quote] : []), ...(c.closing ? ['', c.closing] : []), ...(data.code ? ['', `${CODE_LABEL[lang]}: ${data.code}`] : []), ...(c.cta && data.actionUrl ? ['', `${c.cta}: ${data.actionUrl}`] : []), ...(c.note ? ['', c.note] : []), '', 'Sanctus'].join('\n')
  return { subject: c.subject, html, text }
}

/** The rejection notice to an applicant (R-W2-1), in the application's language; the reason only when the reviewer ticked it. */
export const applicationDecisionEmail = (lang: EmailLang, businessName: string, reason?: string): RenderedEmail =>
  renderEmail('application_decision', lang, { businessName, reason })

/** A platform-team change, told to the business owner (R-W7-2), in the application's language. */
export const businessNoticeEmail = (lang: EmailLang, event: BusinessNoticeEvent, d: { businessName: string; productName?: string }): RenderedEmail =>
  renderEmail('business_notice', lang, { businessEvent: event, businessName: d.businessName, productName: d.productName })

/** The only link an account-security email may carry: the app's own https base URL. */
const appLink = (appBaseUrl: string | undefined) => (appBaseUrl && /^https:\/\/[^\s/]+$/.test(appBaseUrl) ? appBaseUrl : undefined)

/** "Your Sanctus security code: 123456 (expires in 10 minutes)". No link. */
export function securityCodeEmail(code: string): RenderedEmail {
  if (!/^\d{6}$/.test(code)) throw new Error('a security code is 6 digits')
  return renderEmail('security_code', 'en', { code })
}

/** A plain notice about a change to the account, with at most a link to the app. */
export const securityNoticeEmail = (notice: SecurityNotice, appBaseUrl?: string): RenderedEmail =>
  renderEmail('security_notice', 'en', { notice, actionUrl: appLink(appBaseUrl) })

/** The admin inbox alert for a business owner's closure request. */
export const closureRequestEmail = (accountEmail: string, appBaseUrl?: string): RenderedEmail =>
  renderEmail('closure_request', 'en', { accountEmail, actionUrl: appLink(appBaseUrl) })

/** The inbox alert when a business owner cancels their closure request (R-W7-9); `status` is the catalog's status now. */
export const closureCancelledEmail = (businessName: string, status: string, appBaseUrl?: string): RenderedEmail =>
  renderEmail('closure_request', 'en', { closureCancelled: true, businessName, catalogStatus: status, actionUrl: appLink(appBaseUrl) })

/** To each platform Owner when an Admin or Team member closes their own account (R-W6-3). */
export const teamNoticeEmail = (accountEmail: string, role: MemberRole, closedOn: string): RenderedEmail =>
  renderEmail('team_notice', 'en', { accountEmail, role, closedOn })
