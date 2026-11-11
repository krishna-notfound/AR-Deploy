import { ArrowDown, ArrowUp, ChevronDown, Circle, Copy, CornerDownRight, Eye, EyeOff, GripVertical, Lock, MoreVertical, Plus, RotateCcw, Square, Trash2, Upload } from 'lucide-react'
import { type KeyboardEvent, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Switch } from '@/components/ui/Form'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import {
  type ApplyBuiltinField,
  type ApplyChoiceField,
  type CustomQuestion,
  type CustomQuestionType,
  MAX_CHOICE_OPTIONS,
  MAX_CUSTOM_QUESTIONS,
  MAX_OPTION_LABEL,
  MAX_QUESTION_HELP,
  MAX_QUESTION_LABEL,
  MIN_CHOICE_OPTIONS,
  type ResolvedField,
  type ResolvedStep,
} from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { cn } from '@/lib/cn'
import { BUILTIN_FIELDS } from '../../../../supabase/functions/_shared/applyForm.ts'
import { LangField, LockNote, useBuilder, useCards, useErrorText, useLangError, withLang } from './builderParts'
import { addOption, deleteQuestion, duplicateQuestion, isChoiceQuestion, moveOption, removeOption, resetText, setHidden, setOptionHidden, setRequired, updateQuestion, visibleOptionCount } from './formOps'
import { BUILTIN_SHAPE, KindIcon, QUESTION_KINDS, kindLabelKey } from './kinds'
import { TextOverride, originalName, stepTitleOf } from './TextOverride'
import { fieldTextKeys, optionTextKey } from './textGroups'

