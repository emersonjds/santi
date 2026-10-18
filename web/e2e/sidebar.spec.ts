import { type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const SHOTS = process.env.SHOTS_DIR ?? 'test-results/sidebar-shots'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Calls the API from inside the page, so the session cookie and same-origin checks apply as for the SPA. */
const api = (page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
      return response.status === 204 ? null : response.json()
    },
    { method, path, body }
  )

const register = async (page: Page) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('checkbox', { name: /I agree to the Terms/ }).check()
  await page.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'For you' })).toBeVisible()
}

const sidebar = (page: Page) =>
  page.getByRole('navigation', { name: 'Projects and pages' })

const openFlyout = async (page: Page, name: string) => {
  await sidebar(page).getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('dialog', { name })).toBeVisible()
}

const openMenu = async (page: Page, name: string) => {
  await sidebar(page).getByRole('button', { name }).click()
  await expect(page.getByRole('menu')).toBeVisible()
}

/** Opens `url` fresh at each width (the drawer on a phone), runs `open`, then shoots it light and dark. */
const capture = async (
  page: Page,
  url: string,
  name: string,
  open: () => Promise<unknown> = async () => {},
  widths = [1440, 375]
) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
    await page.goto(url)
    if (width < 768)
      await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
    await expect(
      sidebar(page).getByRole('button', { name: 'Projects options' })
    ).toBeEnabled()
    await open()
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth)
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `${SHOTS}/${name}-${width}-${theme}.png`,
        animations: 'disabled',
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(url)
}

