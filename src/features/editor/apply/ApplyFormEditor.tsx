import { Eye } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { type ApplyFormConfig, type Lang, type SiteContent, validateApplyForm } from '@/domain/siteContent'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { ApplyForm } from '../../apply/ApplyForm'
import { FieldPanel } from './FieldPanel'
import { FormTab } from './FormTab'
import { MessagesTab } from './MessagesTab'

/**
 * The application form builder screen (/admin/editor/apply). The Editor shell owns autosave, publish and history; the
 * builder only edits `draft.applyForm` and hands the whole next document back through `onChange`.
 */
export interface ApplyFormEditorProps {
  draft: SiteContent
  onChange: (next: SiteContent) => void
}

type Tab = 'form' | 'messages'

export function ApplyFormEditor({ draft, onChange }: ApplyFormEditorProps) {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'messages' ? 'messages' : 'form'
  const config = draft.applyForm
  const errors = useMemo(() => validateApplyForm(config), [config])
  const problems = Object.keys(errors).length
  const [editing, setEditing] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const update = (next: ApplyFormConfig) => {
    if (next !== config) onChange({ ...draft, applyForm: next })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label={t('applications.builder.tabs')}
          value={tab}
          onChange={(v) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', v)
                return next
              },
              { replace: true },
            )
          }
          tabs={[
            { value: 'form', label: t('applications.builder.tabForm') },
            { value: 'messages', label: t('applications.builder.tabMessages') },
          ]}
        />
        <Button className="lg:hidden" icon={<Eye className="size-4" aria-hidden />} onClick={() => setPreviewOpen(true)}>
          {t('applications.builder.preview')}
        </Button>
      </div>

      {problems > 0 && (
        <InlineNotice tone="warning">
          <span role="alert">{t('applications.builder.problems', { n: problems })}</span>
        </InlineNotice>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {tab === 'form' ? <FormTab config={config} onChange={update} errors={errors} onEdit={setEditing} /> : <MessagesTab config={config} onChange={update} errors={errors} />}
        </div>
        <aside className="mt-6 hidden lg:sticky lg:top-4 lg:mt-0 lg:block" aria-label={t('applications.builder.preview')}>
          <BuilderPreview config={config} />
        </aside>
      </div>

      <FieldPanel fieldKey={editing} config={config} onChange={update} errors={errors} onClose={() => setEditing(null)} />

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t('applications.builder.preview')} size="lg" closeLabel={t('common.close')}>
        <BuilderPreview config={config} />
      </Modal>
    </div>
  )
}

/** The real application form with the draft: nothing is sent, nothing is stored, and the language and width can be switched. */
function BuilderPreview({ config }: { config: ApplyFormConfig }) {
  const { t, lang: appLang } = useI18n()
  const [lang, setLang] = useState<Lang>(appLang)
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
      {/* The public form, in its own look: outside the dashboard styling. */}
      <DashboardContext.Provider value={null}>
        <div data-surface="public" style={{ fontFamily: 'var(--font-sans)' }} className={cn('max-h-[75vh] overflow-y-auto border border-line bg-surface p-5 text-ink-body', phone && 'mx-auto max-w-[390px]')}>
          <ApplyForm config={config} preview lang={lang} />
        </div>
      </DashboardContext.Provider>
    </div>
  )
}
