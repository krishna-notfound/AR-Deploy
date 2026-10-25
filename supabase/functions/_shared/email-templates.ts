// Email content for each kind, EN and PT (design/23-email.md). Plain HTML with inline styles (email clients
// ignore stylesheets) plus a text version. Every inserted value is escaped. PT wording follows the landing
// copy (Brazilian Portuguese) until the client confirms the dialect (open decision C6).
import type { EmailKind } from './email.ts'
import { ROLE_SUMMARY, type MemberRole } from './team.ts'

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
  note?: string
  expiresAt?: string
  inviterName?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Copy = { subject: string; heading: string; body: string; bodyHtml?: string; list?: string[]; quote?: string; cta?: string; note?: string }

const ROLE_NAME: Record<MemberRole, string> = { admin: 'Admin', team: 'Team' }
const longDate = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso)) : ''

// The platform console is English only, so the team invitation has one wording for both languages.
const teamInvitation = (d: TemplateData): Copy => {
  const role = ROLE_NAME[d.role ?? 'team']
  return {
    subject: "You're invited to Sanctus",
    heading: "You're invited to Sanctus",
    body: `Hi,

The Sanctus team has invited you to join the platform as ${role}. As ${role} you can:`,
    bodyHtml: `Hi,</p><p style="margin:16px 0 0">The Sanctus team has invited you to join the platform as <strong>${esc(role)}</strong>. As ${esc(role)} you can:`,
    list: ROLE_SUMMARY[d.role ?? 'team'],
    quote: d.note ? `${d.inviterName ? `${d.inviterName}: ` : ''}${d.note}` : undefined,
    cta: 'Accept invitation',
    note: `This link works once and expires on ${longDate(d.expiresAt)}. Not expecting this invitation? You can ignore this email, or contact the platform owner.`,
  }
}

const COPY: Record<EmailKind, Record<EmailLang, (d: TemplateData) => Copy>> = {
  team_invitation: { en: teamInvitation, pt: teamInvitation },
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
      body: 'The Sanctus team reviews every business before its catalogue goes public. We will email you when your application has been reviewed. If you did not apply, you can ignore this email.',
    }),
    pt: () => ({
      subject: 'Recebemos sua candidatura',
      heading: 'Obrigado, recebemos sua candidatura',
      body: 'A equipe Sanctus analisa cada empresa antes de o catálogo ficar público. Enviaremos um e-mail quando sua candidatura for analisada. Se você não se candidatou, pode ignorar este e-mail.',
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

const CODE_LABEL: Record<EmailLang, string> = { en: 'Your code', pt: 'Seu código' }

export function renderEmail(kind: EmailKind, lang: EmailLang, data: TemplateData = {}): RenderedEmail {
  if (data.actionUrl && !/^https:\/\/[^\s]+$/.test(data.actionUrl)) throw new Error('actionUrl must be an absolute https:// URL')
  if (data.code !== undefined && !/^\d{6,10}$/.test(data.code)) throw new Error('code must be 6 to 10 digits')
  if (data.note !== undefined && data.note.length > 500) throw new Error('note must be at most 500 characters')
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
${codeBlock}
${button}
${c.note ? `<p style="margin:0;font-size:13px;color:#5A5148">${esc(c.note)}</p>` : ''}
${data.actionUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#6E6559;word-break:break-all">${esc(data.actionUrl)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`
  const text = [c.heading, '', c.body, ...(c.list ? c.list.map((li) => `- ${li}`) : []), ...(c.quote ? ['', c.quote] : []), ...(data.code ? ['', `${CODE_LABEL[lang]}: ${data.code}`] : []), ...(c.cta && data.actionUrl ? ['', `${c.cta}: ${data.actionUrl}`] : []), ...(c.note ? ['', c.note] : []), '', 'Sanctus'].join('\n')
  return { subject: c.subject, html, text }
}
