import { type ReactNode, useState } from 'react'
import type { OpenedByState } from '@/features/project/member-controls'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { RootError } from '@/shared/ui/root-error'
import { useLifecycle } from './use-lifecycle'

const SIZE = 'h-11 md:h-9'

type ProjectProps = OpenedByState & { projectKey: string; projectName: string }

export const ArchiveProjectButton = ({
  projectKey,
  projectName,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: ProjectProps) => {
  const archive = useLifecycle(projectKey, 'archive')
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next)
        if (!next) archive.reset()
      }}
    >
      {open === undefined && (
        <AlertDialogTrigger asChild>
          <Button variant='outline' className={SIZE}>
            Archive
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Archive ${projectName}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            It becomes read-only for everyone and leaves the sidebar and the
            lists. Admins find it under Projects, Archived, and can unarchive
            it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RootError message={archive.error?.message} />
        <AlertDialogFooter>
          <AlertDialogCancel className={SIZE}>Cancel</AlertDialogCancel>
          <Button
            className={SIZE}
            disabled={archive.isPending}
            onClick={() => archive.mutate()}
          >
            Archive project
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type TypeKeyDialogProps = OpenedByState & {
  projectKey: string
  action: 'trash' | 'purge'
  trigger: ReactNode
  title: string
  description: string
  confirm: string
}

/** OR-58: trash and purge both ask for the project key. */
const TypeKeyDialog = ({
  projectKey,
  action,
  trigger,
  title,
  description,
  confirm,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: TypeKeyDialogProps) => {
  const [typed, setTyped] = useState('')
  const change = useLifecycle(projectKey, action)
  const id = `${action}-${projectKey}`
  const matches = typed === projectKey

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next)
        if (next) return
        setTyped('')
        change.reset()
      }}
    >
      {open === undefined && (
        <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      )}
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          id={id}
          className='grid gap-1.5'
          onSubmit={(event) => {
            event.preventDefault()
            if (matches) change.mutate()
          }}
        >
          <Label htmlFor={`${id}-key`}>{`Type ${projectKey} to confirm`}</Label>
          <Input
            id={`${id}-key`}
            autoComplete='off'
            autoCapitalize='characters'
            spellCheck={false}
            className='h-11 text-base md:h-9 md:text-sm'
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-invalid={change.isError}
          />
          <RootError message={change.error?.message} />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel className={SIZE}>Cancel</AlertDialogCancel>
          <Button
            type='submit'
            form={id}
            variant='destructive'
            className={SIZE}
            disabled={change.isPending || !matches}
          >
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export const TrashProjectButton = ({
  projectKey,
  projectName,
  ...state
}: ProjectProps) => (
  <TypeKeyDialog
    {...state}
    projectKey={projectKey}
    action='trash'
    trigger={
      <Button variant='destructive' className={SIZE}>
        Delete project
      </Button>
    }
    title={`Delete ${projectName}?`}
    description='It moves to the trash for 60 days and nobody can open it. Restore it from Projects, Trash; after 60 days it is deleted for good with its issues.'
    confirm='Delete project'
  />
)

export const PurgeProjectButton = ({
  projectKey,
  projectName,
}: ProjectProps) => (
  <TypeKeyDialog
    projectKey={projectKey}
    action='purge'
    trigger={
      <Button
        variant='ghost'
        className={`${SIZE} text-destructive`}
        aria-label={`Delete ${projectName} forever`}
      >
        Delete forever
      </Button>
    }
    title={`Delete ${projectName} forever?`}
    description="Its issues, sprints and comments are deleted now. This can't be undone."
    confirm='Delete forever'
  />
)
