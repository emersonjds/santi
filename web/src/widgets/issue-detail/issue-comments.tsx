import {
  type FormEvent,
  type RefObject,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { MarkdownView } from '@/features/rich-text/lazy-markdown-view'
import { RichTextField } from '@/features/rich-text/rich-text-field'
import { commentTime, fullDateTime } from '@/entities/issue/comment-time'
import { useAddComment, useEditComment } from '@/entities/issue/issue-mutations'
import { commentsQuery } from '@/entities/issue/issue-queries'
import { mayDelete } from '@/entities/issue/may-delete'
import { membersQuery, projectQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { PersonName, UserAvatar } from '@/entities/user/user-avatar'
import { type Comment, type Member, fieldMessage } from '@/shared/api/client'
import { quickRepliesOn } from '@/shared/config/quick-replies'
import { LOCKED, lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

// Lazy, like the issue menu: the dropdown and the dialog stay out of the issue page's first load (D39).
const CommentMenu = lazy(() =>
  import('./comment-menu').then((module) => ({ default: module.CommentMenu }))
)

const DeleteCommentDialog = lazy(() =>
  import('@/features/delete-comment/delete-comment-dialog').then((module) => ({
    default: module.DeleteCommentDialog,
  }))
)

const QUICK_REPLIES = [
  'Looks good to me',
  'Thanks!',
  'Can you say more?',
  "I'll take a look.",
]

const NO_MEMBERS: Member[] = []

const HIGHLIGHT_MS = 3000

const MENU_SLOT = <span className='-my-3 block size-11 md:-my-1.5 md:size-8' />

const commentLink = (projectKey: string, number: number, id: number) =>
  new URL(`/p/${projectKey}/issues/${number}#comment-${id}`, location.origin)
    .href

/** Gives the focus to `ref` once `closed` turns true after the returned `arm()`. */
const useFocusOnClose = (
  ref: RefObject<HTMLButtonElement | null>,
  closed: boolean
) => {
  const armed = useRef(false)
  useEffect(() => {
    if (!closed || !armed.current) return
    armed.current = false
    ref.current?.focus()
  }, [ref, closed])
  return () => {
    armed.current = true
  }
}

type ThreadProps = {
  projectKey: string
  number: number
  members: Member[]
  /** Listed first in the mention picker. */
  firstIds: number[]
}

const Composer = ({
  projectKey,
  number,
  members,
  firstIds,
  quickReplies,
  note,
}: ThreadProps & { quickReplies: boolean; note: string | undefined }) => {
  const { data: me } = useQuery(sessionQuery)
  const add = useAddComment(
    projectKey,
    number,
    me?.id ?? 0,
    me?.display_name ?? ''
  )
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [round, setRound] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const armTrigger = useFocusOnClose(trigger, !open)

  const collapse = () => {
    armTrigger()
    setDraft('')
    setOpen(false)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const body = draft.trimEnd()
    if (!body.trim()) return
    collapse()
    add.mutate(body, {
      onError: () => {
        setDraft(body)
        setOpen(true)
      },
    })
  }

  // A chip remounts the field, so it takes the focus with the caret at the end.
  const fill = (text: string) => {
    setDraft(text)
    setOpen(true)
    setRound((count) => count + 1)
  }

  return (
    <div className='grid gap-2'>
      {open ? (
        <form onSubmit={submit} className='grid gap-2'>
          <RichTextField
            key={round}
            label='Add a comment'
            keyShortcut='m'
            placeholder='Add a comment…'
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            onCancel={collapse}
            members={members}
            firstIds={firstIds}
          />
          <div className='flex gap-2'>
            <Button className='h-11 md:h-8'>Save</Button>
            <Button
              type='button'
              variant='ghost'
              className='h-11 md:h-8'
              onClick={collapse}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          ref={trigger}
          type='button'
          aria-keyshortcuts='m'
          className={cn(
            'flex h-11 w-full items-center rounded-md border border-input bg-transparent px-3 text-start text-base text-muted-foreground shadow-xs outline-none hover:bg-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-9 md:text-sm dark:bg-input/30',
            LOCKED
          )}
          onClick={() => setOpen(true)}
          {...lockedButton(note)}
        >
          Add a comment…
          <kbd
            aria-hidden='true'
            className='ms-auto hidden rounded border px-1.5 font-mono text-xs md:inline-block'
          >
            M
          </kbd>
        </button>
      )}
      {quickReplies && !draft && (
        <div
          role='group'
          aria-label='Quick replies'
          className='flex gap-2 overflow-x-auto'
        >
          {QUICK_REPLIES.map((text) => (
            <button
              key={text}
              type='button'
              className={cn(
                'h-11 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring md:h-8',
                LOCKED
              )}
              onClick={() => fill(text)}
              {...lockedButton(note)}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type CommentItemProps = ThreadProps & {
  comment: Comment
  nameOf: (userId: number) => string | undefined
  writable: boolean
  note: string | undefined
  editing: boolean
  onEditing: (editing: boolean) => void
  highlighted: boolean
}

const CommentItem = ({
  projectKey,
  number,
  members,
  firstIds,
  comment,
  nameOf,
  writable,
  note,
  editing,
  onEditing,
  highlighted,
}: CommentItemProps) => {
  const edit = useEditComment(projectKey, number)
  const [draft, setDraft] = useState(comment.body)
  const [deleting, setDeleting] = useState(false)
  const item = useRef<HTMLLIElement>(null)
  const menu = useRef<HTMLButtonElement>(null)
  const armMenu = useFocusOnClose(menu, !editing)
  const author = nameOf(comment.author_id) ?? 'Former member'

  const open = () => {
    edit.reset()
    setDraft(comment.body)
    onEditing(true)
  }

  const close = () => {
    armMenu()
    onEditing(false)
  }

  const save = (event?: FormEvent) => {
    event?.preventDefault()
    if (edit.isPending) return
    const body = draft.trimEnd()
    if (body === comment.body) return close()
    edit.mutate({ id: comment.id, body }, { onSuccess: close })
  }

  const cancel = () => {
    if (!edit.isPending) close()
  }

  const copy = () =>
    navigator.clipboard
      ?.writeText(commentLink(projectKey, number, comment.id))
      .then(
        () => toast.success('Link copied'),
        () => toast.error("Couldn't copy the link")
      )

  const nextFocus = () => {
    const actions = (element: Element | null | undefined) =>
      element?.querySelector<HTMLElement>('[aria-label="Comment actions"]')
    return (
      actions(item.current?.nextElementSibling) ??
      actions(item.current?.previousElementSibling) ??
      item.current
        ?.closest('section')
        ?.querySelector<HTMLElement>('[aria-keyshortcuts="m"]') ??
      null
    )
  }

  return (
    <li
      ref={item}
      id={`comment-${comment.id}`}
      className={cn(
        'group -mx-2 rounded-md px-2 motion-safe:transition-colors motion-safe:duration-500',
        highlighted && 'bg-muted'
      )}
    >
      <article className='flex gap-3'>
        <UserAvatar name={author} />
        <div className='grid min-w-0 flex-1 gap-1.5'>
          <div className='flex items-start gap-2'>
            <p className='min-w-0 flex-1 text-sm'>
              <PersonName name={author} className='font-medium' />{' '}
              <time
                dateTime={comment.created_at}
                title={fullDateTime(comment.created_at)}
                className='text-xs text-subtle-foreground'
              >
                {commentTime(comment.created_at)}
              </time>
              {comment.edited_at && (
                <>
                  {' '}
                  <span
                    className='text-xs text-subtle-foreground'
                    title={`Edited by ${
                      (comment.edited_by_id != null &&
                        nameOf(comment.edited_by_id)) ||
                      comment.edited_by_name
                    } · ${fullDateTime(comment.edited_at)}`}
                  >
                    (edited)
                  </span>
                </>
              )}
            </p>
            {comment.id < 0 ? (
              MENU_SLOT
            ) : (
              <Suspense fallback={MENU_SLOT}>
                <span className='-my-3 md:-my-1.5'>
                  <CommentMenu
                    ref={menu}
                    hidden={editing}
                    writable={writable}
                    note={note}
                    onEdit={open}
                    onCopy={() => void copy()}
                    onDelete={() => setDeleting(true)}
                  />
                </span>
              </Suspense>
            )}
          </div>
          {editing ? (
            <form onSubmit={save} className='grid gap-2'>
              <RichTextField
                label='Edit comment'
                placeholder='Add a comment…'
                autoFocus
                value={draft}
                onChange={setDraft}
                onSubmit={save}
                onCancel={cancel}
                readOnly={edit.isPending}
                members={members}
                firstIds={firstIds}
              />
              {edit.error && (
                <p className='text-sm text-destructive'>
                  {fieldMessage(edit.error)}
                </p>
              )}
              <div className='flex gap-2'>
                <Button
                  className='h-11 md:h-8'
                  disabled={edit.isPending}
                  aria-busy={edit.isPending}
                >
                  Save
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  className='h-11 md:h-8'
                  onClick={cancel}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className='leading-relaxed'>
              <MarkdownView source={comment.body} members={members} />
            </div>
          )}
        </div>
      </article>
      {deleting && (
        <Suspense fallback={null}>
          <DeleteCommentDialog
            projectKey={projectKey}
            number={number}
            commentId={comment.id}
            nextFocus={nextFocus}
            onClose={() => setDeleting(false)}
          />
        </Suspense>
      )}
    </li>
  )
}

/** The comment whose id is the URL hash: scrolled into view and highlighted for 3 s (SAN-136 Q7). */
const useArrival = (comments: Comment[] | undefined) => {
  const hash = useLocation({ select: (location) => location.hash })
  const [highlighted, setHighlighted] = useState<string>()
  const arrived = useRef('')

  // The page may still be hidden (legal check, Suspense) when the thread arrives: wait until it shows.
  useEffect(() => {
    if (!comments || !hash.startsWith('comment-') || arrived.current === hash)
      return
    const target = document.getElementById(hash)
    if (!target) return
    const shown = new ResizeObserver(() => {
      if (!(target.checkVisibility?.() ?? target.offsetParent !== null))
        return
      shown.disconnect()
      arrived.current = hash
      target.scrollIntoView({ block: 'center' })
      setHighlighted(hash)
    })
    shown.observe(target)
    return () => shown.disconnect()
  }, [comments, hash])

  useEffect(() => {
    if (!highlighted) return
    const timer = setTimeout(() => setHighlighted(undefined), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [highlighted])

  return highlighted
}

type IssueCommentsProps = {
  projectKey: string
  number: number
  firstIds: number[]
}

export const IssueComments = ({
  projectKey,
  number,
  firstIds,
}: IssueCommentsProps) => {
  const { data: comments } = useQuery(commentsQuery(projectKey, number))
  const { data: members = NO_MEMBERS } = useQuery(membersQuery(projectKey))
  const { data: project } = useQuery(projectQuery(projectKey))
  const { data: me } = useQuery(sessionQuery)
  const note = useReadOnly()
  const [editing, setEditing] = useState<number | null>(null)
  const editingId = comments?.some((comment) => comment.id === editing)
    ? editing
    : null
  const highlighted = useArrival(comments)
  const nameOf = (userId: number) =>
    members.find((member) => member.user_id === userId)?.display_name
  const thread = { projectKey, number, members, firstIds }

  return (
    <section aria-labelledby='issue-comments' className='grid gap-3'>
      <h3 id='issue-comments' className='text-sm font-semibold'>
        Comments
      </h3>
      {comments?.length === 0 && (
        <p className='text-sm text-subtle-foreground'>No comments yet.</p>
      )}
      {comments && comments.length > 0 && (
        <ol className='grid gap-4 md:gap-5'>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              {...thread}
              comment={comment}
              nameOf={nameOf}
              writable={mayDelete(project, me, comment.author_id)}
              note={note}
              editing={editingId === comment.id}
              onEditing={(on) => setEditing(on ? comment.id : null)}
              highlighted={highlighted === `comment-${comment.id}`}
            />
          ))}
        </ol>
      )}
      <Composer
        {...thread}
        note={note}
        quickReplies={editingId === null && quickRepliesOn(import.meta.env)}
      />
    </section>
  )
}
