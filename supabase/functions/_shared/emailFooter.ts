// The footer every email carries (ADR-0078): a Privacy Policy link and an Email preferences link, in the email's language.
// Optional emails (a person can switch them off) add an "Unsubscribe" link; always-sent emails add one line on why they
// are sent. Added in sendAndLog, so no email can leave without it. Web-standard APIs only.
import type { EmailKind } from './email.ts'

export type FooterLang = 'en' | 'pt'

/** The marker renderEmail leaves in the HTML where the footer goes; a custom HTML without it gets the footer before </body>. */
export const FOOTER_MARKER = '<!--sanctus-footer-->'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const COPY: Record<FooterLang, { privacy: string; preferences: string; unsubscribe: string; generic: string; reasons: Record<string, string> }> = {
  en: {
    privacy: 'Privacy Policy',
    preferences: 'Email preferences',
    unsubscribe: 'Unsubscribe',
    generic: 'You are getting this email because of your Sanctus account. It cannot be switched off.',
    reasons: {
      security: 'You are getting this email because it is about the security of your Sanctus account. It cannot be switched off.',
      invitation: 'You are getting this email because someone invited you to Sanctus. It cannot be switched off.',
      applicant: 'You are getting this email because you applied to Sanctus. It cannot be switched off.',
      admin: 'You are getting this email because you manage the Sanctus platform. It cannot be switched off.',
      inbox: 'You are getting this email because this address is the Sanctus notification inbox.',
      test: 'This is a test email from Sanctus.',
    },
  },
  pt: {
    privacy: 'Política de Privacidade',
    preferences: 'Preferências de e-mail',
    unsubscribe: 'Cancelar subscrição',
    generic: 'Recebe este e-mail por causa da sua conta Sanctus. Não pode ser desativado.',
    reasons: {
      security: 'Recebe este e-mail porque diz respeito à segurança da sua conta Sanctus. Não pode ser desativado.',
      invitation: 'Recebe este e-mail porque alguém o convidou para a Sanctus. Não pode ser desativado.',
      applicant: 'Recebe este e-mail porque se candidatou à Sanctus. Não pode ser desativado.',
      admin: 'Recebe este e-mail porque gere a plataforma Sanctus. Não pode ser desativado.',
      inbox: 'Recebe este e-mail porque este endereço é a caixa de notificações da Sanctus.',
      test: 'Este é um e-mail de teste da Sanctus.',
    },
  },
}

const REASON_OF_KIND: Partial<Record<EmailKind, string>> = {
  security_code: 'security',
  security_notice: 'security',
  owner_invitation: 'invitation',
  invitation_resend: 'invitation',
  team_invitation: 'invitation',
  application_confirmation: 'applicant',
  application_decision: 'applicant',
  closure_request: 'admin',
  team_notice: 'admin',
  admin_notification: 'inbox',
  test: 'test',
}

/** Where "Email preferences" goes: a page that opens the right settings for whoever is signed in (or asks them to sign in). */
export const EMAIL_PREFERENCES_PATH = '/email/preferences'
export const PRIVACY_PATH = '/privacy'

export interface FooterInput {
  kind: EmailKind
  lang: FooterLang
  /** APP_BASE_URL, without a trailing slash. */
  appBaseUrl: string
  /** Present for optional emails: the page link a person can open to unsubscribe from this type. */
  unsubscribeUrl?: string
}

export function emailFooter(i: FooterInput): { html: string; text: string } {
  const c = COPY[i.lang]
  const privacy = `${i.appBaseUrl}${PRIVACY_PATH}`
  const preferences = `${i.appBaseUrl}${EMAIL_PREFERENCES_PATH}`
  const style = 'color:#6E6559;text-decoration:underline'
  const links = [
    `<a href="${esc(privacy)}" style="${style}">${esc(c.privacy)}</a>`,
    `<a href="${esc(preferences)}" style="${style}">${esc(c.preferences)}</a>`,
    ...(i.unsubscribeUrl ? [`<a href="${esc(i.unsubscribeUrl)}" style="${style}">${esc(c.unsubscribe)}</a>`] : []),
  ]
  const reason = i.unsubscribeUrl ? '' : (c.reasons[REASON_OF_KIND[i.kind] ?? ''] ?? c.generic)
  const html = `<tr><td style="padding:20px 40px 32px;border-top:1px solid #D9D3C7;font:400 12px/1.6 Helvetica,Arial,sans-serif;color:#6E6559">${reason ? `<p style="margin:0 0 8px">${esc(reason)}</p>` : ''}<p style="margin:0">${links.join(' &middot; ')}</p></td></tr>`
  const text = [
    '--',
    ...(reason ? [reason] : []),
    `${c.privacy}: ${privacy}`,
    `${c.preferences}: ${preferences}`,
    ...(i.unsubscribeUrl ? [`${c.unsubscribe}: ${i.unsubscribeUrl}`] : []),
  ].join('\n')
  return { html, text }
}

/** Puts the footer into a rendered email: HTML at the marker (or before </body>), text at the end. */
export function withFooter(email: { html: string; text: string }, footer: { html: string; text: string }): { html: string; text: string } {
  const html = email.html.includes(FOOTER_MARKER)
    ? email.html.replace(FOOTER_MARKER, () => footer.html)
    : email.html.includes('</body>')
      ? email.html.replace('</body>', () => `<table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;width:100%">${footer.html}</table></td></tr></table></body>`)
      : `${email.html}${footer.html}`
  return { html, text: `${email.text}\n\n${footer.text}` }
}
