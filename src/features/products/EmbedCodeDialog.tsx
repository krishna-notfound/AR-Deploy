import { Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { SegmentedControl } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import type { Business, Lang, Product } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { PUBLIC_URLS_ARE_LIVE, PUBLIC_URLS_ARE_TEMPORARY, productEmbedUrl } from '@/lib/urls'

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Responsive iframe code for an owner's website (ADR-0026): full width up to 960 px, fixed height, lazy-loaded. */
export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${escapeAttr(url)}" title="${escapeAttr(title)}" width="100%" height="560" style="width:100%;max-width:960px;height:560px;border:0" loading="lazy" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
}

type LangChoice = 'auto' | Lang

/** "Embed on your website" for one product: published products only, like the product QR code (ADR-0025). */
export function EmbedCodeDialog({ product, business, onClose }: { product: Product | null; business: Business | undefined; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal open={!!product} onClose={onClose} title={t('products.embed.title')} description={product?.name.en} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {product && (business ? <EmbedBody product={product} business={business} /> : <InlineNotice tone="warning">{t('products.share.businessNotFound')}</InlineNotice>)}
    </Modal>
  )
}

function EmbedBody({ product: p, business: b }: { product: Product; business: Business }) {
  const { t } = useI18n()
  if (p.status !== 'published')
    return (
      <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        <strong className="font-medium">{t('products.share.notPublicYet')}</strong> {t('products.embed.draftNotice')}
      </InlineNotice>
    )
  return <PublishedEmbed product={p} business={b} />
}

function PublishedEmbed({ product: p, business: b }: { product: Product; business: Business }) {
  const { t } = useI18n()
  const [lang, setLang] = useState<LangChoice>('auto')
  const url = productEmbedUrl(b, p, lang === 'auto' ? undefined : { lang })
  const name = (lang === 'pt' && p.name.pt) || p.name.en
  const code = embedSnippet(url, `${name} – ${b.name}`)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {t('products.embed.intro')}
      </p>
      {b.status !== 'active' && (
        <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <strong className="font-medium">{t('products.share.notPublicYet')}</strong> {t(b.status === 'draft' ? 'products.embed.catalogDraft' : 'products.embed.catalogPaused')}
        </InlineNotice>
      )}
      <div>
        <p className="text-[13px] font-medium">{t('products.embed.language')}</p>
        <div className="mt-1.5">
          <SegmentedControl
            size="sm"
            label={t('products.embed.languageLabel')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'auto', label: t('products.embed.langAuto') },
              { value: 'en', label: t('products.embed.langEn') },
              { value: 'pt', label: t('products.embed.langPt') },
            ]}
          />
        </div>
      </div>
      <div>
        <p className="text-[13px] font-medium">{t('products.embed.code')}</p>
        <textarea
          readOnly
          aria-label={t('products.embed.code')}
          value={code}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 block w-full resize-none rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-5 break-all text-ink"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton text={code} label={t('products.embed.copyCode')} toastTitle={t('products.embed.codeCopied')} variant="primary" />
          <CopyButton text={url} label={t('products.embed.copyUrl')} toastTitle={t('products.embed.urlCopied')} />
        </div>
        {!PUBLIC_URLS_ARE_LIVE && <p className="mt-1.5 text-xs text-ink-muted">{t('products.share.demoAddress')}</p>}
        {PUBLIC_URLS_ARE_TEMPORARY && <p className="mt-1.5 text-xs font-medium text-warning">{t('products.embed.tempAddress')}</p>}
      </div>
      <InlineNotice tone="info" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        {t('products.embed.arNote')}
      </InlineNotice>
    </div>
  )
}
