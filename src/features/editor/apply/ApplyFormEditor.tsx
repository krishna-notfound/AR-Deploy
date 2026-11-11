import { Eye } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import { type ApplyFormConfig, type Lang, MAX_APPLY_STEPS, MAX_CUSTOM_QUESTIONS, type SiteContent, validateApplyForm } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { ApplyForm } from '../../apply/ApplyForm'
import { BuilderContext, type BuilderContextValue, type FocusRequest } from './builderParts'
import { FormCards } from './FormCards'
import { type Problem, problemsOf } from './problems'

/**
 * The application form builder screen (/admin/editor/apply): the form as cards you edit in place, like Google Forms. The Editor
 * shell owns autosave, publish and history; the builder only edits `draft.applyForm` and hands the whole next document back
 * through `onChange`.
 */
export interface ApplyFormEditorProps {
  draft: SiteContent
  onChange: (next: SiteContent) => void
}

const SHOWN_PROBLEMS = 5

export function ApplyFormEditor({ draft, onChange }: ApplyFormEditorProps) {
  const { t, lang: appLang } = useI18n()
  const [params] = useSearchParams()
  const config = draft.applyForm
  const errors = useMemo(() => validateApplyForm(config), [config])
  const problems = useMemo(() => problemsOf(config, errors, t, appLang), [config, errors, t, appLang])
  const problemCount = problems.length
  const [lang, setLang] = useState<Lang>(appLang)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(params.get('tab') === 'messages')
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(() => (params.get('tab') === 'messages' ? { card: 'panel', select: false, nonce: 1 } : null))

  // An old link to the Messages tab (?tab=messages) opens the "Button & message texts" panel and scrolls to it.
  const tab = params.get('tab')
  const [seenTab, setSeenTab] = useState(tab)
  if (tab !== seenTab) {
    setSeenTab(tab)
    if (tab === 'messages') {
      setPanelOpen(true)
      setFocusRequest((r) => ({ card: 'panel', select: false, nonce: (r?.nonce ?? 0) + 1 }))
    }
  }

  const requestFocus = useCallback((card: string, opts?: { select?: boolean }) => setFocusRequest((r) => ({ card, select: !!opts?.select, nonce: (r?.nonce ?? 0) + 1 })), [])

  const update = (next: ApplyFormConfig) => {
    if (next !== config) onChange({ ...draft, applyForm: next })
  }

  const goTo = (p: Problem) => {
    if (p.lang) setLang(p.lang)
    if (p.card.startsWith('field:')) setOpenKey(p.card.slice(6))
    if (p.card === 'panel') setPanelOpen(true)
    requestFocus(p.card)
  }

  const ctx: BuilderContextValue = { config, onChange: update, errors, lang, setLang, openKey, setOpenKey, requestFocus }

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="public-soft space-y-4 pb-28 xl:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-ui-small font-medium text-ink-muted">{t('applications.builder.typingIn')}</span>
              <SegmentedControl<Lang>
                label={t('applications.builder.typingLang')}
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'en', label: 'EN' },
                  { value: 'pt', label: 'PT' },
                ]}
              />
            </div>
            <p className="text-ui-small text-ink-muted">{t('applications.builder.usage', { s: config.steps.length, maxS: MAX_APPLY_STEPS, q: config.customQuestions.length, maxQ: MAX_CUSTOM_QUESTIONS })}</p>
          </div>
          <Button icon={<Eye className="size-4" aria-hidden />} onClick={() => setPreviewOpen(true)}>
            {t('applications.builder.previewForm')}
          </Button>
        </div>

        {problemCount > 0 && (
          <InlineNotice tone="warning">
            <div role="alert" className="space-y-1.5">
              <p>{t('applications.builder.problems', { n: problemCount })}</p>
              <ul className="space-y-0.5">
                {problems.slice(0, SHOWN_PROBLEMS).map((p) => (
                  <li key={`${p.card}${p.textKey ?? ''}`}>
                    <button type="button" onClick={() => goTo(p)} className="inline-flex min-h-6 items-center rounded-[var(--radius-control)] text-left font-medium underline underline-offset-2 hover:text-ink pointer-coarse:min-h-11">
                      {t('applications.builder.problemItem', { where: p.where, message: p.message })}
                    </button>
                  </li>
                ))}
              </ul>
              {problems.length > SHOWN_PROBLEMS && <p>{t('applications.builder.problemMore', { n: problems.length - SHOWN_PROBLEMS })}</p>}
            </div>
          </InlineNotice>
        )}

        {/* The cards: one centred column, wide enough for the add bar that floats to the right of the open card. */}
        <div className="mx-auto w-full max-w-[760px] xl:max-w-[calc(760px+4.5rem)] xl:pr-[4.5rem]">
          <FormCards panelOpen={panelOpen} onPanelToggle={() => setPanelOpen((o) => !o)} focusRequest={focusRequest} />
        </div>

        <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t('applications.builder.preview')} size="lg" closeLabel={t('common.close')}>
          <BuilderPreview config={config} initialLang={lang} />
        </Modal>
      </div>
    </BuilderContext.Provider>
  )
}

/** The real application form with the draft: nothing is sent, nothing is stored, and the language and width can be switched. */
function BuilderPreview({ config, initialLang }: { config: ApplyFormConfig; initialLang: Lang }) {
  const { t } = useI18n()
  const [lang, setLang] = useState<Lang>(initialLang)
  const [phone, setPhone] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ui-small text-ink-muted">{t('applications.builder.previewNote')}</p>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl<Lang>
            size="sm"
            label={t('applications.builder.previewLang')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'pt', label: 'PT' },
            ]}
          />
          <SegmentedControl<'desktop' | 'phone'>
            size="sm"
            label={t('applications.builder.previewWidth')}
            value={phone ? 'phone' : 'desktop'}
            onChange={(v) => setPhone(v === 'phone')}
            options={[
              { value: 'desktop', label: t('applications.builder.desktop') },
              { value: 'phone', label: t('applications.builder.phone') },
            ]}
          />
        </div>
      </div>
      {/* The public form, in its own look: outside the dashboard styling, and light even when the dashboard is dark. */}
      <DashboardContext.Provider value={null}>
        <div data-surface="public" data-theme="light" data-testid="builder-preview" style={{ fontFamily: 'var(--font-sans)' }} className={cn('max-h-[70vh] overflow-y-auto border border-line bg-surface p-5 text-ink-body', phone && 'mx-auto max-w-[390px]')}>
          <ApplyForm config={config} preview lang={lang} />
        </div>
      </DashboardContext.Provider>
    </div>
  )
}
