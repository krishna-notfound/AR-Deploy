import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import type { Currency, ProductVariant } from '@/domain/types'
import { minorToInput, parseMoneyInput } from '@/lib/format'
import { newId } from '@/lib/id'

/** Colours/options list: name (EN + optional PT), swatch, SKU, price difference. */
export function VariantsEditor({ variants, onChange, currency }: { variants: ProductVariant[]; onChange: (v: ProductVariant[]) => void; currency: Currency }) {
  const update = (id: string, patch: Partial<ProductVariant>) => onChange(variants.map((v) => (v.id === id ? { ...v, ...patch } : v)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...variants]
    const [item] = next.splice(i, 1)
    if (item) next.splice(i + d, 0, item)
    onChange(next)
  }
  return (
    <div>
      {variants.length > 0 && (
        <ul className="space-y-2">
          {variants.map((v, i) => (
            <li key={v.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[auto_1fr_1fr_8rem_7rem_auto]">
              <input
                type="color"
                aria-label={`Colour swatch for ${v.name.en || 'option'}`}
                value={v.colorHex ?? '#cccccc'}
                onChange={(e) => update(v.id, { colorHex: e.target.value })}
                className="size-10 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
              />
              <Input aria-label="Option name (English)" placeholder="Name (English)" value={v.name.en} onChange={(e) => update(v.id, { name: { ...v.name, en: e.target.value } })} />
              <Input
                aria-label="Option name (Portuguese)"
                placeholder="Nome (Português)"
                lang="pt-PT"
                className="col-span-3 sm:col-span-1"
                value={v.name.pt ?? ''}
                onChange={(e) => update(v.id, { name: { ...v.name, pt: e.target.value || undefined } })}
              />
              <Input aria-label="SKU" placeholder="SKU (optional)" className="col-span-2 sm:col-span-1" value={v.sku ?? ''} onChange={(e) => update(v.id, { sku: e.target.value || undefined })} />
              <Input
                aria-label={`Price difference in ${currency}`}
                placeholder={`+ ${currency}`}
                inputMode="decimal"
                defaultValue={v.priceDelta ? minorToInput(v.priceDelta) : ''}
                onBlur={(e) => update(v.id, { priceDelta: parseMoneyInput(e.target.value) || undefined })}
              />
              <div className="col-start-3 row-start-1 flex sm:col-start-auto sm:row-start-auto">
                <IconButton aria-label="Move option up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton aria-label="Move option down" size="sm" disabled={i === variants.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton aria-label={`Remove ${v.name.en || 'option'}`} size="sm" className="hover:text-danger" onClick={() => onChange(variants.filter((x) => x.id !== v.id))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        className="mt-3"
        icon={<Plus className="size-4" aria-hidden />}
        onClick={() => onChange([...variants, { id: newId('var'), name: { en: '' }, colorHex: '#c8c2b8' }])}
      >
        Add colour or option
      </Button>
      <p className="mt-2 text-xs text-ink-muted">The price difference is added to the base price when a customer selects the option.</p>
    </div>
  )
}
