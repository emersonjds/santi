import { type Locator, type Page, expect, test } from '@playwright/test'

const PASSWORD = 'correct horse battery'

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`

/** Calls the API from inside the page, so the session cookie and same-origin checks apply as for the SPA. */
const api = <Body>(page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`)
      return response.json()
    },
    { method, path, body }
  ) as Promise<Body>

const register = async (page: Page) => {
  await page.goto('/register')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(`e2e-${unique()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Hi, Ada' })).toBeVisible()
}

/** A signed-in user with a kanban project holding three new issues in its first column. */
const kanbanWithIssues = async (page: Page) => {
  await register(page)
  const key = `B${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Flow ${key}`,
    board_type: 'kanban',
  })
  for (const summary of ['Alpha task', 'Beta task', 'Gamma task'])
    await api(page, 'POST', `/api/projects/${key}/issues`, { summary })
  await page.goto(`/p/${key}/board`)
  return key
}

const column = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

const dragWithMouse = async (page: Page, from: Locator, to: Locator) => {
  const start = await from.boundingBox()
  const end = await to.boundingBox()
  if (!start || !end) throw new Error('nothing to drag')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + 40, { steps: 12 })
  await page.mouse.up()
}

test('drag a card to another column with the mouse; a reload keeps it there', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await expect(column(page, 'To Do')).toContainText('Alpha task')

  const moved = page.waitForResponse((response) =>
    response.url().endsWith(`/issues/1/move`)
  )
  await dragWithMouse(
    page,
    page.getByRole('button', { name: `Drag ${key}-1`, exact: true }),
    column(page, 'In Progress').getByRole('list')
  )

  await expect(column(page, 'In Progress')).toContainText('Alpha task')
  expect((await moved).status()).toBe(200)
  await page.reload()
  await expect(column(page, 'In Progress')).toContainText('Alpha task')
  await expect(column(page, 'To Do')).not.toContainText('Alpha task')
})

test('move a card with the keyboard; a reload keeps the new order', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  const handle = page.getByRole('button', {
    name: `Drag ${key}-1`,
    exact: true,
  })
  await expect(handle).toBeVisible()

  const moved = page.waitForResponse((response) =>
    response.url().endsWith(`/issues/1/move`)
  )
  await handle.focus()
  await page.keyboard.press('Space')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  // dnd-kit's keyboard sensor starts listening for arrows one tick after the pickup.
  await page.waitForTimeout(100)
  await page.keyboard.press('ArrowDown')
  // dnd-kit's live region confirms the card is over its neighbour before the drop.
  await expect(
    page.getByText(`moved over droppable area ${key}-2`)
  ).toBeAttached()
  await page.keyboard.press('Space')
  expect((await moved).status()).toBe(200)

  await page.reload()
  await expect(column(page, 'To Do').getByRole('article')).toHaveText([
    /Beta task/,
    /Alpha task/,
    /Gamma task/,
  ])
})

test('"Only my issues" narrows the board and survives a reload', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  const me = await api<{ id: number }>(page, 'GET', '/api/me')
  await api(page, 'PATCH', `/api/projects/${key}/issues/2`, {
    assignee_id: me.id,
  })
  await page.reload()

  await page.getByRole('button', { name: 'Only my issues' }).click()

  const todo = column(page, 'To Do')
  await expect(todo.getByRole('article')).toHaveCount(1)
  await expect(todo).toContainText('Beta task')
  await expect(page).toHaveURL(/assignee=/)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Only my issues' })
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(todo.getByRole('article')).toHaveCount(1)
})

test('complete the running sprint from the board header, open work back to the backlog', async ({
  page,
}) => {
  await register(page)
  const key = `C${unique().slice(-6).toUpperCase()}`
  await api(page, 'POST', '/api/projects', {
    key,
    name: `Close ${key}`,
    board_type: 'scrum',
  })
  const sprint = await api<{ id: number }>(
    page,
    'POST',
    `/api/projects/${key}/sprints`,
    {}
  )
  for (const summary of ['Alpha task', 'Beta task'])
    await api(page, 'POST', `/api/projects/${key}/issues`, {
      summary,
      sprint_id: sprint.id,
    })
  const today = new Date().toLocaleDateString('sv')
  await api(page, 'POST', `/api/projects/${key}/sprints/${sprint.id}/start`, {
    start_date: today,
    end_date: today,
  })
  await page.goto(`/p/${key}/board`)
  await expect(column(page, 'To Do').getByRole('article')).toHaveCount(2)

  await page.getByRole('button', { name: 'More for Sprint 1' }).click()
  await page.getByRole('menuitem', { name: 'Complete sprint' }).click()
  const complete = page.getByRole('dialog', { name: 'Complete Sprint 1' })
  await expect(complete).toContainText('0 issues done · 2 open')
  await expect(complete.getByRole('radio', { name: 'Backlog' })).toBeChecked()
  await complete.getByRole('button', { name: 'Complete sprint' }).click()

  await expect(complete).toBeHidden()
  await expect(page.getByText('No sprint is running.')).toBeVisible()
  await page.getByRole('link', { name: 'Open backlog' }).click()
  await expect(
    page.getByRole('region', { name: 'Backlog', exact: true })
  ).toContainText('Beta task')
})

type Settings = {
  columns: { id: number; name: string; statuses: { id: number }[] }[]
}

/** Maps a new "In review" status into the In Progress column, beside In Progress. */
const addReviewStatus = async (page: Page, key: string) => {
  const settings = await api<Settings>(
    page,
    'GET',
    `/api/projects/${key}/board/settings`
  )
  const doing = settings.columns.find((each) => each.name === 'In Progress')?.id
  const review = await api<{ id: number }>(
    page,
    'POST',
    `/api/projects/${key}/statuses`,
    { name: 'In review', category: 'in_progress' }
  )
  await api(page, 'PUT', `/api/projects/${key}/statuses/${review.id}`, {
    name: 'In review',
    column_id: doing,
  })
  return review.id
}

test('drop a card on the "In review" zone of a column holding two statuses; a reload keeps that status', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  const review = await addReviewStatus(page, key)
  await page.reload()
  const card = page.getByRole('button', { name: `Drag ${key}-1`, exact: true })
  const start = await card.boundingBox()
  const target = await column(page, 'In Progress').boundingBox()
  if (!start || !target) throw new Error('nothing to drag')

  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + 80, {
    steps: 12,
  })
  const zone = column(page, 'In Progress').getByRole('group', {
    name: 'In review',
  })
  await expect(zone).toBeVisible()
  const box = await zone.boundingBox()
  if (!box) throw new Error('no zone')
  const moved = page.waitForResponse((response) =>
    response.url().endsWith(`/issues/1/move`)
  )
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 6,
  })
  await page.mouse.up()
  const response = await moved
  expect(response.status()).toBe(200)
  expect(response.request().postDataJSON()).toEqual({ status_id: review })

  await page.reload()
  await expect(column(page, 'In Progress')).toContainText('Alpha task')
  await page.getByRole('link', { name: 'Alpha task', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: `${key}-1` }).getByLabel('Status')
  ).toHaveValue(String(review))
})

test('create an issue inline in the Done column; a reload keeps it there', async ({
  page,
}) => {
  await kanbanWithIssues(page)
  const done = column(page, 'Done')

  await done.getByRole('button', { name: 'Create issue' }).click()
  await done.getByLabel('New issue summary').fill('Already shipped')
  await page.keyboard.press('Enter')
  await expect(done).toContainText('Already shipped')

  await page.reload()
  await expect(done).toContainText('Already shipped')
  await expect(column(page, 'To Do')).not.toContainText('Already shipped')
})

test('an admin sets a column limit from its header; a reload keeps it', async ({
  page,
}) => {
  await kanbanWithIssues(page)
  const todo = column(page, 'To Do')

  await todo.getByRole('button', { name: 'Actions for column To Do' }).click()
  await page.getByRole('menuitem', { name: 'Set WIP limit' }).click()
  await todo.getByLabel('WIP limit of To Do').fill('2')
  await page.keyboard.press('Enter')
  await expect(todo.getByTitle('Over the limit of 2')).toHaveText('Max 2')

  await page.reload()
  await expect(todo.getByTitle('Over the limit of 2')).toHaveText('Max 2')
})

test('filter the board by type, label and text; a reload keeps every filter', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await api(page, 'PATCH', `/api/projects/${key}/issues/1`, {
    issue_type: 'bug',
    labels: ['ui'],
  })
  await api(page, 'PATCH', `/api/projects/${key}/issues/2`, {
    issue_type: 'bug',
    labels: ['api'],
  })
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Alpha follow-up',
    issue_type: 'bug',
    labels: ['ui'],
  })
  await page.reload()
  const todo = column(page, 'To Do')

  await page.getByRole('button', { name: 'Type' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Bug' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Label' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'ui' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('searchbox', { name: 'Filter issues' }).fill('follow')

  await expect(todo.getByRole('article')).toHaveCount(1)
  await expect(todo).toContainText('Alpha follow-up')
  await expect(page).toHaveURL(/q=follow/)
  await page.reload()
  await expect(
    page.getByRole('searchbox', { name: 'Filter issues' })
  ).toHaveValue('follow')
  await expect(page.getByRole('button', { name: 'Type' })).toContainText('1')
  await expect(todo.getByRole('article')).toHaveCount(1)
  await expect(todo).toContainText('Alpha follow-up')
})

test('on a phone, the Filters sheet applies a filter', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const key = await kanbanWithIssues(page)
  await api(page, 'PATCH', `/api/projects/${key}/issues/3`, {
    issue_type: 'task',
  })
  await page.reload()

  await page.getByRole('button', { name: 'Filters' }).click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await sheet.getByRole('button', { name: 'Type' }).click()
  await page
    .getByRole('menuitemcheckbox', { name: 'Task', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await sheet.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible()
  const todo = column(page, 'To Do')
  await expect(todo.getByRole('article')).toHaveCount(1)
  await expect(todo).toContainText('Gamma task')
})

test('delete an issue with its subtask from the card menu; a reload shows neither', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await api(page, 'POST', `/api/projects/${key}/issues`, {
    summary: 'Delta step',
    issue_type: 'subtask',
    parent: `${key}-1`,
  })
  await page.reload()
  const todo = column(page, 'To Do')
  await expect(todo).toContainText('Delta step')

  await todo.getByRole('button', { name: `Actions for ${key}-1` }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog', { name: `Delete ${key}-1?` })
  await expect(confirm).toContainText('Also deleted: 1 subtask.')
  const deleted = page.waitForResponse(
    (response) => response.request().method() === 'DELETE'
  )
  await confirm.getByRole('button', { name: 'Delete issue' }).click()
  expect((await deleted).status()).toBe(204)

  await page.reload()
  await expect(todo).toContainText('Beta task')
  await expect(todo).not.toContainText('Alpha task')
  await expect(todo).not.toContainText('Delta step')
})

test('walk the board with j and k, open with Enter, step with j, close with Esc', async ({
  page,
}) => {
  const key = await kanbanWithIssues(page)
  await expect(
    page.getByRole('button', { name: `Drag ${key}-1`, exact: true })
  ).toBeVisible()
  const card = (summary: string) =>
    page.getByRole('link', { name: summary, exact: true })

  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await expect(card('Beta task')).toBeFocused()
  await page.keyboard.press('k')
  await expect(card('Alpha task')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: `${key}-1` })).toBeVisible()
  await expect(page).toHaveURL(`/p/${key}/issues/1`)
  await page.keyboard.press('j')
  const next = page.getByRole('dialog', { name: `${key}-2` })
  await expect(next.getByLabel('Summary')).toHaveValue('Beta task')
  await expect(page).toHaveURL(`/p/${key}/issues/2`)

  await page.keyboard.press('Escape')
  await expect(next).toBeHidden()
  await expect(page).toHaveURL(`/p/${key}/board`)
  await expect(card('Beta task')).toBeFocused()
})
