// Email content for each kind, EN and PT (design/23-email.md). Plain HTML with inline styles (email clients
// ignore stylesheets) plus a text version. Every inserted value is escaped. PT wording follows the landing
// copy (Brazilian Portuguese) until the client confirms the dialect (open decision C6).
import type { EmailKind } from './email.ts'

export type EmailLang = 'en' | 'pt'

export interface TemplateData {
  /** Business name, where the email is about one business. */
  businessName?: string
  /** The action link (invitation, sign-in, review page). Must be an absolute https:// URL. */
  actionUrl?: string
  /** Applicant or invitee email, shown in admin notifications. */
  applicantEmail?: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Copy = { subject: string; heading: string; body: string; cta?: string; note?: string }

const COPY: Record<EmailKind, Record<EmailLang, (d: TemplateData) => Copy>> = {
  owner_invitation: {
    en: (d) => ({
      subject: `You're invited to manage ${d.businessName ?? 'your catalogue'} on Sanctus`,
      heading: 'Your Sanctus account is ready',
      body: `The Sanctus team has created an owner account for ${d.businessName ?? 'your business'}. Set your password to open your dashboard.`,
      cta: 'Set my password',
      note: 'This invitation link works once and expires. If it has expired, ask the Sanctus team to send a new one.',
    }),
    pt: (d) => ({
      subject: `Convite para gerenciar ${d.businessName ?? 'seu catálogo'} na Sanctus`,
      heading: 'Sua conta Sanctus está pronta',
      body: `A equipe Sanctus criou uma conta de proprietário para ${d.businessName ?? 'sua empresa'}. Defina sua senha para abrir o painel.`,
      cta: 'Definir minha senha',
      note: 'Este link de convite funciona uma vez e expira. Se tiver expirado, peça à equipe Sanctus um novo convite.',
    }),
  },
  invitation_resend: {
    en: (d) => ({
      subject: `New invitation link for ${d.businessName ?? 'your Sanctus account'}`,
      heading: 'Here is a new invitation link',
      body: 'Your previous invitation link no longer works. Use this one to set your password.',
      cta: 'Set my password',
      note: 'Only the newest link works.',
    }),
    pt: (d) => ({
      subject: `Novo link de convite para ${d.businessName ?? 'sua conta Sanctus'}`,
      heading: 'Aqui está um novo link de convite',
      body: 'O link de convite anterior já não funciona. Use este para definir sua senha.',
      cta: 'Definir minha senha',
      note: 'Apenas o link mais recente funciona.',
    }),
  },
  application_confirmation: {
    en: (d) => ({
      subject: `We received ${d.businessName ?? 'your application'}`,
      heading: 'Thank you, your application is with us',
      body: `The Sanctus team reviews every business before its catalogue goes public. We will email you when ${d.businessName ?? 'your business'} has been reviewed.`,
    }),
    pt: (d) => ({
      subject: `Recebemos ${d.businessName ?? 'sua candidatura'}`,
      heading: 'Obrigado, recebemos sua candidatura',
      body: `A equipe Sanctus analisa cada empresa antes de o catálogo ficar público. Enviaremos um e-mail quando ${d.businessName ?? 'sua empresa'} for analisada.`,
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

export function renderEmail(kind: EmailKind, lang: EmailLang, data: TemplateData = {}): RenderedEmail {
  if (data.actionUrl && !/^https:\/\/[^\s]+$/.test(data.actionUrl)) throw new Error('actionUrl must be an absolute https:// URL')
  const c = COPY[kind][lang](data)
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
<p style="margin:0">${esc(c.body)}</p>
${button}
${c.note ? `<p style="margin:0;font-size:13px;color:#5A5148">${esc(c.note)}</p>` : ''}
${data.actionUrl ? `<p style="margin:24px 0 0;font-size:12px;color:#6E6559;word-break:break-all">${esc(data.actionUrl)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`
  const text = [c.heading, '', c.body, ...(c.cta && data.actionUrl ? ['', `${c.cta}: ${data.actionUrl}`] : []), ...(c.note ? ['', c.note] : []), '', '— Sanctus'].join('\n')
  return { subject: c.subject, html, text }
}
