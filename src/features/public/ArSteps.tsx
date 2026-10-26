import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'

const STEPS = [
  { title: 'arSteps.open', hint: 'arSteps.openHint' },
  { title: 'arSteps.tap', hint: 'arSteps.tapHint' },
  { title: 'arSteps.place', hint: 'arSteps.placeHint' },
] as const

/**
 * The three steps of placing a piece in your room, for the dark AR bands of the catalog and product pages
 * (ADR-0036 v2). Set on the obsidian field: cream text, the step number in a small circle.
 */
export function ArSteps({ className, layout = 'stack' }: { className?: string; layout?: 'stack' | 'row' }) {
  const { t } = useI18n()
  return (
    <ol className={cn(layout === 'row' ? 'grid gap-6 sm:grid-cols-3' : 'space-y-5', className)}>
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-3.5">
          <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-canvas/12 text-[13px] text-canvas">
            {i + 1}
          </span>
          <span>
            <span className="block text-[16px] font-medium text-canvas">{t(s.title)}</span>
            <span className="mt-1 block text-[15px] leading-6 text-canvas/75">{t(s.hint)}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
