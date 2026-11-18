import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { switchLanguage } from '@/shared/i18n/i18n'
import { renderApp } from '@/test/render-app'
import { ALICE, signedIn } from '@/test/stub-api'

const PHONE = {
  id: 2,
  client: 'Safari on iOS',
  created_at: '2026-10-02T12:00:00Z',
  last_used_at: '2026-10-02T12:00:00Z',
  current: false,
}
const LAPTOP = { id: 3, name: 'laptop', created_at: '2026-10-01T12:00:00Z' }

const open = (sessions: unknown[] = []) => {
  signedIn({
    'GET /api/me': { status: 200, body: { ...ALICE, language: 'pt-BR' } },
    'GET /api/tokens': { status: 200, body: [LAPTOP] },
    'GET /api/me/sessions': { status: 200, body: sessions },
  })
  return renderApp('/account')
}

describe('the rest of /account in pt-BR', () => {
  afterEach(() => switchLanguage('en'))

  it('translates the name field and its validation', async () => {
    const { screen } = await open()

    await screen.getByLabelText('Nome', { exact: true }).fill('   ')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(screen.getByText('O nome é obrigatório.'))
      .toBeVisible()
  })

  it('translates the password form and its validation', async () => {
    const { screen } = await open()

    await screen
      .getByLabelText('Nova senha', { exact: true })
      .fill('long password 1')
    await screen.getByLabelText('Confirme a nova senha').fill('other')
    await screen.getByRole('button', { name: 'Alterar senha' }).click()

    await expect
      .element(screen.getByText('As senhas não coincidem.'))
      .toBeVisible()
  })

  it('translates the show-password toggle', async () => {
    const { screen } = await open()

    await expect
      .element(screen.getByRole('button', { name: 'Mostrar senha' }).first())
      .toBeVisible()
  })

  it('translates the lone-session state', async () => {
    const { screen } = await open()

    await expect
      .element(screen.getByText('Só este dispositivo está conectado.'))
      .toBeVisible()
  })

  it('translates the sessions list with a plural count', async () => {
    const { screen } = await open([PHONE])

    await expect
      .element(
        screen.getByRole('button', { name: 'Sair das outras sessões (1)' })
      )
      .toBeVisible()
  })

  it('translates the token form and its validation', async () => {
    const { screen } = await open()

    await screen.getByRole('button', { name: 'Criar token' }).click()

    await expect.element(screen.getByText('Informe um nome.')).toBeVisible()
  })

  it('translates the revoke confirmation', async () => {
    const { screen } = await open()

    await screen.getByRole('button', { name: 'Revogar laptop' }).click()

    await expect
      .element(screen.getByRole('alertdialog', { name: 'Revogar laptop?' }))
      .toBeVisible()
  })

  it('translates export and the delete confirmation', async () => {
    const { screen } = await open()

    await expect
      .element(screen.getByRole('button', { name: 'Exportar meus dados' }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Excluir minha conta' }).click()
    await expect
      .element(screen.getByRole('alertdialog', { name: 'Excluir sua conta?' }))
      .toBeVisible()
  })
})
