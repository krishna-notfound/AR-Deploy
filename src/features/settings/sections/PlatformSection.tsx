import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Switch } from '@/components/ui/Form'
import { useToast } from '@/components/ui/ToastProvider'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { SectionHeader } from '../SettingsUi'
import { FAIL_RATE_KEY, MODEL_CREDITS, PHOTO_CREDIT, backend, isDemoMode, service } from '@/services'

const CAPABILITIES = ['accounts', 'changes', 'images', 'models', 'checks', 'usdz', 'urls', 'qr', 'analytics', 'ar'] as const

export default function PlatformSection() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const toast = useToast()
  const [failOn, setFailOn] = useState(() => parseFloat(localStorage.getItem(FAIL_RATE_KEY) ?? '0') > 0)
  const [resetting, setResetting] = useState(false)

  const reset = async () => {
    const ok = await confirm({
      title: t('settings.platform.resetTitle'),
      body: t('settings.platform.resetBody'),
      confirmLabel: t('settings.platform.reset'),
      destructive: true,
    })
    if (!ok) return
    setResetting(true)
    const r = await service.resetDemoData()
    setResetting(false)
    if (r.ok) toast.success(t('settings.platform.resetDone'))
    else toast.error(t('settings.platform.resetFailed'), accountErrorText(r.error, t))
  }

  return (
    <>
      <SectionHeader title={t('settings.section.platform')} description={isDemoMode ? t('settings.platform.descriptionDemo') : t('settings.platform.description')} />
      <div className="space-y-6">
        <Card>
          <PanelHeader title={t('settings.platform.backend')} />
          <CardBody className="sm:px-6">
            {isDemoMode ? (
              <p className="text-[length:var(--text-ui-body)] leading-5 text-ink-muted">
                <strong className="font-medium text-ink">{t('settings.platform.demoMode')}</strong> {t('settings.platform.demoModeBody1')} <code className="rounded-[2px] bg-subtle px-1.5 py-0.5 font-mono text-[length:var(--text-ui-small)] text-ink">VITE_DATA_MODE=supabase</code> {t('settings.platform.demoModeBody2')}
              </p>
            ) : (
              <p className="text-[length:var(--text-ui-body)] leading-5 text-ink-muted">
                <strong className="font-medium text-ink">{t('settings.platform.liveMode')}</strong> {t('settings.platform.liveModeBody', { host: backend.mode === 'supabase' ? new URL(backend.url).host : 'Supabase' })}
              </p>
            )}
          </CardBody>
        </Card>

        {isDemoMode && (
        <Card>
          <PanelHeader title={t('settings.platform.demoData')} description={t('settings.platform.demoDataBody')} />
          <CardBody className="space-y-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[length:var(--text-ui-body)] leading-5 text-ink-muted">{t('settings.platform.restore')}</p>
              <Button onClick={reset} loading={resetting} icon={<RotateCcw className="size-4" aria-hidden />}>
                {t('settings.platform.reset')}
              </Button>
            </div>
            <div className="border-t border-line pt-5">
              <Switch
                checked={failOn}
                onChange={(v) => {
                  setFailOn(v)
                  if (v) localStorage.setItem(FAIL_RATE_KEY, '0.25')
                  else localStorage.removeItem(FAIL_RATE_KEY)
                  toast.info(v ? t('settings.platform.errorsOn') : t('settings.platform.errorsOff'), v ? t('settings.platform.errorsOnBody') : undefined)
                }}
                label={t('settings.platform.simulate')}
                description={t('settings.platform.simulateBody')}
              />
            </div>
          </CardBody>
        </Card>
        )}

        {isDemoMode && (
        <Card>
          <PanelHeader title={t('settings.platform.matrixTitle')} description={t('settings.platform.matrixBody')} />
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--text-ui-body)] leading-5">
              <thead>
                <tr className="border-y border-line text-left text-[length:var(--text-ui-small)] text-ink-muted">
                  <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                    {t('settings.platform.colCapability')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t('settings.platform.colDemo')}
                  </th>
                  <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                    {t('settings.platform.colBackend')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {CAPABILITIES.map((c) => (
                  <tr key={c}>
                    <th scope="row" className="px-5 py-3 text-left align-top font-medium sm:px-6">
                      {t(`settings.platform.cap.${c}` as TranslationKey)}
                    </th>
                    <td className="px-3 py-3 align-top text-ink-muted">{t(`settings.platform.cap.${c}.demo` as TranslationKey)}</td>
                    <td className="px-5 py-3 align-top text-ink-muted sm:px-6">{t(`settings.platform.cap.${c}.backend` as TranslationKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        <Card>
          <PanelHeader title={t('settings.platform.credits')} />
          <CardBody className="sm:px-6">
            <ul className="space-y-1.5 text-[length:var(--text-ui-small)] leading-[1.45] text-ink-muted">
              {MODEL_CREDITS.map((m) => (
                <li key={m.name}>
                  {t('settings.platform.creditModel', { name: m.name, source: m.source })}{' '}
                  <a href={m.licenseUrl} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                    {m.license}
                  </a>
                </li>
              ))}
              <li className="border-t border-subtle pt-2">
                {t('settings.platform.creditPhotos', { source: PHOTO_CREDIT.source })}{' '}
                <a href={PHOTO_CREDIT.url} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                  {PHOTO_CREDIT.license}
                </a>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
