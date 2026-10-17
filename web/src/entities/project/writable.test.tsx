import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { WEB, stubApi } from '@/test/stub-api'
import { useProjectWritable } from './writable'

const Probe = () => <p>{useProjectWritable('WEB') ? 'open' : 'locked'}</p>

describe('useProjectWritable', () => {
  it('stays locked until the project says it is not archived', async () => {
    let answer = () => {}
    const until = new Promise<void>((resolve) => (answer = resolve))
    stubApi({
      'GET /api/projects/WEB': { status: 200, body: WEB, until },
    })
    const screen = await render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>
    )

    await expect.element(screen.getByText('locked')).toBeVisible()
    answer()
    await expect.element(screen.getByText('open')).toBeVisible()
  })
})
