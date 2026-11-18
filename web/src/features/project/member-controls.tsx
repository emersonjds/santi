import { Suspense, lazy, useRef, useState } from 'react'
import { ROLE_LABEL } from '@/entities/project/labels'
import {
  type Member,
  type MemberRole,
  api,
  dataOrThrow,
} from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { NativeSelect } from '@/shared/ui/native-select'
import { RootError } from '@/shared/ui/root-error'
import { useMembersWrite } from './use-members-write'

type ControlProps = { projectKey: string; member: Member; locked: boolean }

export const RoleSelect = ({ projectKey, member, locked }: ControlProps) => {
  const change = useMembersWrite(
    projectKey,
    member,
    'step down',
    async (role: MemberRole) =>
      dataOrThrow(
        await api.PUT('/api/projects/{key}/members/{user_id}', {
          params: { path: { key: projectKey, user_id: member.user_id } },
          body: { role },
        })
      )
  )
  return (
    <>
      <NativeSelect
        aria-label={`Role of ${member.display_name}`}
        value={member.role}
        disabled={locked || change.isPending}
        onChange={(event) =>
          change.mutate(event.target.value === 'admin' ? 'admin' : 'member')
        }
      >
        {(['admin', 'member'] as const).map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </NativeSelect>
      {change.error && (
        <span className='basis-full'>
          <RootError message={change.error.message} />
        </span>
      )}
    </>
  )
}

type ExitCopy = {
  trigger: string
  label?: string
  title: string
  description: string
  confirm: string
}

/** A menu opens the dialog by state: no trigger, and the focus goes back where the menu says. */
export type OpenedByState = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (event: Event) => void
}

export type ExitProps = ControlProps &
  OpenedByState & { copy: ExitCopy; describedBy?: string }

// Lazy: the confirmation and its Radix dialog load on the first press (D39).
const MemberExitDialog = lazy(() =>
  import('./member-exit-dialog').then((module) => ({
    default: module.MemberExitDialog,
  }))
)

const MemberExitButton = ({
  locked,
  copy,
  describedBy,
  onOpenChange,
  onCloseAutoFocus,
  ...props
}: ExitProps) => {
  const [ownOpen, setOwnOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const open = props.open ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  return (
    <>
      {props.open === undefined && (
        <Button
          ref={trigger}
          variant='outline'
          className='h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:h-9'
          aria-disabled={locked || undefined}
          aria-haspopup='dialog'
          aria-expanded={open}
          onClick={() => locked || setOpen(true)}
          aria-label={copy.label}
          aria-describedby={describedBy}
        >
          {copy.trigger}
        </Button>
      )}
      {open && (
        <Suspense fallback={null}>
          <MemberExitDialog
            {...props}
            copy={copy}
            onClose={() => setOpen(false)}
            onCloseAutoFocus={
              onCloseAutoFocus ??
              ((event) => {
                event.preventDefault()
                trigger.current?.focus()
              })
            }
          />
        </Suspense>
      )}
    </>
  )
}

export const RemoveMemberButton = (props: ControlProps) => (
  <MemberExitButton
    {...props}
    copy={{
      trigger: 'Remove',
      label: `Remove ${props.member.display_name}`,
      title: `Remove ${props.member.display_name}?`,
      description:
        'They lose access to this project. Issues they reported or hold stay as they are.',
      confirm: 'Remove member',
    }}
  />
)

/** The danger zone and the sidebar: `member` is the caller; the last admin is `locked`, with the reason at `describedBy`. */
export const LeaveProjectButton = (
  props: ControlProps & OpenedByState & { describedBy?: string }
) => (
  <MemberExitButton
    {...props}
    copy={{
      trigger: 'Leave project',
      title: 'Leave this project?',
      description:
        'You lose access until an admin invites you again. Issues you reported or hold stay as they are.',
      confirm: 'Leave project',
    }}
  />
)