/** One question of the form as a card: closed it looks like the form; click or Enter opens it in place. */
export function QuestionCard({ field, first, last, step, sections }: { field: ResolvedField; first: boolean; last: boolean; step: ResolvedStep; sections: { step: ResolvedStep; n: number }[] }) {
  const { t, lang: appLang } = useI18n()
  const { config, onChange, errors, lang, openKey, setOpenKey } = useBuilder()
  const cards = useCards()
  const errorText = useErrorText()
  const q = field.question
  const key = field.key
  const open = openKey === key
  const builtin = q ? null : (key as ApplyBuiltinField)
  const keys = builtin ? fieldTextKeys(builtin) : null
  const qi = q ? config.customQuestions.findIndex((x) => x.id === q.id) : -1
  const dragging = cards.drag?.key === key

  const name = q
    ? q.label[lang] || q.label.en || t('applications.builder.untitledQuestion')
    : config.texts[`apply.f.${key}`]?.[lang] || translate(lang, `apply.f.${key}` as TranslationKey)
  const description = q ? q.help?.[lang] || q.help?.en : keys?.hint ? config.texts[keys.hint]?.[lang] || translate(lang, keys.hint as TranslationKey).replace(/\{(\w+)\}/g, '0') : undefined

  // The first problem that belongs to this card (a question's own fields, or the wording and options of a standard one).
  const problem = useMemo(() => {
    const placed = config.fields.findIndex((f) => f.key === key)
    const exact: string[] = q ? [`customQuestions.${qi}`] : [`hiddenOptions.${key}`]
    const prefixes: string[] = q ? [`customQuestions.${qi}.`] : [`fields.${placed}.`]
    if (builtin && keys) {
      const textKeys = [keys.label, ...(keys.hint ? [keys.hint] : []), ...(keys.extra ? [keys.extra] : []), ...(BUILTIN_FIELDS[builtin].options ?? []).map((v) => optionTextKey(builtin as ApplyChoiceField, v))]
      for (const k of textKeys) prefixes.push(`texts.${k}.`)
    }
    return Object.keys(errors).find((p) => exact.includes(p) || prefixes.some((pre) => p.startsWith(pre)))
  }, [errors, config.fields, key, q, qi, builtin, keys])

  const openCard = () => {
    setOpenKey(key)
    cards.focusCard(`field:${key}`)
  }
  const closeCard = () => {
    setOpenKey(null)
    cards.focusCard(`field:${key}`)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      e.stopPropagation()
      closeCard()
    }
  }

  const menuItems: (MenuItem | 'separator')[] = [
    { label: t('applications.builder.menuMoveUp'), icon: <ArrowUp />, disabled: first, onSelect: () => cards.move(key, 'up') },
    { label: t('applications.builder.menuMoveDown'), icon: <ArrowDown />, disabled: last, onSelect: () => cards.move(key, 'down') },
    ...(sections.some((s) => s.step.id !== step.id)
      ? [
          'separator' as const,
          ...sections
            .filter((s) => s.step.id !== step.id)
            .map((s): MenuItem => ({ label: t('applications.builder.moveToSection', { n: s.n, title: stepTitleOf(s.step, appLang, 28) }), icon: <CornerDownRight />, onSelect: () => cards.moveTo(key, s.step.id) })),
        ]
      : []),
  ]

  const requiredBadge = field.hidden ? (
    <Badge tone="neutral">{t('applications.builder.hidden')}</Badge>
  ) : field.required ? (
    <Badge tone="accent">{t('applications.builder.required')}</Badge>
  ) : (
    <Badge tone="neutral">{t('common.optional')}</Badge>
  )

  return (
    <li
      data-row={key}
      data-card={`field:${key}`}
      style={dragging ? { transform: `translateY(${cards.drag!.dy}px)` } : undefined}
      onKeyDown={onKeyDown}
      className={cn(
        'relative scroll-mt-24 rounded-[var(--radius-card)] border bg-surface transition-[border-color,box-shadow]',
        open ? 'border-accent shadow-[var(--shadow-card)]' : 'border-line hover:border-line-strong',
        open && 'border-l-4',
        problem && !open && 'border-danger',
        field.hidden && !open && 'bg-subtle/60',
        dragging && 'pointer-events-none z-30 shadow-[var(--shadow-pop)]',
      )}
    >
      <div className="flex items-start gap-1 p-2 sm:p-3">
        <button
          type="button"
          data-handle
          aria-label={t('applications.builder.dragHandle', { name })}
          onPointerDown={(e) => cards.startDrag(e, key)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              cards.move(key, e.key === 'ArrowUp' ? 'up' : 'down')
            }
          }}
          className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-[var(--radius-control)] text-ink-faint hover:bg-subtle hover:text-ink active:cursor-grabbing pointer-coarse:size-11 max-sm:size-11"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>

        <div className="min-w-0 flex-1 py-1">
          {open ? (
            q ? (
              <OwnQuestionBody q={q} qi={qi} required={field.required} onClose={closeCard} />
            ) : (
              <StandardBody k={builtin!} field={field} name={name} />
            )
          ) : (
            <button type="button" data-autofocus aria-expanded={false} aria-label={t('applications.builder.editField', { name })} onClick={openCard} className="block w-full rounded-[var(--radius-control)] text-left">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-ui-card font-medium text-ink [overflow-wrap:anywhere]', field.hidden && 'text-ink-muted')}>{name}</span>
                {field.locked && <LockedMark />}
                {builtin && <Badge tone="neutral">{t('applications.builder.standard')}</Badge>}
                {requiredBadge}
              </span>
              {description && <span className="mt-0.5 block text-ui-small text-ink-muted [overflow-wrap:anywhere]">{description}</span>}
              <span className={cn('block', field.hidden && 'opacity-60')}>
                <FieldSketch field={field} />
              </span>
            </button>
          )}
          {!open && problem && <p className="mt-2 text-ui-small text-danger">{errorText(errors, problem)}</p>}
          {!open && field.locked && <LockNote className="mt-2">{t('applications.builder.lockedReason')}</LockNote>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {field.hidden && !open && (
            <Button size="sm" icon={<Eye className="size-4" aria-hidden />} aria-label={t('applications.builder.showField', { name })} onClick={() => onChange(setHidden(config, key, false))}>
              {t('applications.builder.show')}
            </Button>
          )}
          <DropdownMenu label={t('applications.builder.actionsFor', { name })} trigger={<MoreVertical className="size-4" aria-hidden />} items={menuItems} triggerClassName="pointer-coarse:size-11" />
        </div>
      </div>
      {open && cards.addBar}
    </li>
  )
}

function LockedMark() {
  const { t } = useI18n()
  return <Lock className="size-3.5 shrink-0 text-ink-muted" role="img" aria-label={t('applications.builder.locked')} />
}

