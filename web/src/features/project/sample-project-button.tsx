import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Sparkles } from 'lucide-react'
import { myProjectsQuery } from '@/entities/home/home-queries'
import { projectQuery, projectsQuery } from '@/entities/project/project-queries'
import { api, dataOrThrow } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'

/** Creates the caller's sample project, or opens it when it already exists. */
export const SampleProjectButton = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const start = useMutation({
    mutationFn: async () => dataOrThrow(await api.POST('/api/sample-project')),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectQuery(project.key).queryKey, project)
      await Promise.all(
        [projectsQuery.queryKey, myProjectsQuery.queryKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
      await navigate({ to: '/p/$key/board', params: { key: project.key } })
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Button
      variant='outline'
      className='h-11'
      disabled={start.isPending}
      onClick={() => start.mutate()}
    >
      {start.isPending ? <Loader2 className='animate-spin' /> : <Sparkles />}
      Start with a sample project
    </Button>
  )
}
