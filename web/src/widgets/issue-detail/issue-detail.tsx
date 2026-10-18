import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  Suspense,
  lazy,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Link2 } from 'lucide-react'
import {
  MarkdownReady,
  MarkdownView,
} from '@/features/rich-text/lazy-markdown-view'
import { RichTextField } from '@/features/rich-text/rich-text-field'
import { useRecordView } from '@/entities/home/record-visit'
import { TypeGlyph } from '@/entities/issue/issue-glyphs'
import { useEditIssue } from '@/entities/issue/issue-mutations'
import { issueQuery } from '@/entities/issue/issue-queries'
import { mayDelete } from '@/entities/issue/may-delete'
import { membersQuery, projectQuery } from '@/entities/project/project-queries'
import { ARCHIVED_NOTE, useProjectWritable } from '@/entities/project/writable'
import { WriteLock } from '@/entities/project/write-lock'
import { sessionQuery } from '@/entities/session/session-query'
import { type Issue, fieldMessage } from '@/shared/api/client'
import { useReadOnly } from '@/shared/lib/read-only'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'
import { CommitInput } from '@/shared/ui/commit-input'
import { Skeleton } from '@/shared/ui/skeleton'
import { IssueComments } from './issue-comments'
import { IssueFields } from './issue-fields'
import { IssueSubtasks } from './issue-subtasks'

type IssueProps = { issue: Issue; projectKey: string }

// Lazy: the menu chunk would push the issue page past its D39 budget.
const IssueMenu = lazy(() =>
  import('./issue-menu').then((module) => ({ default: module.IssueMenu }))
)

const DeleteIssueDialog = lazy(() =>
  import('@/features/delete-issue/delete-issue-dialog').then((module) => ({
    default: module.DeleteIssueDialog,
  }))
)

const issueLink = (projectKey: string, number: number) =>
  new URL(`/p/${projectKey}/issues/${number}`, location.origin).href

const copyLink = (projectKey: string, number: number) =>
  navigator.clipboard?.writeText(issueLink(projectKey, number)).then(
    () => toast.success('Link copied'),
    () => toast.error("Couldn't copy the link")
  )

const Heading = ({
  issue,
  projectKey,
  actions,
}: IssueProps & { actions?: ReactNode }) => (
  <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
    {issue.parent_key && (
      <>
        <Link
          to='/p/$key/issues/$number'
          params={{
            key: projectKey,
            number: issue.parent_key.slice(issue.parent_key.indexOf('-') + 1),
          }}
          className='tabular-nums hover:underline'
        >
          {issue.parent_key}
        </Link>
        <span aria-hidden='true'>/</span>
      </>
    )}
    <TypeGlyph type={issue.issue_type} />
    <span className='tracking-wide tabular-nums'>{issue.key}</span>
    <span className='ms-auto flex items-center gap-1'>
      <Button
        variant='ghost'
        className='h-11 md:h-8'
        onClick={() => void copyLink(projectKey, issue.number)}
      >
        <Link2 />
        Copy link
      </Button>
      {actions}
    </span>
  </div>
)

const Summary = ({ issue, projectKey }: IssueProps) => {
  const edit = useEditIssue(projectKey, issue)
  return (
    <div className='grid gap-1'>
      <CommitInput
        aria-label='Summary'
        required
        maxLength={255}
        className='-ms-2.25 h-auto border-transparent px-2 py-1 text-xl font-semibold shadow-none hover:border-input read-only:hover:border-transparent max-md:min-h-11 md:text-xl'
        value={issue.summary}
        onCommit={(summary) =>
          edit.mutate({ change: { summary }, shown: { summary } })
        }
      />
      {edit.error && (
        <p className='text-sm text-destructive'>{fieldMessage(edit.error)}</p>
      )}
    </div>
  )
}

/** Q7: the mention picker lists the assignee, then the reporter, first. */
const peopleOf = ({ assignee_id, reporter_id }: Issue) =>
  assignee_id == null ? [reporter_id] : [assignee_id, reporter_id]