/** The closed card's picture of the answer area: a line, a box, the options or the upload. */
function FieldSketch({ field }: { field: ResolvedField }) {
  const { t } = useI18n()
  const { config, lang } = useBuilder()
  const q = field.question
  const line = <span aria-hidden className="mt-2 block h-8 w-full max-w-sm rounded-[var(--radius-control)] border border-line bg-subtle/50" />
  const optionRows = (labels: string[], square: boolean) => {
    const Mark = square ? Square : Circle
    const shown = labels.slice(0, 4)
    return (
      <span className="mt-2 flex flex-col gap-1">
        {shown.map((l, i) => (
          <span key={i} className="flex items-center gap-2 text-ui-small text-ink-body">
            <Mark className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
            <span className="[overflow-wrap:anywhere]">{l}</span>
          </span>
        ))}
        {labels.length > shown.length && <span className="pl-5 text-ui-small text-ink-muted">{t('applications.builder.moreOptions', { n: labels.length - shown.length })}</span>}
      </span>
    )
  }
  if (q) {
    const sketch =
      q.type === 'short_text' ? line : q.type === 'long_text' ? <span aria-hidden className="mt-2 block h-16 w-full max-w-sm rounded-[var(--radius-control)] border border-line bg-subtle/50" /> : q.type === 'yes_no' ? optionRows([t('common.yes'), t('common.no')], false) : optionRows((q.options ?? []).map((o, i) => o.label[lang] || o.label.en || t('applications.builder.optionPlaceholder', { n: i + 1 })), q.type === 'multi_choice')
    return (
      <>
        <span className="mt-1 flex items-center gap-1.5 text-ui-small text-ink-muted">
          <KindIcon type={q.type} className="size-3.5" />
          {t(kindLabelKey(q.type))}
        </span>
        {sketch}
      </>
    )
  }
  const k = field.key as ApplyBuiltinField
  const shape = BUILTIN_SHAPE[k] ?? 'short'
  if (shape === 'short') return line
  if (shape === 'long') return <span aria-hidden className="mt-2 block h-16 w-full max-w-sm rounded-[var(--radius-control)] border border-line bg-subtle/50" />
  if (shape === 'file')
    return (
      <span className="mt-2 flex max-w-sm items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2 text-ui-small text-ink-muted">
        <Upload className="size-4 shrink-0" aria-hidden />
        {t('applications.builder.fileSketch')}
      </span>
    )
  if (shape === 'language') return optionRows(['English', 'Português'], false)
  const choice = k as ApplyChoiceField
  const labels = (BUILTIN_FIELDS[choice].options ?? []).filter((v) => !config.hiddenOptions[choice]?.includes(v)).map((v) => config.texts[optionTextKey(choice, v)]?.[lang] || translate(lang, optionTextKey(choice, v) as TranslationKey))
  return optionRows(labels, false)
}

