import { useEffect } from 'react'
import { api } from '@/shared/api/client'

/** Called by mounted pages only: a loader also runs on hover preload (D39 amendment). */
export const useRecordVisit = (key: string) =>
  useEffect(() => {
    void api.POST('/api/projects/{key}/visit', { params: { path: { key } } })
  }, [key])

export const useRecordView = (key: string, number: number) =>
  useEffect(() => {
    void api.POST('/api/projects/{key}/issues/{number}/view', {
      params: { path: { key, number } },
    })
  }, [key, number])
