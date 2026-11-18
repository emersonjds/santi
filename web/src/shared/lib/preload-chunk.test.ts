import { expect, it, vi } from 'vitest'
import { preloadOnce } from './preload-chunk'

it('shares one load, and tries again once a load fails', async () => {
  const load = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('chunk')
  const preload = preloadOnce(load)

  await expect(preload()).rejects.toThrow('offline')
  await expect(preload()).resolves.toBe('chunk')
  await expect(preload()).resolves.toBe('chunk')
  expect(load).toHaveBeenCalledTimes(2)
})
