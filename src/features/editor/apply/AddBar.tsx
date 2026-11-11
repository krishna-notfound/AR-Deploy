import { LayoutList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DropdownMenu, type MenuItem } from '@/components/ui/Menu'
import { type CustomQuestionType, MAX_APPLY_STEPS, MAX_CUSTOM_QUESTIONS } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { QUESTION_KINDS, kindLabelKey } from './kinds'

/**
 * The add bar: Add question (pick the kind first) and Add section. It is one element that changes place with the screen:
 * a fixed bar at the bottom on phones and tablets; from the xl breakpoint it floats to the right of the open card
 * (`railed`) or, with no card open, sits as a row after the last card. When a limit is reached the button is disabled and
 * the reason is written next to it.
 */
export function AddBar({ railed, questionsFull, sectionsFull, onAddQuestion, onAddSection }: { railed: boolean; questionsFull: boolean; sectionsFull: boolean; onAddQuestion: (type: CustomQuestionType) => void; onAddSection: () => void }) {
  const { t } = useI18n()
  const reason = questionsFull ? t('applications.builder.questionsFull', { max: MAX_CUSTOM_QUESTIONS }) : sectionsFull ? t('applications.builder.sectionsFull', { max: MAX_APPLY_STEPS }) : null
  const items: MenuItem[] = QUESTION_KINDS.map((k) => {
    const Icon = k.icon
    return { label: t(kindLabelKey(k.type)), icon: <Icon />, onSelect: () => onAddQuestion(k.type) }
  })
  const label = railed ? 'xl:sr-only' : ''
  return (
    <div
      role="toolbar"
      aria-label={t('applications.builder.addBar')}
      data-add-bar
      className={cn(
        // From lg the dashboard has a sidebar: the bar starts after it instead of covering it.
        'fixed inset-x-0 bottom-0 z-30 lg:left-[var(--sidebar-w,0px)] flex flex-wrap items-center justify-center gap-2 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)]',
        railed
          ? 'xl:absolute xl:inset-x-auto xl:bottom-auto xl:left-full xl:top-0 xl:ml-3 xl:flex-col xl:flex-nowrap xl:rounded-[var(--radius-card)] xl:border xl:p-1.5 xl:pb-1.5 xl:shadow-[var(--shadow-card)]'
          : 'xl:static xl:z-auto xl:mt-2 xl:justify-start xl:border-0 xl:bg-transparent xl:p-0 xl:pb-0 xl:shadow-none',
      )}
    >
      {questionsFull ? (
        <Button size="sm" icon={<Plus className="size-4" aria-hidden />} disabled aria-describedby="add-bar-why" title={reason ?? undefined}>
          <span className={label}>{t('applications.builder.addQuestion')}</span>
        </Button>
      ) : (
        <DropdownMenu
          label={t('applications.builder.addQuestion')}
          triggerTitle={railed ? t('applications.builder.addQuestion') : undefined}
          align="start"
          triggerClassName="w-auto! h-11! gap-2 border border-line-strong bg-surface px-3! text-ui-body font-medium text-ink hover:border-ink xl:h-10!"
          trigger={
            <>
              <Plus className="size-4" aria-hidden />
              <span className={label}>{t('applications.builder.addQuestion')}</span>
            </>
          }
          items={items}
        />
      )}
      <Button size="sm" icon={<LayoutList className="size-4" aria-hidden />} disabled={sectionsFull} aria-describedby={sectionsFull ? 'add-bar-why' : undefined} title={sectionsFull ? (reason ?? undefined) : railed ? t('applications.builder.addSection') : undefined} onClick={onAddSection}>
        <span className={label}>{t('applications.builder.addSection')}</span>
      </Button>
      {reason && (
        <span id="add-bar-why" className={cn('basis-full text-center text-ui-small text-ink-muted', railed ? 'xl:sr-only' : 'xl:basis-auto xl:text-left')}>
          {reason}
        </span>
      )}
    </div>
  )
}
