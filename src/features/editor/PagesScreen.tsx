import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useI18n } from '@/i18n/LanguageProvider'
import { MAX_CUSTOM_PAGES, type CustomPage, type SiteContent } from '@/domain/siteContent'
import { PRIVACY_PATH, TERMS_PATH, customPagePath, editorPagePath } from '@/lib/urls'
import { useEditor } from './EditorContext'
import { footerPages, moveInFooter, newPage, withPage } from './pageOps'

type State = 'original' | 'edited' | 'new' | 'published'
const STATE_TONE = { original: 'neutral', edited: 'warning', new: 'accent', published: 'success' } as const

const hasText = (v: Partial<Record<string, string>> | undefined) => !!v && Object.values(v).some((x) => typeof x === 'string' && x.trim() !== '')

function customState(page: CustomPage, published: SiteContent | null): State {
  const before = published?.customPages.find((p) => p.id === page.id)
  if (!before) return 'new'
  const same = JSON.stringify([before.slug, before.title, before.body, before.showInFooter, before.order]) === JSON.stringify([page.slug, page.title, page.body, page.showInFooter, page.order])
  return same ? 'published' : 'edited'
}

/** /admin/editor/pages: Terms, Privacy, the custom pages, and the footer links they add. */
export default function PagesScreen() {
  const { t } = useI18n()
  const { draft, published, setDraft } = useEditor()
  const navigate = useNavigate()
  const atLimit = draft.customPages.length >= MAX_CUSTOM_PAGES

  const add = () => {
    const page = newPage(draft)
    setDraft((d) => withPage(d, page))
    navigate(editorPagePath(page.id))
  }

  const rows = [
    { key: 'terms', title: t('editor.page.terms'), address: TERMS_PATH, footer: t('editor.pages.footerFixed'), state: hasText(draft.builtinPages.terms) ? 'edited' : 'original' },
    { key: 'privacy', title: t('editor.page.privacy'), address: PRIVACY_PATH, footer: t('editor.pages.footerFixed'), state: hasText(draft.builtinPages.privacy) ? 'edited' : 'original' },
    ...draft.customPages.map((p) => ({
      key: p.id,
      title: p.title.en.trim() || t('editor.page.untitled'),
      address: p.slug ? customPagePath(p.slug) : t('editor.pages.noAddress'),
      footer: p.showInFooter ? t('common.yes') : t('common.no'),
      state: customState(p, published),
    })),
  ] satisfies { key: string; title: string; address: string; footer: string; state: State }[]

  return (
    <div className="space-y-8">
      <section aria-labelledby="pages-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pages-heading" className="text-ui-card font-medium text-ink">
              {t('editor.menu.pages')}
            </h2>
            <p className="mt-1 max-w-xl text-ui-small text-ink-muted">{t('editor.pages.description')}</p>
          </div>
          <div className="flex items-center gap-3">
            {atLimit && <span className="text-ui-small text-ink-muted">{t('editor.pages.limit', { n: MAX_CUSTOM_PAGES })}</span>}
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={add} disabled={atLimit}>
              {t('editor.pages.new')}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[560px] border-collapse text-left text-ui-body">
            <thead>
              <tr className="border-b border-line text-ui-small text-ink-muted">
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('editor.pages.col.title')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('editor.pages.col.address')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('editor.pages.col.footer')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link to={editorPagePath(r.key)} className="font-medium text-ink underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-ink-muted">{r.address}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.footer}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATE_TONE[r.state]}>{t(`editor.pages.state.${r.state}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {draft.customPages.length === 0 && <p className="mt-3 text-ui-small text-ink-muted">{t('editor.pages.empty')}</p>}
      </section>
      <FooterPanel />
    </div>
  )
}

/** Custom pages with "In footer" on, in footer order, and what the footer will show. Privacy and Terms stay fixed where they are. */
function FooterPanel() {
  const { t, lang } = useI18n()
  const { draft, setDraft } = useEditor()
  const list = footerPages(draft)
  const name = (p: CustomPage) => (lang === 'pt' && p.title.pt?.trim() ? p.title.pt : p.title.en.trim() || t('editor.page.untitled'))
  const links = [t('legal.privacy.link'), t('legal.terms.link'), ...list.map(name)]
  return (
    <Card>
      <CardHeader title={t('editor.footer.title')} description={t('editor.footer.description')} />
      <CardBody className="space-y-4">
        {list.length === 0 ? (
          <p className="text-ui-body text-ink-muted">{t('editor.footer.empty')}</p>
        ) : (
          <ol aria-label={t('editor.footer.order')} className="divide-y divide-line border-y border-line">
            {list.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-ui-body">{name(p)}</span>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" aria-label={t('editor.footer.moveUp', { name: name(p) })} disabled={i === 0} onClick={() => setDraft((d) => moveInFooter(d, p.id, -1))}>
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button size="sm" aria-label={t('editor.footer.moveDown', { name: name(p) })} disabled={i === list.length - 1} onClick={() => setDraft((d) => moveInFooter(d, p.id, 1))}>
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <div>
          <p className="text-ui-small font-medium text-ink-muted">{t('editor.footer.preview')}</p>
          <p data-testid="footer-preview" className="mt-2 border border-line bg-subtle px-4 py-3 text-[13px] text-ink-muted">
            {links.join('  ·  ')}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}
