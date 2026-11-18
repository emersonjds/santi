import { beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { renderApp } from '@/test/render-app'
import {
  MEMBERS,
  WEB,
  WEB_SETTINGS,
  inProjects,
  problem,
  routeOf,
} from '@/test/stub-api'

const HINT = 'Links and issue keys with WEB keep working after you change it.'
const RULE =
  'Keys are 2 to 10 characters: a capital letter, then capital letters or digits.'

const bodiesOf = (requests: Request[], route: string) =>
  Promise.all(
    requests
      .filter((request) => routeOf(request) === route)
      .map((request) => request.clone().json())
  )

const held = () => {
  let release = () => {}
  const until = new Promise<void>((resolve) => (release = resolve))
  return { until, release: () => release() }
}

const conflict = (code: string, detail: string) => ({
  ...problem(409, detail),
  type: `urn:santi:error:${code}`,
})

const general = () => page.getByRole('region', { name: 'General' })
const keyField = () => general().getByRole('textbox', { name: 'Project key' })
const save = () => general().getByRole('button', { name: /^Sav/ })

describe('project settings: General (SAN-225)', () => {
  beforeEach(() => page.viewport(1280, 800))

  it('shows admins the name and key; members do not get the section', async () => {
    inProjects()
    const { screen, router } = await renderApp('/p/WEB/settings')

    await expect
      .element(general().getByRole('textbox', { name: 'Project name' }))
      .toHaveValue('Website')
    await expect.element(keyField()).toHaveValue('WEB')
    await expect.element(save()).toBeDisabled()
    expect(general().getByText(HINT).elements()).toHaveLength(1)
    await expect.element(general().getByText(HINT)).not.toBeVisible()
    expect(
      general().getByRole('heading', { name: 'Previous keys' }).elements()
    ).toHaveLength(0)

    await router.navigate({ to: '/p/$key/settings', params: { key: 'OPS' } })
    await expect
      .element(screen.getByRole('region', { name: 'Danger zone' }))
      .toBeVisible()
    expect(
      screen.getByRole('region', { name: 'General' }).elements()
    ).toHaveLength(0)
  })

  it('renames the project and says Saved.', async () => {
    const reply = held()
    const requests = inProjects({
      'PATCH /api/projects/WEB': {
        status: 200,
        body: { ...WEB, name: 'Site' },
        until: reply.until,
      },
    })
    await renderApp('/p/WEB/settings')

    await general().getByRole('textbox', { name: 'Project name' }).fill('Site')
    await save().click()
    await expect.element(save()).toHaveTextContent('Saving…')
    await expect.element(save()).toBeDisabled()
    reply.release()

    await expect
      .element(page.getByText('Saved.', { exact: true }))
      .toBeVisible()
    await expect.element(save()).toHaveTextContent('Save')
    await expect.element(save()).toBeDisabled()
    expect(await bodiesOf(requests, 'PATCH /api/projects/WEB')).toEqual([
      { name: 'Site' },
    ])
  })

  it('changes the key: toast, the URL moves, the old key is listed', async () => {
    const renamed = { ...WEB, key: 'SITE', previous_keys: ['WEB'] }
    const requests = inProjects({
      'PATCH /api/projects/WEB': { status: 200, body: renamed },
      'GET /api/projects/SITE': { status: 200, body: renamed },
      'GET /api/projects/SITE/members': { status: 200, body: MEMBERS },
      'GET /api/projects/SITE/board/settings': {
        status: 200,
        body: WEB_SETTINGS,
      },
      'POST /api/projects/SITE/visit': { status: 204 },
    })
    const { router } = await renderApp('/p/WEB/settings')

    await keyField().click()
    await expect.element(general().getByText(HINT)).toBeVisible()
    await keyField().fill('SITE')
    await save().click()

    await expect
      .element(page.getByText("Saved. SITE is now the project's key."))
      .toBeVisible()
    await expect
      .poll(() => router.state.location.pathname)
      .toBe('/p/SITE/settings')
    await expect
      .element(general().getByRole('list', { name: 'Previous keys' }))
      .toHaveTextContent('WEB')
    await expect.element(keyField()).toHaveValue('SITE')
    expect(await bodiesOf(requests, 'PATCH /api/projects/WEB')).toEqual([
      { key: 'SITE' },
    ])
  })

  it('puts a taken or previous key error on the Key field, focused, typed value kept', async () => {
    let attempt = 0
    inProjects({
      'PATCH /api/projects/WEB': {
        status: 409,
        body: () =>
          ++attempt === 1
            ? conflict('project-key-taken', "OPS is already Operations's key.")
            : conflict(
                'project-key-alias',
                "OLD is a previous key of Operations. Ask that project's admin to remove it before you can use it."
              ),
      },
    })
    await renderApp('/p/WEB/settings')

    await keyField().fill('OPS')
    await save().click()
    const alert = general().getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent("OPS is already Operations's key.")
    await expect.element(keyField()).toHaveFocus()
    await expect.element(keyField()).toHaveValue('OPS')
    await expect
      .element(keyField())
      .toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(alert.element().id)
      )

    await keyField().fill('OLD')
    await save().click()
    await expect
      .element(general().getByRole('alert'))
      .toHaveTextContent('OLD is a previous key of Operations.')
  })

  it('shows the format rule from a 422 on the Key field', async () => {
    inProjects({
      'PATCH /api/projects/WEB': {
        status: 422,
        body: problem(422, 'Invalid input.', [{ field: 'key', message: RULE }]),
      },
    })
    await renderApp('/p/WEB/settings')

    await keyField().fill('web')
    await save().click()

    await expect.element(general().getByRole('alert')).toHaveTextContent(RULE)
    await expect.element(keyField()).toHaveValue('web')
  })

  it('says only admins may change it on 403, and toasts a server failure', async () => {
    let attempt = 0
    inProjects({
      'PATCH /api/projects/WEB': {
        status: 403,
        body: () => {
          attempt += 1
          return problem(403, 'Forbidden.')
        },
      },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await general().getByRole('textbox', { name: 'Project name' }).fill('Site')
    await save().click()
    await expect
      .element(general().getByRole('alert'))
      .toHaveTextContent('Only a project admin can change the name or key.')
    expect(attempt).toBe(1)

    inProjects({
      'PATCH /api/projects/WEB': { status: 500, body: problem(500, 'Boom') },
    })
    await save().click()
    await expect
      .element(screen.getByText("Couldn't save. Try again."))
      .toBeVisible()
    await expect
      .element(general().getByRole('textbox', { name: 'Project name' }))
      .toHaveValue('Site')
  })

  it('is read-only on an archived project', async () => {
    inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, state: 'archived', previous_keys: ['OLD'] },
      },
    })
    await renderApp('/p/WEB/settings')

    await expect
      .element(general().getByRole('textbox', { name: 'Project name' }))
      .toHaveAttribute('readonly')
    await expect.element(keyField()).toHaveAttribute('readonly')
    expect(save().elements()).toHaveLength(0)
    await expect
      .element(general().getByRole('button', { name: 'Remove OLD' }))
      .toHaveAttribute('aria-disabled', 'true')
  })

  it('removes previous keys, moving focus to the next Remove, then the heading', async () => {
    const requests = inProjects({
      'GET /api/projects/WEB': {
        status: 200,
        body: { ...WEB, previous_keys: ['OLD', 'PRE'] },
      },
      'DELETE /api/projects/WEB/aliases/OLD': { status: 204 },
      'DELETE /api/projects/WEB/aliases/PRE': { status: 204 },
    })
    const { screen } = await renderApp('/p/WEB/settings')

    await general().getByRole('button', { name: 'Remove OLD' }).click()
    await expect
      .element(
        screen.getByText("Removed OLD. It's free for other projects now.")
      )
      .toBeVisible()
    await expect
      .element(general().getByRole('button', { name: 'Remove PRE' }))
      .toHaveFocus()
    expect(
      general().getByRole('button', { name: 'Remove OLD' }).elements()
    ).toHaveLength(0)

    await general().getByRole('button', { name: 'Remove PRE' }).click()
    await expect
      .element(general().getByRole('heading', { name: 'General' }))
      .toHaveFocus()
    expect(
      general().getByRole('list', { name: 'Previous keys' }).elements()
    ).toHaveLength(0)
    expect(
      requests.filter((request) => request.method === 'DELETE').map(routeOf)
    ).toEqual([
      'DELETE /api/projects/WEB/aliases/OLD',
      'DELETE /api/projects/WEB/aliases/PRE',
    ])
  })

  it('moves a URL with a previous key to the current one, keeping the path and search', async () => {
    inProjects({
      'GET /api/projects/OLD': {
        status: 200,
        body: { ...WEB, previous_keys: ['OLD'] },
      },
      'GET /api/projects/OLD/members': { status: 200, body: MEMBERS },
      'GET /api/projects/OLD/board/settings': {
        status: 200,
        body: WEB_SETTINGS,
      },
    })
    const { router } = await renderApp('/p/OLD/settings/members?from=mail')

    await expect
      .poll(() => router.state.location.href)
      .toBe('/p/WEB/settings/members?from=mail')
    expect(router.history.length).toBe(1)
  })
})
