import { Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { SegmentedControl } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import type { Business, Lang, Product } from '@/domain/types'
import { PUBLIC_URLS_ARE_LIVE, PUBLIC_URLS_ARE_TEMPORARY, productEmbedUrl } from '@/lib/urls'

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Responsive iframe code for an owner's website (ADR-0026): full width up to 960 px, fixed height, lazy-loaded. */
export function embedSnippet(url: string, title: string): string {
  return `<iframe src="${escapeAttr(url)}" title="${escapeAttr(title)}" width="100%" height="560" style="width:100%;max-width:960px;height:560px;border:0" loading="lazy" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
}

type LangChoice = 'auto' | Lang

/** "Embed on your website" for one product: published products only, like the product QR code (ADR-0025). */
export function EmbedCodeDialog({ product, business, onClose }: { product: Product | null; business: Business | undefined; onClose: () => void }) {
  return (
    <Modal open={!!product} onClose={onClose} title="Embed on your website" description={product?.name.en} footer={<Button onClick={onClose}>Close</Button>}>
      {product && (business ? <EmbedBody product={product} business={business} /> : <InlineNotice tone="warning">This product’s business could not be found.</InlineNotice>)}
    </Modal>
  )
}

function EmbedBody({ product: p, business: b }: { product: Product; business: Business }) {
  if (p.status !== 'published')
    return (
      <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        <strong className="font-medium">Not public yet.</strong> Publish this product first: a draft’s page is hidden from customers and its web address
        can still change. Its embed code is available once it is published.
      </InlineNotice>
    )
  return <PublishedEmbed product={p} business={b} />
}

function PublishedEmbed({ product: p, business: b }: { product: Product; business: Business }) {
  const [lang, setLang] = useState<LangChoice>('auto')
  const url = productEmbedUrl(b, p, lang === 'auto' ? undefined : { lang })
  const name = (lang === 'pt' && p.name.pt) || p.name.en
  const code = embedSnippet(url, `${name} – ${b.name}`)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Show this product on your own website. Paste the code into your site’s HTML where the product should appear. Visitors see the photo, price and
        finishes and can turn the 3D model.
      </p>
      {b.status !== 'active' && (
        <InlineNotice tone="warning" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          <strong className="font-medium">Not public yet.</strong> The catalog is {b.status === 'draft' ? 'not active yet' : 'paused'}: the embedded frame shows
          “product not available” until it is activated.
        </InlineNotice>
      )}
      <div>
        <p className="text-[13px] font-medium">Language</p>
        <div className="mt-1.5">
          <SegmentedControl
            size="sm"
            label="Language of the embedded product"
            value={lang}
            onChange={setLang}
            options={[
              { value: 'auto', label: 'Visitor’s browser' },
              { value: 'en', label: 'English' },
              { value: 'pt', label: 'Portuguese' },
            ]}
          />
        </div>
      </div>
      <div>
        <p className="text-[13px] font-medium">Embed code</p>
        <textarea
          readOnly
          aria-label="Embed code"
          value={code}
          rows={4}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 block w-full resize-none rounded-lg border border-line bg-canvas p-3 font-mono text-xs leading-5 break-all text-ink"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CopyButton text={code} label="Copy code" toastTitle="Embed code copied" variant="primary" />
          <CopyButton text={url} label="Copy embed URL" toastTitle="Embed URL copied" />
        </div>
        {!PUBLIC_URLS_ARE_LIVE && <p className="mt-1.5 text-xs text-ink-muted">Example address for this demo. Your real address is set up by the platform team.</p>}
        {PUBLIC_URLS_ARE_TEMPORARY && <p className="mt-1.5 text-xs font-medium text-warning">This is a preview or local address. Copy embed code from the production site.</p>}
      </div>
      <InlineNotice tone="info" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        AR opens on the Sanctus product page: “View in your space” opens it in a new tab, because phones only start AR from a full page, not from inside
        another website.
      </InlineNotice>
    </div>
  )
}
