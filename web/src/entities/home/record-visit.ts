import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { myProjectsQuery } from './home-queries'

/** Called by mounted pages only: a loader also runs on hover preload (D39 amendment). The sidebar reorders after it (UI-61). */
export const useRecordVisit = (key: string) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    void api
      .POST('/api/projects/{key}/visit', { params: { path: { key } } })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: myProjectsQuery.queryKey })
      )
  }, [key, queryClient])
}

export const useRecordView = (key: string, number: number) =>
  useEffect(() => {
    void api.POST('/api/projects/{key}/issues/{number}/view', {
      params: { path: { key, number } },
    })
  }, [key, number])
