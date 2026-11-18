import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import {
  projectQuery,
  projectsQuery,
  sprintsQuery,
} from '@/entities/project/project-queries'
import { type BoardType, type Project, api } from '@/shared/api/client'
import { lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { toast } from '@/shared/lib/toast'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'

const TYPES = [
  { type: 'scrum', label: 'Scrum', help: 'Sprints, a backlog and reports.' },
  {
    type: 'kanban',
    label: 'Kanban',
    help: 'One continuous board, no sprints.',
  },
] as const

const LABEL = { scrum: 'Scrum', kanban: 'Kanban' } as const
const STALE = 'urn:santi:error:board-type-changed'
const SIZE = 'h-11 md:h-9'
const FULL_SCREEN_ON_PHONE =
  'max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:content-start max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0'

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** SAN-224: admins switch the board between Scrum and Kanban; sprints stay, limits and the done window go. */
export const BoardTypeControl = ({ project }: { project: Project }) => {
  const queryClient = useQueryClient()
  const note = useReadOnly()
  const options = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  // `type` outlives `open`: the closing dialog keeps its text and hands focus back to that option.
  const [dialog, setDialog] = useState({
    open: false,
    type: project.board_type,
  })
  const [error, setError] = useState<string>()
  const scrum = project.board_type === 'scrum'
  const { data: sprints } = useQuery({
    ...sprintsQuery(project.key),
    enabled: scrum,
  })
  const { data: settings } = useQuery(boardSettingsQuery(project.key))

  const change = useMutation({
    mutationFn: (board_type: BoardType) =>
      api.PATCH('/api/projects/{key}', {
        params: { path: { key: project.key } },
        body: { board_type, expected_board_type: project.board_type },
      }),
    onSuccess: ({ data, error, response }) => {
      if (response.status >= 500)
        return toast.error("Couldn't switch. Try again.")
      setDialog((before) => ({ ...before, open: false }))
      if (response.status === 403)
        return setError('Only a project admin can change the board type.')
      if (error)
        return setError(
          error.type.startsWith(STALE)
            ? 'The board type changed since you loaded this page. Reload to see the current type.'
            : error.detail
        )
      queryClient.setQueryData(projectQuery(project.key).queryKey, data)
      void queryClient.invalidateQueries({
        queryKey: ['projects', project.key],
      })
      void queryClient.invalidateQueries({
        queryKey: projectsQuery.queryKey,
        exact: true,
      })
      void queryClient.invalidateQueries({ queryKey: ['home'] })
      toast.success(`Switched to ${LABEL[data.board_type]}.`)
    },
    onError: () => toast.error("Couldn't switch. Try again."),
  })

  const limits =
    settings?.columns.filter((column) => column.wip_limit != null).length ?? 0
  const days = settings?.done_window_days
  const sprintCount = sprints?.length ?? 0

  return (
    <fieldset className='grid gap-2'>
      <legend className='mb-2 text-sm font-medium'>Board type</legend>
      <div ref={options} className='grid grid-cols-2 gap-2 sm:w-fit'>
        {TYPES.map(({ type, label, help }) => (
          <div key={type} className='grid content-start gap-1'>
            <Button
              type='button'
              variant={type === project.board_type ? 'default' : 'outline'}
              className='h-11 w-full sm:w-36'
              data-type={type}
              aria-pressed={type === project.board_type}
              aria-describedby={`board-type-${type}`}
              onClick={() => {
                if (type === project.board_type) return
                setError(undefined)
                setDialog({ open: true, type })
              }}
              {...lockedButton(note, `board-type-${type}`)}
            >
              {label}
            </Button>
            <p
              id={`board-type-${type}`}
              className='text-xs text-muted-foreground sm:w-36'
            >
              {help}
            </p>
          </div>
        ))}
      </div>
      <RootError message={error} />
      <AlertDialog
        open={dialog.open}
        onOpenChange={(open) =>
          !open && !change.isPending && setDialog({ ...dialog, open })
        }
      >
        <AlertDialogContent
          className={FULL_SCREEN_ON_PHONE}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            title.current?.focus()
          }}
          onEscapeKeyDown={(event) =>
            change.isPending && event.preventDefault()
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            options.current
              ?.querySelector<HTMLElement>(`[data-type=${dialog.type}]`)
              ?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle
              ref={title}
              tabIndex={-1}
              className='outline-none'
            >
              {`Switch to ${LABEL[dialog.type]}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='grid gap-2'>
                {dialog.type === 'kanban' ? (
                  <>
                    <p>
                      Open issues stay where they are and show on one continuous
                      board.
                    </p>
                    {sprintCount > 0 && (
                      <p>
                        {`${plural(sprintCount, 'sprint', 'sprints')} and their reports stay as history, hidden until you switch back to Scrum.`}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p>Open issues move to the backlog.</p>
                    {limits > 0 && (
                      <p>
                        {`${plural(limits, 'column limit is', 'column limits are')} cleared.`}
                      </p>
                    )}
                    {days != null && (
                      <p>{`Hiding done work after ${days} days turns off.`}</p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={SIZE} disabled={change.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              className={SIZE}
              disabled={change.isPending}
              onClick={() => change.mutate(dialog.type)}
            >
              {change.isPending && <Loader2 className='animate-spin' />}
              {change.isPending
                ? 'Switching…'
                : `Switch to ${LABEL[dialog.type]}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  )
}
