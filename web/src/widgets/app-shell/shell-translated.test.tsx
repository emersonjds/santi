import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { switchLanguage } from '@/shared/i18n/i18n'
import { renderApp } from '@/test/render-app'
import { ALICE, inProjects } from '@/test/stub-api'

const open = (user: { tour_seen_at?: string | null } = {}) => {
  inProjects({
    'GET /api/me': {
      status: 200,
      body: { ...ALICE, language: 'pt-BR', ...user },
    },
  })
  return renderApp('/p/WEB/board')
}

describe('the shell in pt-BR', () => {
  beforeEach(() => page.viewport(1280, 800))
  afterEach(() => switchLanguage('en'))

  it('translates the sidebar and the project pages', async () => {
    const { screen } = await open()

    const nav = screen.getByRole('navigation', { name: 'Projetos e páginas' })
    await expect
      .element(nav.getByRole('link', { name: 'Para você' }))
      .toBeVisible()
    await expect
      .element(nav.getByRole('link', { name: 'Quadro' }))
      .toBeVisible()
    await expect
      .element(nav.getByRole('button', { name: 'Recentes' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Criar' }))
      .toBeVisible()
  })

  it('translates the phone drawer', async () => {
    await page.viewport(375, 812)
    const { screen } = await open()

    await screen
      .getByRole('button', { name: 'Mostrar ou ocultar a barra lateral' })
      .click()

    await expect
      .element(screen.getByRole('dialog', { name: 'Barra lateral' }))
      .toBeVisible()
  })

  it('translates the account menu', async () => {
    const { screen } = await open()

    await screen.getByRole('button', { name: 'Conta (Alice)' }).click()

    await expect
      .element(screen.getByRole('menuitem', { name: 'Atalhos de teclado' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('menuitem', { name: 'Sair' }))
      .toBeVisible()
  })

  it('translates the empty notifications panel', async () => {
    const { screen } = await open()

    await screen.getByRole('button', { name: 'Notificações' }).click()

    await expect.element(screen.getByText('Você está em dia.')).toBeVisible()
  })

  it('translates the shortcut sheet', async () => {
    const { screen } = await open()
    await expect
      .element(screen.getByRole('link', { name: 'Para você' }))
      .toBeVisible()

    await userEvent.keyboard('?')

    const sheet = screen.getByRole('dialog', { name: 'Atalhos de teclado' })
    await expect.element(sheet.getByText('Criar um item')).toBeVisible()
  })

  it('translates the welcome tour', async () => {
    const { screen } = await open({ tour_seen_at: null })

    const tour = screen.getByRole('dialog')
    await expect
      .element(tour.getByRole('heading', { name: 'Boas-vindas ao santi' }))
      .toBeVisible()
    await expect
      .element(tour.getByRole('status'))
      .toHaveTextContent('Passo 1 de 5')
  })
})
