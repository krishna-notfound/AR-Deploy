import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { CustomAnswer } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { AuditTimeline, actorText } from './AuditTimeline'
import { EmailActivity } from './EmailActivity'
import { ExtraQuestionsCard } from './ExtraQuestionsCard'
import { ApplicationStatusBadge, applicationStatusLabel, emailKindLabel, emailReason, eventLabel, joinPlace, knownEmailReason, statusWord } from './labels'

const ANSWERS: CustomAnswer[] = [
  { id: 'a', type: 'short_text', label: { en: 'How did you hear about us?', pt: 'Como nos conheceu?' }, value: 'A friend' },
  { id: 'b', type: 'yes_no', label: { en: 'Do you ship abroad?' }, value: true },
  { id: 'c', type: 'multi_choice', label: { en: 'Materials', pt: 'Materiais' }, value: ['o1', 'o2'], valueLabels: [{ en: 'Wood', pt: 'Madeira' }, { en: 'Metal' }] },
  { id: 'd', type: 'single_choice', label: { en: 'Main material' }, value: 'o1', valueLabels: [{ en: 'Wood', pt: 'Madeira' }] },
]

function inLang(lang: 'en' | 'pt', ui: React.ReactElement) {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </LanguageProvider>,
  )
}

describe('ExtraQuestionsCard', () => {
  it('lists each snapshot label and answer: yes/no as Yes or No, choices by their option labels', () => {
    inLang('en', <ExtraQuestionsCard custom={ANSWERS} />)
    expect(screen.getByRole('heading', { name: 'Extra questions' })).toBeInTheDocument()
    const answer = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement
    expect(answer('How did you hear about us?')).toHaveTextContent('A friend')
    expect(answer('Do you ship abroad?')).toHaveTextContent('Yes')
    expect(answer('Materials')).toHaveTextContent('Wood, Metal')
    expect(answer('Main material')).toHaveTextContent('Wood')
  })

  it('shows Portuguese where the snapshot has it and English where it does not', () => {
    inLang('pt', <ExtraQuestionsCard custom={ANSWERS} />)
    expect(screen.getByRole('heading', { name: 'Perguntas adicionais' })).toBeInTheDocument()
    expect(screen.getByText('Como nos conheceu?')).toBeInTheDocument()
    expect(screen.getByText('Do you ship abroad?').nextElementSibling).toHaveTextContent('Sim')
    expect(screen.getByText('Materiais').nextElementSibling).toHaveTextContent('Madeira, Metal')
  })

  it('renders nothing for an application without extra answers', () => {
    const { container } = inLang('en', <ExtraQuestionsCard custom={undefined} />)
    expect(container).toBeEmptyDOMElement()
    const empty = inLang('en', <ExtraQuestionsCard custom={[]} />)
    expect(empty.container).toBeEmptyDOMElement()
  })
})

describe('joinPlace', () => {
  it('joins only the parts that are present, with no stray comma', () => {
    expect(joinPlace('Porto', 'Portugal')).toBe('Porto, Portugal')
    expect(joinPlace(undefined, 'Portugal')).toBe('Portugal')
    expect(joinPlace('Porto', null)).toBe('Porto')
    expect(joinPlace('', '  ')).toBe('')
    expect(joinPlace(undefined, undefined, 'furniture')).toBe('furniture')
  })
})

describe('labels in two languages', () => {
  it('keep the English words by default and translate when given the language', () => {
    expect(applicationStatusLabel('under_review')).toBe('Under review')
    expect(applicationStatusLabel('under_review', 'pt')).toBe('Em análise')
    expect(statusWord('approved', 'pt')).toBe('Aprovada')
    expect(statusWord('unknown_status', 'pt')).toBe('unknown_status')
    expect(eventLabel('application_submitted', undefined, 'pt')).toBe('Candidatura submetida')
    expect(eventLabel('business_own_models_changed', { to: true }, 'pt')).toBe('Modelos 3D próprios permitidos')
    expect(eventLabel('some_new_event', undefined, 'pt')).toBe('some new event')
    expect(emailKindLabel('security_code', 'pt')).toBe('Código de segurança')
    expect(emailKindLabel('something_else', 'pt')).toBe('something_else')
    expect(knownEmailReason('demo_mode', 'pt')).toBe('Modo de demonstração: não é enviado nenhum email.')
    expect(emailReason('Provider said no', 'pt')).toBe('Provider said no')
    expect(actorText({ id: '1', createdAt: '', eventType: 'x', metadata: {} }, 'pt')).toBe('Sistema')
  })

  it('the status badge reads the language of the app', () => {
    inLang('pt', <ApplicationStatusBadge status="rejected" />)
    expect(screen.getByText('Recusada')).toBeInTheDocument()
  })
})

describe('history and email activity in Portuguese', () => {
  it('AuditTimeline: title, event, status words, date and actor', async () => {
    vi.spyOn(service, 'getAuditEvents').mockResolvedValue(
      ok({ items: [{ id: 'e1', createdAt: '2026-10-25T10:00:00Z', eventType: 'application_status_changed', fromStatus: 'submitted', toStatus: 'approved', metadata: { reason: 'Boa' } }], total: 1 }),
    )
    inLang('pt', <AuditTimeline applicationId="app-1" />)
    expect(await screen.findByText('Estado alterado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeInTheDocument()
    expect(screen.getByText(/Submetida → Aprovada/)).toBeInTheDocument()
    expect(screen.getByText(/· Sistema$/)).toBeInTheDocument()
    expect(screen.getByText('Motivo: Boa')).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('AuditTimeline: the empty state is translated', async () => {
    vi.spyOn(service, 'getAuditEvents').mockResolvedValue(ok({ items: [], total: 0 }))
    inLang('pt', <AuditTimeline applicationId="app-1" />)
    expect(await screen.findByText('Ainda sem histórico')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('EmailActivity: title, kind, status, reason and recipient', async () => {
    vi.spyOn(service, 'getEmailAttempts').mockResolvedValue(
      ok([{ id: 'm1', kind: 'application_confirmation', recipient: 'ana@x.test', status: 'blocked', attempt: 2, createdAt: '2026-10-25T10:00:00Z', error: 'demo_mode' }] as never),
    )
    inLang('pt', <EmailActivity applicationId="app-1" />)
    expect(await screen.findByText('Confirmação da candidatura')).toBeInTheDocument()
    const region = screen.getByText('Confirmação da candidatura').closest('li')!
    expect(within(region).getByText('Não enviado')).toBeInTheDocument()
    expect(within(region).getByText('tentativa 2')).toBeInTheDocument()
    expect(within(region).getByText(/Para ana@x\.test/)).toBeInTheDocument()
    expect(within(region).getByText('Modo de demonstração: não é enviado nenhum email.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Atividade de email' })).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
