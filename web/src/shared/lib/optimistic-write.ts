import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from './toast'

type OptimisticWrite<View, Variables> = {
  /** The caches patched at once and rolled back on failure. */
  queryKey: QueryKey
  /** Other views the write changes, refetched once it settles. */
  refresh?: QueryKey[]
  write: (variables: Variables) => Promise<unknown>
  change: (view: View, variables: Variables) => View
  failure: (variables: Variables) => string
}

/** D37 optimistic write. */
export const useOptimisticWrite = <View, Variables>({
  queryKey,
  refresh,
  write,
  change,
  failure,
}: OptimisticWrite<View, Variables>) => {
  const queryClient = useQueryClient()
  const laterWritePending = () =>
    queryClient.isMutating({ mutationKey: queryKey }) > 1
  return useMutation({
    mutationKey: queryKey,
    mutationFn: write,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey })
      const snapshot = queryClient.getQueriesData<View>({ queryKey })
      queryClient.setQueriesData<View>(
        { queryKey },
        (view) => view && change(view, variables)
      )
      return snapshot
    },
    onError: (error, variables, snapshot) => {
      // A fresh object: the drag layer drops its pending order once the view it was made for changes.
      for (const [key, view] of snapshot ?? [])
        queryClient.setQueryData(key, view && { ...view })
      toast.error(failure(variables), { description: error.message })
    },
    onSettled: () =>
      laterWritePending() ||
      Promise.all(
        [queryKey, ...(refresh ?? [])].map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        )
      ),
  })
}
