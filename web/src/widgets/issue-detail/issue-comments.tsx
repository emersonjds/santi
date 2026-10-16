import { type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAddComment } from '@/entities/issue/issue-mutations'
import { commentsQuery } from '@/entities/issue/issue-queries'
import { timeAgo } from '@/entities/issue/time-ago'
import { membersQuery } from '@/entities/project/project-queries'
import { sessionQuery } from '@/entities/session/session-query'
import { PersonName, UserAvatar } from '@/entities/user/user-avatar'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'

type IssueCommentsProps = { projectKey: string; number: number }

export const IssueComments = ({ projectKey, number }: IssueCommentsProps) => {
  const { data: comments = [] } = useQuery(commentsQuery(projectKey, number))
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  const { data: me } = useQuery(sessionQuery)
  const add = useAddComment(projectKey, number, me?.id ?? 0)
  const [draft, setDraft] = useState('')
  const nameOf = (userId: number) =>
    members.find((member) => member.user_id === userId)?.display_name ??
    'Former member'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    setDraft('')
    add.mutate(body, { onError: () => setDraft(body) })
  }

  return (
    <section aria-labelledby='issue-comments' className='grid gap-3'>
      <h3 id='issue-comments' className='text-sm font-semibold'>
        Comments
      </h3>
      <ol className='grid gap-4'>
        {comments.map((comment) => (
          <li key={comment.id}>
            <article className='flex gap-3'>
              <UserAvatar name={nameOf(comment.author_id)} />
              <div className='grid min-w-0 gap-1'>
                <p className='text-sm'>
                  <PersonName
                    name={nameOf(comment.author_id)}
                    className='font-medium'
                  />{' '}
                  <time
                    dateTime={comment.created_at}
                    className='text-xs text-subtle-foreground'
                  >
                    {timeAgo(comment.created_at)}
                  </time>
                </p>
                <p className='text-sm break-words whitespace-pre-wrap'>
                  {comment.body}
                </p>
              </div>
            </article>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className='grid gap-2'>
        <Textarea
          aria-label='Add a comment'
          aria-keyshortcuts='m'
          placeholder='Add a comment…'
          maxLength={20_000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button className='h-11 justify-self-start md:h-9'>Comment</Button>
      </form>
    </section>
  )
}
