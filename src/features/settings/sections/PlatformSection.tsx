import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Switch } from '@/components/ui/Form'
import { useToast } from '@/components/ui/ToastProvider'
import { SectionHeader } from '../SettingsUi'
import { FAIL_RATE_KEY, MODEL_CREDITS, PHOTO_CREDIT, backend, isDemoMode, service } from '@/services'

const CAPABILITIES: [string, string, string][] = [
  ['Login and accounts', 'Mock account selector, stored in this browser', 'Auth provider, sessions, server-side authorization'],
  ['Business and product changes', 'Mock service with localStorage', 'API and database'],
  ['Image upload', 'Resized and stored in this browser (max 1.5 MB each)', 'Object storage, CDN and image resizing'],
  ['3D model upload', 'Available in this browser session only', 'Object storage and CDN'],
  ['Model checks', 'File type and header checks, scale check in the viewer', 'Server-side validation'],
  ['GLB to USDZ conversion', 'Not provided', 'Out of scope'],
  ['Product and catalog URLs', 'Demo URLs plus local preview routes', 'Real domain, DNS and SSL'],
  ['QR codes', 'Real QR codes of the catalog URL', 'Nothing extra once real URLs exist'],
  ['Analytics', 'Sample data plus visits made in this demo', 'Event collection and storage'],
  ['AR', 'Real model-viewer AR on supported phones', 'Hosted model files with correct CORS headers'],
]

export default function PlatformSection() {
  const confirm = useConfirm()
  const toast = useToast()
  const [failOn, setFailOn] = useState(() => parseFloat(localStorage.getItem(FAIL_RATE_KEY) ?? '0') > 0)
  const [resetting, setResetting] = useState(false)

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset demo data?',
      body: 'All businesses, products and analytics return to the original sample data. Your changes in this browser are lost.',
      confirmLabel: 'Reset demo data',
      destructive: true,
    })
    if (!ok) return
    setResetting(true)
    const r = await service.resetDemoData()
    setResetting(false)
    if (r.ok) toast.success('Demo data reset')
    else toast.error('Could not reset demo data', r.error.message)
  }

  return (
    <>
      <SectionHeader title="General" description={isDemoMode ? 'Where this platform keeps its data, the demo tools and the sample asset credits.' : 'Where this platform keeps its data, and the sample asset credits.'} />
      <div className="space-y-6">
        <Card>
          <PanelHeader title="Data backend" />
          <CardBody className="sm:px-6">
            {isDemoMode ? (
              <p className="text-[length:var(--text-ui-body)] leading-5 text-ink-muted">
                <strong className="font-medium text-ink">Demo mode.</strong> Sample data stored in this browser. To use Supabase, set <code className="rounded-[2px] bg-subtle px-1.5 py-0.5 font-mono text-[length:var(--text-ui-small)] text-ink">VITE_DATA_MODE=supabase</code> with the
                project URL and publishable key (design/19-supabase.md).
              </p>
            ) : (
              <p className="text-[length:var(--text-ui-body)] leading-5 text-ink-muted">
                <strong className="font-medium text-ink">Supabase mode.</strong> Data, files and sign-in come from {backend.mode === 'supabase' ? new URL(backend.url).host : 'Supabase'}.
                Access is enforced by the database policies, not by this screen.
              </p>
            )}
          </CardBody>
        </Card>

        {isDemoMode && (
        <Card>
          <PanelHeader title="Demo data" description="Changes are saved in this browser only." />
          <CardBody className="space-y-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-md text-[length:var(--text-ui-body)] leading-5 text-ink-muted">Restore the original sample businesses, products and analytics.</p>
              <Button onClick={reset} loading={resetting} icon={<RotateCcw className="size-4" aria-hidden />}>
                Reset demo data
              </Button>
            </div>
            <div className="border-t border-line pt-5">
              <Switch
                checked={failOn}
                onChange={(v) => {
                  setFailOn(v)
                  if (v) localStorage.setItem(FAIL_RATE_KEY, '0.25')
                  else localStorage.removeItem(FAIL_RATE_KEY)
                  toast.info(v ? 'Simulated errors on' : 'Simulated errors off', v ? 'About 1 in 4 requests will fail so you can review error states.' : undefined)
                }}
                label="Simulate network errors"
                description="Developer option. Makes about 25% of mock requests fail to test error states."
              />
            </div>
          </CardBody>
        </Card>
        )}

        {isDemoMode && (
        <Card>
          <PanelHeader title="What this demo does and does not do" description="Frontend behaviour versus functionality that needs the backend phase." />
          <div className="overflow-x-auto">
            <table className="w-full text-[length:var(--text-ui-body)] leading-5">
              <thead>
                <tr className="border-y border-line text-left text-[length:var(--text-ui-small)] text-ink-muted">
                  <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                    Capability
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    In this demo
                  </th>
                  <th scope="col" className="px-5 py-2 font-medium sm:px-6">
                    Needs backend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {CAPABILITIES.map(([a, b, c]) => (
                  <tr key={a}>
                    <th scope="row" className="px-5 py-3 text-left align-top font-medium sm:px-6">
                      {a}
                    </th>
                    <td className="px-3 py-3 align-top text-ink-muted">{b}</td>
                    <td className="px-5 py-3 align-top text-ink-muted sm:px-6">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        <Card>
          <PanelHeader title="Sample asset credits" />
          <CardBody className="sm:px-6">
            <ul className="space-y-1.5 text-[length:var(--text-ui-small)] leading-[1.45] text-ink-muted">
              {MODEL_CREDITS.map((m) => (
                <li key={m.name}>
                  3D model “{m.name}”, {m.source},{' '}
                  <a href={m.licenseUrl} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                    {m.license}
                  </a>
                </li>
              ))}
              <li className="border-t border-subtle pt-2">
                Photos from {PHOTO_CREDIT.source},{' '}
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
