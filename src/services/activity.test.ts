import { describe, expect, it } from 'vitest'
import { translate } from '@/i18n/translate'
import { activityMessage, activityText } from '@/services/analytics'

const pt = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('pt', key, vars)

describe('activity sentences', () => {
  const e = { eventType: 'product_slug_changed', businessId: 'b1', toStatus: undefined, metadata: { name: 'Sofa', to: 'sofa-2' } }

  it('stay English by default', () => {
    expect(activityMessage(e)).toBe('Sofa has a new address: /sofa-2')
    expect(activityMessage({ ...e, eventType: 'business_status_changed', toStatus: 'inactive' }, 'Casa')).toBe('Catalog for Casa was paused')
  })

  it('are Portuguese with the pt translator', () => {
    expect(activityMessage(e, undefined, pt)).toBe('Sofa tem um novo endereço: /sofa-2')
    expect(activityText('business_status_changed', { status: 'active' }, pt)).toBe('O catálogo de uma empresa foi ativado')
    expect(activityText('business_deleted', { business: 'Casa' }, pt)).toBe('Casa foi eliminada')
    expect(activityText('login', {}, pt)).toBeNull()
  })
})