function OwnQuestionBody({ q, qi, required, onClose }: { q: CustomQuestion; qi: number; required: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { config, onChange, lang, setOpenKey } = useBuilder()
  const cards = useCards()
  const confirm = useConfirm()
  const langError = useLangError()
  const errorText = useErrorText()
  const { errors } = useBuilder()
  const at = `customQuestions.${qi}`
  const full = config.customQuestions.length >= MAX_CUSTOM_QUESTIONS
  const choice = isChoiceQuestion(q.type)
  const set = (patch: Parameters<typeof updateQuestion>[2]) => onChange(updateQuestion(config, q.id, patch))

  const duplicate = () => {
    const r = duplicateQuestion(config, q.id, { en: ` ${translate('en', 'applications.builder.copySuffix')}`, pt: ` ${translate('pt', 'applications.builder.copySuffix')}` })
    if (!r.id) return
    onChange(r.config)
    setOpenKey(`custom:${r.id}`)
    cards.focusCard(`field:custom:${r.id}`, { select: true })
  }
  const remove = async () => {
    const ok = await confirm({
      title: t('applications.builder.deleteQuestionTitle'),
      body: t('applications.builder.deleteQuestionBody'),
      confirmLabel: t('applications.builder.deleteQuestionConfirm'),
      destructive: true,
    })
    if (!ok) return
    onChange(deleteQuestion(config, q.id))
    setOpenKey(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[12rem] flex-1">
          <LangField
            name={t('applications.builder.questionLabel')}
            lang={lang}
            size="question"
            focusMark
            value={q.label[lang] ?? ''}
            placeholder={lang === 'pt' ? q.label.en : t('applications.builder.questionPlaceholder')}
            onChange={(text) => set({ label: withLang(q.label, lang, text) })}
            error={langError(`${at}.label`)}
            maxLength={MAX_QUESTION_LABEL}
          />
        </div>
        <DropdownMenu
          label={t('applications.builder.kindCurrent', { kind: t(kindLabelKey(q.type)) })}
          align="end"
          triggerClassName="w-auto! h-10! gap-2 border border-line-strong bg-surface px-3! text-ui-body text-ink pointer-coarse:h-11!"
          trigger={
            <>
              <KindIcon type={q.type} className="size-4 text-ink-muted" />
              <span>{t(kindLabelKey(q.type))}</span>
              <ChevronDown className="size-4 text-ink-muted" aria-hidden />
            </>
          }
          items={QUESTION_KINDS.map((k): MenuItem => {
            const Icon = k.icon
            return { label: t(kindLabelKey(k.type)), icon: <Icon />, onSelect: () => set({ type: k.type as CustomQuestionType }) }
          })}
        />
      </div>
      <LangField
        name={t('applications.builder.descriptionLabel')}
        lang={lang}
        value={q.help?.[lang] ?? ''}
        placeholder={lang === 'pt' && q.help?.en ? q.help.en : t('applications.builder.descriptionPlaceholder')}
        onChange={(text) => set({ help: withLang(q.help ?? { en: '' }, lang, text) })}
        error={langError(`${at}.help`)}
        maxLength={MAX_QUESTION_HELP}
      />
      {choice && (
        <div className="space-y-2" role="group" aria-label={t('applications.builder.options')}>
          {errorText(errors, `${at}.options`) && <p className="text-ui-small text-danger">{errorText(errors, `${at}.options`)}</p>}
          {(q.options ?? []).map((o, j) => (
            <div key={o.id} className="flex flex-wrap items-start gap-1">
              <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center text-ink-faint" aria-hidden>
                {q.type === 'multi_choice' ? <Square className="size-3.5" /> : <Circle className="size-3.5" />}
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <LangField
                  name={t('applications.builder.optionN', { n: j + 1 })}
                  lang={lang}
                  value={o.label[lang] ?? ''}
                  placeholder={lang === 'pt' ? o.label.en : t('applications.builder.optionPlaceholder', { n: j + 1 })}
                  onChange={(text) => set({ options: (q.options ?? []).map((x) => (x.id === o.id ? { ...x, label: withLang(x.label, lang, text) } : x)) })}
                  error={langError(`${at}.options.${j}.label`)}
                  maxLength={MAX_OPTION_LABEL}
                />
              </div>
              <div className="ml-auto flex shrink-0">
                <IconButton aria-label={t('applications.builder.optionUp', { n: j + 1 })} size="sm" disabled={j === 0} onClick={() => onChange(moveOption(config, q.id, o.id, -1))}>
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton aria-label={t('applications.builder.optionDown', { n: j + 1 })} size="sm" disabled={j === (q.options?.length ?? 0) - 1} onClick={() => onChange(moveOption(config, q.id, o.id, 1))}>
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton aria-label={t('applications.builder.optionRemove', { n: j + 1 })} size="sm" disabled={(q.options?.length ?? 0) <= MIN_CHOICE_OPTIONS} onClick={() => onChange(removeOption(config, q.id, o.id))}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pl-6">
            <Button size="sm" icon={<Plus className="size-4" aria-hidden />} disabled={(q.options?.length ?? 0) >= MAX_CHOICE_OPTIONS} onClick={() => onChange(addOption(config, q.id))}>
              {t('applications.builder.addOption')}
            </Button>
            <span className="text-ui-small text-ink-muted">{t('applications.builder.optionsUsed', { n: q.options?.length ?? 0, max: MAX_CHOICE_OPTIONS })}</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Copy className="size-4" aria-hidden />} disabled={full} onClick={duplicate} aria-describedby={full ? `dup-why-${q.id}` : undefined}>
            {t('applications.builder.duplicate')}
          </Button>
          <Button size="sm" icon={<Trash2 className="size-4 text-danger" aria-hidden />} onClick={remove}>
            {t('applications.builder.delete')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('applications.builder.done')}
          </Button>
          {full && (
            <span id={`dup-why-${q.id}`} className="text-ui-small text-ink-muted">
              {t('applications.builder.questionsFull', { max: MAX_CUSTOM_QUESTIONS })}
            </span>
          )}
        </div>
        <Switch label={t('applications.builder.required')} checked={required} onChange={(v) => onChange(setRequired(config, `custom:${q.id}`, v))} />
      </div>
    </div>
  )
}

function StandardBody({ k, field, name }: { k: ApplyBuiltinField; field: ResolvedField; name: string }) {
  const { t, lang: appLang } = useI18n()
  const { config, onChange } = useBuilder()
  const info = BUILTIN_FIELDS[k]
  const keys = fieldTextKeys(k)
  const choice = info.options ? (k as ApplyChoiceField) : null
  const locked = field.locked
  const allTextKeys = [keys.label, ...(keys.hint ? [keys.hint] : []), ...(keys.extra ? [keys.extra] : []), ...(choice ? (info.options ?? []).map((v) => optionTextKey(choice, v)) : [])]
  const edited = allTextKeys.some((x) => x in config.texts)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{t('applications.builder.standard')}</Badge>
        {locked && <LockNote>{t('applications.builder.lockedReason')}</LockNote>}
      </div>
      <TextOverride textKey={keys.label} variant="inline" size="question" focusMark title={t('applications.builder.questionLabel')} />
      {keys.hint && <TextOverride textKey={keys.hint} variant="inline" multiline title={t('applications.builder.descriptionLabel')} />}
      {keys.extra && <TextOverride textKey={keys.extra} variant="inline" title={t('applications.builder.otherLabel')} caption={t('applications.builder.otherLabel')} />}
      {choice && (
        <div className="space-y-2" role="group" aria-label={t('applications.builder.options')}>
          {(info.options ?? []).map((v, j) => {
            const shown = !config.hiddenOptions[choice]?.includes(v)
            const onlyOne = shown && visibleOptionCount(config, choice) <= 1
            const optionName = originalName(optionTextKey(choice, v), appLang)
            return (
              <div key={v} className={cn('flex items-start gap-1', !shown && 'opacity-60')}>
                <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center text-ink-faint" aria-hidden>
                  <Circle className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <TextOverride textKey={optionTextKey(choice, v)} variant="inline" title={t('applications.builder.optionN', { n: j + 1 })} />
                </div>
                <IconButton
                  aria-label={shown ? t('applications.builder.hideOption', { name: optionName }) : t('applications.builder.showOption', { name: optionName })}
                  size="sm"
                  disabled={onlyOne}
                  onClick={() => onChange(setOptionHidden(config, choice, v, shown))}
                >
                  {shown ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
                </IconButton>
              </div>
            )
          })}
          {visibleOptionCount(config, choice) <= 1 && <LockNote className="pl-6">{t('applications.builder.lastOption')}</LockNote>}
        </div>
      )}
      {k === 'language' && <p className="text-ui-small text-ink-muted">{t('applications.builder.languageNote')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} disabled={!edited} onClick={() => onChange(allTextKeys.reduce((c, x) => resetText(c, x), config))}>
            {t('applications.builder.resetField')}
          </Button>
          {!locked && (
            <Button
              size="sm"
              icon={field.hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
              aria-label={field.hidden ? t('applications.builder.showField', { name }) : t('applications.builder.hideField', { name })}
              onClick={() => onChange(setHidden(config, k, !field.hidden))}
            >
              {field.hidden ? t('applications.builder.show') : t('applications.builder.hideQuestion')}
            </Button>
          )}
          {field.hidden && <span className="text-ui-small text-ink-muted">{t('applications.builder.hiddenNote')}</span>}
        </div>
        {!locked && k !== 'language' && <Switch label={t('applications.builder.required')} checked={field.required} onChange={(v) => onChange(setRequired(config, k, v))} />}
      </div>
    </div>
  )
}
