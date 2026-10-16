import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import { inProjects } from '@/test/stub-api'

/** WCAG 2.4.3: a dialog opened by a button, a menu item or a key gives the focus back on close. */
describe('focus return', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('goes back to + Create', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const create = screen.getByRole('button', { name: 'Create', exact: true })

    await create.click()
    await expect
      .element(screen.getByRole('dialog', { name: 'Create issue' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(create).toHaveFocus()
  })

  it('goes back to the card selected when c was pressed', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    await expect
      .element(screen.getByRole('button', { name: 'Drag WEB-1' }))
      .toBeVisible()
    const card = screen.getByRole('link', {
      name: 'Write the release notes',
      exact: true,
    })

    await userEvent.keyboard('j')
    await expect.element(card).toHaveFocus()
    await userEvent.keyboard('c')
    await expect
      .element(screen.getByRole('dialog', { name: 'Create issue' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(card).toHaveFocus()
  })

  it('goes back to the card menu after a cancelled delete', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const menu = screen.getByRole('button', { name: 'Actions for WEB-1' })

    await menu.click()
    await screen.getByRole('menuitem', { name: 'Delete' }).click()
    const confirm = screen.getByRole('alertdialog', { name: 'Delete WEB-1?' })
    await confirm.getByRole('button', { name: 'Cancel' }).click()

    await expect.element(confirm).not.toBeInTheDocument()
    await expect.element(menu).toHaveFocus()
  })

  it('goes back to the sprint menu after a cancelled edit', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')
    const menu = screen.getByRole('button', { name: 'More for Sprint 5' })

    await menu.click()
    await screen.getByRole('menuitem', { name: 'Edit sprint' }).click()
    const dialog = screen.getByRole('dialog', { name: /Sprint 5/ })
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect.element(dialog).not.toBeInTheDocument()
    await expect.element(menu).toHaveFocus()
  })

  it('goes back to the account menu after the shortcut sheet', async () => {
    inProjects()
    const { screen } = await renderApp('/p/WEB/board')
    const account = screen.getByRole('button', { name: 'Account' })

    await account.click()
    await screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
    await expect
      .element(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }))
      .toBeVisible()
    await userEvent.keyboard('{Escape}')

    await expect.element(account).toHaveFocus()
  })

  it('goes back to the Epics toggle after the phone sheet', async () => {
    await page.viewport(375, 800)
    inProjects()
    const { screen } = await renderApp('/p/WEB/backlog')
    const toggle = screen.getByRole('button', { name: 'Epics' })

    await toggle.click()
    const sheet = screen.getByRole('dialog', { name: 'Epics' })
    await sheet.getByRole('button', { name: 'Close' }).click()

    await expect.element(sheet).not.toBeInTheDocument()
    await expect.element(toggle).toHaveFocus()
  })
})
