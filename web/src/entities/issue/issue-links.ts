import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  type CreateLink,
  type IssueLink,
  type Relation,
  api,
  dataOrThrow,
  okOrThrow,
} from '@/shared/api/client'
import { backlogKey } from './backlog-query'
import { boardsKey } from './board-query'

/** SAN-157: the fixed group order, each relation read from the issue on screen. */
export const RELATIONS = {
  blocks: 'blocks',
  is_blocked_by: 'is blocked by',
  relates: 'relates to',
  duplicates: 'duplicates',
  is_duplicated_by: 'is duplicated by',
  clones: 'clones',
  is_cloned_by: 'is cloned by',
} satisfies Record<Relation, string>

const LINKS = ['links'] as const

export const projectOf = (issueKey: string) =>
  issueKey.slice(0, issueKey.lastIndexOf('-'))

export const linksQuery = (projectKey: string, number: number) =>
  queryOptions({
    queryKey: [...LINKS, `${projectKey}-${number}`],
    queryFn: async () =>
      dataOrThrow(
        await api.GET('/api/projects/{key}/issues/{number}/links', {
          params: { path: { key: projectKey, number } },
        })
      ),
  })

// ponytail: one request per project the viewer belongs to; a cross-project search endpoint replaces it when the list grows long.
export const linkCandidatesQuery = (projectKeys: string[], q: string) =>
  queryOptions({
    queryKey: ['link-candidates', projectKeys, q],
    queryFn: async () =>
      (
        await Promise.all(
          projectKeys.map(
            async (key) =>
              dataOrThrow(
                await api.GET('/api/projects/{key}/issues', {
                  params: { path: { key }, query: { q, limit: 10 } },
                })
              ).items
          )
        )
      ).flat(),
    enabled: q !== '',
  })

/** Both ends' link lists, and the blocked markers on both projects' boards and backlogs. */
const useRefreshLinks = () => {
  const queryClient = useQueryClient()
  return (...projectKeys: string[]) =>
    Promise.all(
      [
        LINKS,
        ...projectKeys.flatMap((key) => [boardsKey(key), backlogKey(key)]),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    )
}

export const useCreateLink = (projectKey: string, number: number) => {
  const refresh = useRefreshLinks()
  return useMutation({
    mutationFn: async (body: CreateLink) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/issues/{number}/links', {
          params: { path: { key: projectKey, number } },
          body,
        })
      ),
    onSuccess: (link) => refresh(projectKey, projectOf(link.issue.key)),
  })
}

/** D37: the row leaves at once and comes back if the server refuses. */
export const useRemoveLink = (projectKey: string, number: number) => {
  const queryClient = useQueryClient()
  const refresh = useRefreshLinks()
  const { queryKey } = linksQuery(projectKey, number)
  return useMutation({
    mutationFn: async (link: IssueLink) =>
      okOrThrow(
        await api.DELETE('/api/projects/{key}/issues/{number}/links/{id}', {
          params: { path: { key: projectKey, number, id: link.id } },
        })
      ),
    onMutate: async (link) => {
      await queryClient.cancelQueries({ queryKey })
      const before = queryClient.getQueryData(queryKey)
      queryClient.setQueryData(queryKey, (links) =>
        links?.filter((each) => each.id !== link.id)
      )
      return before
    },
    onError: (_error, _link, before) =>
      queryClient.setQueryData(queryKey, before),
    onSettled: (_result, _error, link) =>
      refresh(projectKey, projectOf(link.issue.key)),
  })
}
