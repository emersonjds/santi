import { queryOptions } from '@tanstack/react-query'
import { api, dataOrThrow } from '@/shared/api/client'

/** D45: the instance's legal documents and whether sign-up must accept them. */
export const legalDocumentsQuery = queryOptions({
  queryKey: ['legal'],
  queryFn: async () => dataOrThrow(await api.GET('/api/legal')),
  staleTime: Infinity,
})

/** Whether the signed-in user accepted the current versions. */
export const legalStatusQuery = queryOptions({
  queryKey: ['session', 'legal'],
  queryFn: async () => dataOrThrow(await api.GET('/api/me/legal')),
  staleTime: Infinity,
})

/** Unknown counts as required: a failed fetch never hides the checkboxes. */
export const useLegalRequired = (required: boolean | undefined) =>
  required !== false