test('the sidebar reaches recent, starred and every project, and keeps its width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await register(page)
  const suffix = unique().slice(-5).toUpperCase()
  const names = [
    'Alpha',
    'Bravo',
    'Charlie',
    'Delta',
    'Echo',
    'Foxtrot',
    'Golf',
    'Hotel',
  ]
  const keys = names.map((name) => `${name[0]}${suffix}`)
  for (const [index, name] of names.entries())
    await api(page, 'POST', '/api/projects', {
      key: keys[index],
      name: `${name} ${suffix}`,
      board_type: index === 0 ? 'scrum' : 'kanban',
    })
  const [alpha, bravo] = [`Alpha ${suffix}`, `Bravo ${suffix}`]
  const [alphaKey, bravoKey] = keys
  await api(page, 'POST', `/api/projects/${alphaKey}/issues`, {
    summary: 'Polish the sign-in copy',
  })
  const board = `/p/${alphaKey}/board`

  const visited = page.waitForResponse((response) =>
    response.url().endsWith(`/api/projects/${bravoKey}/visit`)
  )
  await page.goto(`/p/${bravoKey}/board`)
  await visited
  await page.goto(`/p/${alphaKey}/issues/1`)
  await expect(page.getByLabel('Summary')).toHaveValue(
    'Polish the sign-in copy'
  )
  await page.goto(board)

  const nav = sidebar(page)
  await expect(
    nav.getByRole('link', { name: 'For you', exact: true })
  ).toBeVisible()
  const recent = nav.getByRole('button', { name: 'Recent', exact: true })
  const starred = nav.getByRole('button', { name: 'Starred', exact: true })
  await expect(recent).toHaveAttribute('aria-expanded', 'false')
  await expect(starred).toHaveAttribute('aria-expanded', 'false')
  await expect(nav.getByText('Projects', { exact: true })).toBeVisible()
  await expect(
    nav.getByRole('button', { name: `Toggle ${alpha}` })
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(
    page.locator(`#sidebar-pages-${alphaKey}`).getByRole('link')
  ).toHaveText(['Board', 'Backlog', 'Reports', 'Settings'])
  await capture(page, board, 'rest')

  await recent.click()
  const recentDialog = page.getByRole('dialog', { name: 'Recent' })
  await expect(recentDialog).toContainText(alpha)
  await expect(recentDialog).toContainText(bravo)
  await expect(recentDialog).toContainText('Polish the sign-in copy')
  await recentDialog.getByLabel('Search recent').fill('sign-in')
  await expect(recentDialog.getByRole('listitem')).toHaveCount(1)
  await expect(recentDialog.getByRole('listitem')).toContainText(
    'Polish the sign-in copy'
  )
  await page.keyboard.press('Escape')
  await expect(recentDialog).toBeHidden()
  await expect(recent).toBeFocused()
  await capture(page, board, 'recent-open', () => openFlyout(page, 'Recent'))

  await capture(page, board, 'starred-empty', async () => {
    await openFlyout(page, 'Starred')
    await expect(page.getByText('Nothing starred yet')).toBeVisible()
  })

  const recentRows = nav.getByRole('list', { name: 'Recent' })
  const starredRows = nav.getByRole('list', { name: 'Starred' })
  await recentRows.getByRole('button', { name: `Star ${bravo}` }).click()
  const moved = starredRows.getByRole('button', { name: `Star ${bravo}` })
  await expect(moved).toHaveAttribute('aria-pressed', 'true')
  await expect(moved).toBeFocused()
  await expect(
    recentRows.getByRole('button', { name: /^Toggle / })
  ).toHaveCount(5)
  await api(page, 'POST', '/api/me/stars', { key: `${alphaKey}-1` })

  await starred.click()
  const starredDialog = page.getByRole('dialog', { name: 'Starred' })
  await expect(starredDialog.getByRole('listitem')).toHaveCount(2)
  await starredDialog.getByRole('button', { name: 'Type: All' }).click()
  await page.getByRole('menuitemradio', { name: 'Issues' }).click()
  await expect(starredDialog.getByRole('listitem')).toHaveCount(1)
  await expect(starredDialog.getByRole('listitem')).toContainText(
    'Polish the sign-in copy'
  )
  await page.keyboard.press('Escape')
  await expect(starredDialog).toBeHidden()
  await capture(page, board, 'starred-open', () => openFlyout(page, 'Starred'))

  const chooseView = async (view: string) => {
    await nav.getByRole('button', { name: 'Projects options' }).click()
    await page.getByRole('menuitem', { name: 'View' }).click()
    await page.getByRole('menuitemradio', { name: view }).click()
  }
  await chooseView('Starred only')
  await expect(starredRows).toContainText(bravo)
  await expect(recentRows).toHaveCount(0)
  await expect(
    nav.getByRole('button', { name: `Toggle ${alpha}` })
  ).toBeVisible()
  await chooseView('Recent and starred')
  await expect(
    recentRows.getByRole('button', { name: /^Toggle / })
  ).toHaveCount(5)
  await capture(page, board, 'projects-menu', () =>
    openMenu(page, 'Projects options')
  )

  await nav.getByRole('button', { name: `Actions for ${alpha}` }).click()
  await expect(page.getByRole('menuitem').first()).toHaveText('Star project')
  await page.keyboard.press('Escape')
  await capture(page, board, 'project-menu', () =>
    openMenu(page, `Actions for ${alpha}`)
  )

  await nav.getByRole('button', { name: 'More projects' }).click()
  const more = page.getByRole('dialog', { name: 'More projects' })
  await expect(more.getByRole('listitem')).toHaveCount(2)
  await capture(page, board, 'more-projects', () =>
    openFlyout(page, 'More projects')
  )
  await nav.getByRole('button', { name: 'More projects' }).click()
  const first = await more
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .getAttribute('title')
  await more.getByLabel('Search projects').fill('no such project')
  await expect(more.getByText('No matches')).toBeVisible()
  await more.getByLabel('Search projects').fill(first ?? '')
  await expect(more.getByRole('listitem')).toHaveText([new RegExp(first ?? '')])
  await page.keyboard.press('Escape')
  await expect(more).toBeHidden()
  await expect(nav.getByRole('button', { name: 'More projects' })).toBeFocused()

  const handle = page.getByRole('separator', { name: 'Resize the sidebar' })
  await expect(handle).toHaveAttribute('aria-valuenow', '320')
  await handle.focus()
  for (let step = 0; step < 5; step++) await page.keyboard.press('ArrowRight')
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await page.reload()
  await expect(handle).toHaveAttribute('aria-valuenow', '420')
  await capture(
    page,
    board,
    'wide-recent',
    () => openFlyout(page, 'Recent'),
    [1440]
  )
})
