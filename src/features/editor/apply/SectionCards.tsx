import { ArrowDown, ArrowUp, ChevronDown, LayoutList, Lock, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { MAX_APPLY_STEPS, MAX_STEP_HINT, MAX_STEP_TITLE, type ResolvedStep } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { editorPreviewPath } from '@/lib/urls'
import { LangField, LockNote, useBuilder, useCards, useLangError } from './builderParts'
import { addStep, canDeleteStep, deleteStep, moveStep, setStepText } from './formOps'
import { QuestionCard } from './QuestionCard'
import { TextOverride, originalName, stepTitleOf } from './TextOverride'
import { groupKeys } from './textGroups'

const CARD = 'rounded-[var(--radius-card)] border border-line bg-surface'

/** The first card: the page title and the texts around it, edited in place. */
export function HeaderCard() {
  const { t } = useI18n()
  return (
    <section aria-label={t('applications.builder.headerCard')} data-card="header" className={cn(CARD, 'scroll-mt-24 border-t-4 border-t-ink p-4 sm:p-5')}>
      <div className="space-y-2">
        <TextOverride textKey="apply.eyebrow" variant="inline" title={t('applications.builder.headerEyebrow')} />
        <TextOverride textKey="apply.title" variant="inline" size="title" focusMark title={t('applications.builder.headerTitle')} />
        <TextOverride textKey="apply.intro" variant="inline" multiline title={t('applications.builder.headerIntro')} />
      </div>
    </section>
  )
}

/**
 * One section of the form: its title and description edited in place, a menu to move, add after and delete it, and its
 * question cards. The Review section is last and fixed: its consent and terms rows are always asked.
 */
export function SectionCard({ step, n, total, sections }: { step: ResolvedStep; n: number; total: number; sections: { step: ResolvedStep; n: number }[] }) {
  const { t, lang: appLang } = useI18n()
  const { config, onChange, lang, openKey, setOpenKey } = useBuilder()
  const cards = useCards()
  const confirm = useConfirm()
  const langError = useLangError()
  const isReview = step.builtin === 'review'
  const idx = config.steps.findIndex((s) => s.id === step.id)
  const own = config.steps[idx]
  const atLimit = config.steps.length >= MAX_APPLY_STEPS
  const canDelete = canDeleteStep(config, step.id)
  const title = stepTitleOf(step, appLang)
  const drag = cards.drag
  const dropHere = drag?.stepId === step.id

  const addBelow = () => {
    const r = addStep(config, t('applications.builder.newSection'), step.id)
    if (!r.id) return
    onChange(r.config)
    cards.focusCard(`step:${r.id}`, { select: true })
  }
  const remove = async () => {
    const ok = await confirm({
      title: t('applications.builder.sectionDeleteTitle', { n }),
      body: t(idx === 0 ? 'applications.builder.sectionDeleteBodyFirst' : 'applications.builder.sectionDeleteBody'),
      confirmLabel: t('applications.builder.sectionDelete'),
      destructive: true,
    })
    if (!ok) return
    if (openKey && step.fields.some((f) => f.key === openKey)) setOpenKey(null)
    onChange(deleteStep(config, step.id))
  }
  const shift = (dir: -1 | 1) => {
    const next = moveStep(config, step.id, dir)
    if (next === config) return
    onChange(next)
    cards.announceSection(n + dir, total)
    cards.focusCard(`step:${step.id}`)
  }

  const items: (MenuItem | 'separator')[] = [
    { label: t('applications.builder.sectionUp'), icon: <ArrowUp />, disabled: n === 1, onSelect: () => shift(-1) },
    { label: t('applications.builder.sectionDown'), icon: <ArrowDown />, disabled: n >= total - 1, onSelect: () => shift(1) },
    'separator',
    // A short answer to start with: the card opens, and its kind can be changed there.
    { label: t('applications.builder.sectionAddQuestion'), icon: <Plus />, disabled: cards.questionsFull, onSelect: () => cards.addQuestionIn(step.id, 'short_text') },
    { label: atLimit ? t('applications.builder.sectionAddFull', { max: MAX_APPLY_STEPS }) : t('applications.builder.sectionAddBelow'), icon: <LayoutList />, disabled: atLimit, onSelect: addBelow },
    { label: canDelete ? t('applications.builder.sectionDelete') : t('applications.builder.sectionDeleteLast'), icon: <Trash2 />, destructive: true, disabled: !canDelete, onSelect: () => void remove() },
  ]

  // The line that shows where a dragged card will land, among the cards that stay put.
  let slot = 0
  const rows = step.fields.flatMap((f, at) => {
    const out: ReactElement[] = []
    const isDragged = drag?.key === f.key
    if (dropHere && !isDragged && slot === drag.index) out.push(<DropLine key="drop" />)
    out.push(<QuestionCard key={f.key} field={f} first={at === 0} last={at === step.fields.length - 1} step={step} sections={sections} />)
    if (!isDragged) slot++
    return out
  })
  if (dropHere && slot <= drag.index) rows.push(<DropLine key="drop" />)

  return (
    <section aria-label={t('applications.builder.sectionAria', { n, title })} data-step-zone={isReview ? undefined : step.id} data-card={`step:${step.id}`} className="scroll-mt-24 space-y-3">
      <div className={cn(CARD, 'border-t-4 border-t-accent p-4 sm:p-5')}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-ui-small font-medium text-ink-muted">{t('applications.builder.sectionOf', { n, total })}</p>
          {isReview ? (
            <Badge tone="neutral">
              <Lock className="mr-1 inline size-3" aria-hidden />
              {t('applications.builder.alwaysLast')}
            </Badge>
          ) : (
            <DropdownMenu label={t('applications.builder.sectionMenu', { n })} trigger={<MoreVertical className="size-4" aria-hidden />} items={items} triggerClassName="-my-1 -mr-1 pointer-coarse:size-11" />
          )}
        </div>
        <div className="mt-1 space-y-1">
          <LangField
            name={t('applications.builder.sectionTitle', { n })}
            lang={lang}
            size="title"
            focusMark
            value={own?.title?.[lang] ?? ''}
            placeholder={step.builtin ? originalName(`apply.step.${step.builtin}`, lang, MAX_STEP_TITLE) : lang === 'pt' && own?.title?.en ? own.title.en : t('applications.builder.sectionTitlePlaceholder')}
            onChange={(text) => onChange(setStepText(config, step.id, 'title', lang, text))}
            error={langError(`steps.${idx}.title`)}
            maxLength={MAX_STEP_TITLE}
          />
          <LangField
            name={t('applications.builder.sectionHint', { n })}
            lang={lang}
            value={own?.hint?.[lang] ?? ''}
            placeholder={step.builtin ? originalName(`apply.step.${step.builtin}.hint`, lang, MAX_STEP_HINT) : lang === 'pt' && own?.hint?.en ? own.hint.en : t('applications.builder.sectionHintPlaceholder')}
            onChange={(text) => onChange(setStepText(config, step.id, 'hint', lang, text))}
            error={langError(`steps.${idx}.hint`)}
            maxLength={MAX_STEP_HINT}
          />
        </div>
      </div>

      {isReview ? (
        <ReviewRows />
      ) : step.fields.length === 0 ? (
        <div className={cn('space-y-3 rounded-[var(--radius-card)] border border-dashed p-4 text-ui-body text-ink-muted', dropHere ? 'border-accent bg-accent-soft' : 'border-line-strong')}>
          <p>{t('applications.builder.emptySection')}</p>
          <DropdownMenu
            label={t('applications.builder.addQuestionTo', { n })}
            align="start"
            triggerClassName="w-auto! h-11! gap-2 border border-line-strong bg-surface px-3! text-ui-body font-medium text-ink hover:border-ink"
            trigger={
              <>
                <Plus className="size-4" aria-hidden />
                <span aria-hidden>{t('applications.builder.addQuestion')}</span>
              </>
            }
            items={cards.questionMenu(step.id)}
          />
        </div>
      ) : (
        <ul className="space-y-3">{rows}</ul>
      )}
    </section>
  )
}

function DropLine() {
  return <li aria-hidden className="-my-1 h-1 rounded-full bg-accent" />
}

/** The consent and terms rows: always asked, so only the consent sentence can be reworded. */
function ReviewRows() {
  const { t } = useI18n()
  return (
    <div data-card="review" className={cn(CARD, 'scroll-mt-24 divide-y divide-line')}>
      <div className="space-y-2 p-4 sm:p-5">
        <TextOverride textKey="apply.f.consent" variant="inline" multiline title={t('applications.builder.consentText')} />
        <LockNote className="px-1">{t('applications.builder.legalReason')}</LockNote>
      </div>
      <div className="space-y-1 p-4 sm:p-5">
        <p className="px-1 text-ui-body text-ink">{t('applications.builder.termsRow')}</p>
        <LockNote className="px-1">{t('applications.builder.legalReason')}</LockNote>
      </div>
    </div>
  )
}

const THANKS_SHOWN = 2

/** The thank-you texts, plus the link to preview that screen. */
export function AfterCard() {
  const { t } = useI18n()
  const [more, setMore] = useState(false)
  const keys = groupKeys('thanks')
  const lead = keys.slice(0, THANKS_SHOWN)
  const rest = keys.slice(THANKS_SHOWN)
  return (
    <section aria-label={t('applications.builder.afterCard')} data-card="after" className={cn(CARD, 'scroll-mt-24 space-y-3 border-t-4 border-t-accent p-4 sm:p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[1.5rem] leading-tight text-ink">{t('applications.builder.afterCard')}</h2>
          <p className="mt-1 text-ui-body text-ink-muted">{t('applications.builder.afterNote')}</p>
        </div>
        <Link to={editorPreviewPath('apply/done')} className="inline-flex min-h-8 items-center text-ui-small text-accent-ink hover:underline pointer-coarse:min-h-11">
          {t('applications.builder.previewThanks')}
        </Link>
      </div>
      <div className="space-y-2">
        {lead.map((k, i) => (
          <TextOverride key={k} textKey={k} variant="inline" multiline={i > 0} size={i === 0 ? 'question' : 'plain'} />
        ))}
      </div>
      {rest.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] text-ui-body font-medium text-ink hover:text-accent-ink pointer-coarse:min-h-11"
          >
            <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} aria-hidden />
            {more ? t('applications.builder.afterLess') : t('applications.builder.afterMore', { n: rest.length })}
          </button>
          {more && (
            <div className="mt-3 space-y-5 border-t border-line pt-4">
              {rest.map((k) => (
                <TextOverride key={k} textKey={k} multiline />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
