import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfirmProvider, useConfirm } from '@/components/ui/ConfirmProvider'
import { LanguageProvider, useI18n } from '@/i18n/LanguageProvider'
import { LanguageSwitcher } from '@/features/public/PublicShell'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

describe('ConfirmDialog', () => {
  function Harness({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm()
    return (
      <button type="button" onClick={async () => onResult(await confirm({ title: 'Delete it?', confirmLabel: 'Delete', destructive: true }))}>
        open
      </button>
    )
  }

  it('resolves true on confirm and false on cancel / Escape', async () => {
    const user = userEvent.setup()
    const results: boolean[] = []
    render(
      <ConfirmProvider>
        <Harness onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    )
    await user.click(screen.getByText('open'))
    expect(screen.getByRole('dialog', { name: 'Delete it?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByText('open'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByText('open'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(results).toEqual([true, false, false]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('useServiceQuery', () => {
  function ProductCount() {
    const q = useServiceQuery(() => service.getProductsByBusiness('biz_nord'), [])
    return <p>{q.status === 'success' ? `count:${q.data.length}` : 'loading'}</p>
  }

  it('refetches after a mutation changes the store', async () => {
    render(<ProductCount />)
    await screen.findByText('count:7')
    await act(async () => {
      await service.duplicateProduct('prd_bed')
    })
    await screen.findByText('count:8')
  })
})

describe('LanguageSwitcher', () => {
  function Label() {
    const { t } = useI18n()
    return <p>{t('ar.button')}</p>
  }

  it('switches between English and Portuguese and persists for the session', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <LanguageSwitcher />
        <Label />
      </LanguageProvider>,
    )
    expect(screen.getByText('View in my home')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'PT' }))
    expect(screen.getByText('Ver na minha casa')).toBeInTheDocument()
    expect(sessionStorage.getItem('arfurn:lang')).toBe('pt')
    expect(document.documentElement.lang).toBe('pt-PT')
  })
})
