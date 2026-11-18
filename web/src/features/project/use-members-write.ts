import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  membersQuery,
  projectQuery,
  projectsQuery,
} from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import type { Member } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'

/** Members, and the project itself: an admin who steps down loses the admin pages, one who leaves the project. */
export const useMembersWrite = <Variables>(
  projectKey: string,
  member: Member,
  own: 'leave' | 'step down',
  write: (variables: Variables) => Promise<unknown>
) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: me } = useQuery(sessionQuery)
  const refresh = () =>
    Promise.all([
      ...[
        membersQuery(projectKey),
        projectQuery(projectKey),
        projectsQuery,
      ].map(({ queryKey }) =>
        queryClient.invalidateQueries({ queryKey, exact: true })
      ),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
    ])

  const afterOwnChange = async () => {
    const name =
      queryClient.getQueryData(projectQuery(projectKey).queryKey)?.name ??
      queryClient
        .getQueryData(projectsQuery.queryKey)
        ?.find((project) => project.key === projectKey)?.name ??
      projectKey
    if (own === 'leave') {
      await navigate({ to: '/' })
      queryClient.removeQueries({ queryKey: projectQuery(projectKey).queryKey })
      await refresh()
      return toast.success(`You left ${name}.`)
    }
    await navigate({ to: '/p/$key/board', params: { key: projectKey } })
    await refresh()
    toast.success(`You are a member of ${name} now.`)
  }

  return useMutation({
    mutationFn: write,
    onSuccess: () => (me?.id === member.user_id ? afterOwnChange() : refresh()),
  })
}
