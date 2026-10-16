import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { projectQuery, projectsQuery } from '@/entities/project/project-queries'
import { api, dataOrThrow, hasStatus } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'

const USED_OR_EXPIRED =
  'This invite link was already used or has expired. Ask for a new one.'

export const JoinProject = ({ token }: { token: string }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const join = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST('/api/invites/{token}/accept', {
          params: { path: { token } },
        })
      ),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectQuery(project.key).queryKey, project)
      await queryClient.invalidateQueries({ queryKey: projectsQuery.queryKey })
      await navigate({ to: '/p/$key', params: { key: project.key } })
    },
  })
  const failure = hasStatus(join.error, 404)
    ? USED_OR_EXPIRED
    : join.error?.message

  return (
    <div className='grid gap-3'>
      <RootError message={failure} />
      <Button
        className='h-11'
        disabled={join.isPending}
        onClick={() => join.mutate()}
      >
        {join.isPending && <Loader2 className='animate-spin' />}
        Join project
      </Button>
    </div>
  )
}
