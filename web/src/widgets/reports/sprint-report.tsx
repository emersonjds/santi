import {
  type ComponentProps,
  type ReactNode,
  Suspense,
  lazy,
  useId,
} from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import {
  sprintHistoryQuery,
  sprintReportQuery,
} from '@/entities/report/report-queries'
import type { SprintReport, SprintTotals } from '@/shared/api/client'
import { day } from '@/shared/lib/sprint-dates'
import { Button } from '@/shared/ui/button'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Skeleton } from '@/shared/ui/skeleton'
import { ReportGroupSection } from './report-group'
import { InProgress, Total } from './sprint-history'

type Neighbors = Pick<SprintReport, 'newer_sprint_id' | 'older_sprint_id'>

/** The arrows' targets while the report is loading or failed, read from the history list (newest first). */
const neighborsIn = (sprints: SprintTotals[], sprintId: number): Neighbors => {
  const index = sprints.findIndex(({ sprint }) => sprint.id === sprintId)
  if (index < 0) return {}
  return {
    newer_sprint_id: index === 0 ? undefined : sprints[index - 1].sprint.id,
    older_sprint_id: sprints.at(index + 1)?.sprint.id,
  }
}

// Lazy: cmdk and the popover would push this route's first visit past 170 KB (D39).
const SprintPicker = lazy(() =>
  import('./sprint-picker').then((module) => ({
    default: module.SprintPicker,
  }))
)

type PickerButtonProps = ComponentProps<typeof Button> & { current?: string }

/** Spreads its props: the popover trigger hands it its handlers, ref and state. */
const PickerButton = ({ current, ...props }: PickerButtonProps) => (
  <Button
    {...props}
    variant='outline'
    className='h-11 min-w-0 flex-1 justify-between sm:w-64 sm:flex-none md:h-9'
  >
    <span className='truncate'>
      <span className='sr-only'>Choose sprint: </span>
      {current}
    </span>
    <ChevronsUpDown aria-hidden='true' />
  </Button>
)

type StepProps = {
  label: string
  target?: number | null
  onPick: (sprintId: number) => void
  children: ReactNode
}

/** `aria-disabled` rather than `disabled`: the button keeps focus when it reaches the end. */
const Step = ({ label, target, onPick, children }: StepProps) => (
  <Button
    variant='outline'
    size='icon'
    aria-label={label}
    aria-disabled={target == null ? true : undefined}
    className='size-11 shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:size-9'
    onClick={() => target != null && onPick(target)}
  >
    {children}
  </Button>
)

const ReportHeader = ({ report }: { report: SprintReport }) => {
  const titleId = useId()
  const { sprint } = report
  const active = sprint.state === 'active'
  return (
    <section aria-labelledby={titleId} className='grid gap-1 text-sm'>
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        <h1 id={titleId} className='text-xl font-semibold tracking-tight'>
          {sprint.name}
        </h1>
        {active && <InProgress />}
      </div>
      {active && (
        <p className='text-muted-foreground'>Updates as the sprint moves.</p>
      )}
      {sprint.start_date && sprint.end_date && (
        <p className='text-muted-foreground'>
          {day(sprint.start_date)} – {day(sprint.end_date)}
        </p>
      )}
      {sprint.goal && <p>{sprint.goal}</p>}
      <p className='flex gap-4 tabular-nums'>
        <Total label='Committed' points={report.committed} />
        <Total label='Completed' points={report.completed} />
      </p>
    </section>
  )
}

const ReportSkeleton = () => (
  <div role='status' aria-label='Loading report' className='grid gap-6'>
    <Skeleton className='h-20' />
    {[0, 1, 2].map((group) => (
      <Skeleton key={group} className='h-24' />
    ))}
  </div>
)

type SprintReportViewProps = { projectKey: string; sprintId: number }

/** One started sprint's report (D46): picker and arrows on top, then its three groups. */
export const SprintReportView = ({
  projectKey,
  sprintId,
}: SprintReportViewProps) => {
  const navigate = useNavigate()
  const report = useQuery({
    ...sprintReportQuery(projectKey, sprintId),
    placeholderData: keepPreviousData,
  })
  const history = useInfiniteQuery(sprintHistoryQuery(projectKey))
  const sprints = (history.data?.pages ?? []).flatMap((each) => each.items)
  const shown = report.isPlaceholderData ? undefined : report.data
  const neighbors = shown ?? neighborsIn(sprints, sprintId)
  const current =
    shown?.sprint.name ??
    sprints.find(({ sprint }) => sprint.id === sprintId)?.sprint.name
  const open = (id: number) =>
    void navigate({
      to: '/p/$key/reports/$id',
      params: { key: projectKey, id: String(id) },
    })

  return (
    <>
      <div className='flex items-center gap-2'>
        <Suspense fallback={<PickerButton current={current} />}>
          <SprintPicker
            sprints={sprints}
            onPick={open}
            trigger={<PickerButton current={current} />}
          />
        </Suspense>
        <Step
          label='Previous sprint'
          target={neighbors.older_sprint_id}
          onPick={open}
        >
          <ChevronLeft aria-hidden='true' />
        </Step>
        <Step
          label='Next sprint'
          target={neighbors.newer_sprint_id}
          onPick={open}
        >
          <ChevronRight aria-hidden='true' />
        </Step>
      </div>
      <p role='status' className='sr-only'>
        {shown && `Now showing ${shown.sprint.name}`}
      </p>
      {report.isError ? (
        <LoadFailed
          message="Couldn't load this report."
          onRetry={() => void report.refetch()}
        />
      ) : !shown ? (
        <ReportSkeleton />
      ) : (
        <>
          <ReportHeader report={shown} />
          {shown.groups.map((group) => (
            <ReportGroupSection
              key={`${shown.sprint.id}-${group.outcome}`}
              group={group}
              projectKey={projectKey}
            />
          ))}
        </>
      )}
    </>
  )
}