const Description = ({ issue, projectKey }: IssueProps) => {
  const edit = useEditIssue(projectKey, issue)
  const { data: members = [] } = useQuery(membersQuery(projectKey))
  const locked = Boolean(useReadOnly())
  const [draft, setDraft] = useState<string | null>(null)

  const save = (event?: FormEvent) => {
    event?.preventDefault()
    if (draft === null || edit.isPending) return
    if (draft === issue.description) return setDraft(null)
    edit.mutate(
      { change: { description: draft }, shown: { description: draft } },
      { onSuccess: () => setDraft(null) }
    )
  }

  // Q6: a click on the text opens the editor, except on a link, a chip or a text selection.
  const openFromText = (event: MouseEvent) => {
    if (
      locked ||
      (event.target instanceof Element &&
        event.target.closest('a, [data-mention]')) ||
      getSelection()?.toString()
    )
      return
    setDraft(issue.description)
  }

  return (
    <section aria-labelledby='issue-description' className='grid gap-2'>
      <h3 id='issue-description' className='text-sm font-semibold'>
        Description
      </h3>
      {draft === null ? (
        <>
          <div onClick={openFromText}>
            {issue.description ? (
              <MarkdownView source={issue.description} members={members} />
            ) : (
              <p className='text-sm text-subtle-foreground'>
                No description yet.
              </p>
            )}
          </div>
          <Button
            variant='outline'
            className='h-11 justify-self-start md:h-8'
            onClick={() => setDraft(issue.description)}
          >
            Edit description
          </Button>
        </>
      ) : (
        <form onSubmit={save} className='grid gap-2'>
          <RichTextField
            label='Description'
            placeholder='Add a description…'
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={save}
            onCancel={() => setDraft(null)}
            readOnly={edit.isPending}
            members={members}
            firstIds={peopleOf(issue)}
          />
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
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {edit.error && (
        <p className='text-sm text-destructive'>{fieldMessage(edit.error)}</p>
      )}
    </section>
  )
}

const DetailSkeleton = () => (
  <div aria-busy='true' className='grid gap-4'>
    <Skeleton className='h-5 w-40' />
    <Skeleton className='h-9 w-3/4' />
    <Skeleton className='h-24 w-full' />
  </div>
)

const PARENTS_OF_SUBTASKS = new Set(['story', 'task', 'bug'])

type IssueDetailProps = {
  projectKey: string
  number: number
  /** Extra header buttons, like "Open as page" in the dialog. */
  actions?: ReactNode
  /** Where the view goes once its issue is deleted. */
  onDeleted: () => void
}

/** The issue view (IA §6), the same in the dialog and on the full page. */
export const IssueDetail = ({
  projectKey,
  number,
  actions,
  onDeleted,
}: IssueDetailProps) => {
  useRecordView(projectKey, number)
  const { data: issue, error } = useQuery(issueQuery(projectKey, number))
  const { data: project } = useQuery(projectQuery(projectKey))
  const { data: me } = useQuery(sessionQuery)
  const writable = useProjectWritable(projectKey)
  const [deleting, setDeleting] = useState(false)
  if (error)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {`Couldn't open ${projectKey}-${number}: ${error.message}`}
      </p>
    )
  if (!issue) return <DetailSkeleton />

  return (
    <Suspense fallback={<DetailSkeleton />}>
      <MarkdownReady>
        <div
          data-issue-view
          className='grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_19rem]'
        >
          <div className='grid min-w-0 content-start gap-6'>
            <div className='grid gap-2'>
              <Heading
                issue={issue}
                projectKey={projectKey}
                actions={
                  <>
                    {actions}
                    {mayDelete(project, me, issue.reporter_id) && (
                      <Suspense
                        fallback={<span className='block size-11 md:size-8' />}
                      >
                        <IssueMenu
                          note={writable ? undefined : ARCHIVED_NOTE}
                          onDelete={() => setDeleting(true)}
                        />
                      </Suspense>
                    )}
                  </>
                }
              />
              <WriteLock projectKey={projectKey}>
                <Summary issue={issue} projectKey={projectKey} />
              </WriteLock>
            </div>
            <WriteLock projectKey={projectKey}>
              <Description issue={issue} projectKey={projectKey} />
              {PARENTS_OF_SUBTASKS.has(issue.issue_type) && (
                <IssueSubtasks issue={issue} projectKey={projectKey} />
              )}
              <IssueComments
                projectKey={projectKey}
                number={number}
                firstIds={peopleOf(issue)}
              />
            </WriteLock>
          </div>
          <WriteLock projectKey={projectKey}>
            <IssueFields issue={issue} projectKey={projectKey} />
          </WriteLock>
          {deleting && (
            <Suspense fallback={null}>
              <DeleteIssueDialog
                projectKey={projectKey}
                issueKey={issue.key}
                issueType={issue.issue_type}
                onClose={() => setDeleting(false)}
                onDeleted={onDeleted}
              />
            </Suspense>
          )}
        </div>
      </MarkdownReady>
    </Suspense>
  )
}
