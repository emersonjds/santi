import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { WEB, stubApi } from '@/test/stub-api'
import { useProjectWritable } from './writable'

const Probe = () => <p>{useProjectWritable('WEB') ? 'open' : 'locked'}</p>

describe('useProjectWritable', () => {
  it('stays locked until the project says it is not archived', async () => {
    const reply = Promise.withResolvers<void>()
    stubApi({
      'GET /api/projects/WEB': { status: 200, body: WEB, until: reply.promise },
    })
    const screen = await render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>
    )

    await expect.element(screen.getByText('locked')).toBeVisible()
    reply.resolve()
    await expect.element(screen.getByText('open')).toBeVisible()
  })
})
