import { type ReactNode, useId, useState } from 'react'
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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/ui/command'
import { LoadFailed } from '@/shared/ui/load-failed'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
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

type SprintPickerProps = {
  sprints: SprintTotals[]
  current?: string
  onPick: (sprintId: number) => void
}

const SprintPicker = ({ sprints, current, onPick }: SprintPickerProps) => {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          aria-haspopup='listbox'
          className='h-11 min-w-0 flex-1 justify-between sm:w-64 sm:flex-none md:h-9'
        >
          <span className='truncate'>
            <span className='sr-only'>Choose sprint: </span>
            {current}
          </span>
          <ChevronsUpDown aria-hidden='true' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        collisionPadding={16}
        className='w-72 max-w-[calc(100vw-2rem)] p-0'
      >
        <Command>
          <CommandInput
            aria-label='Find a sprint'
            placeholder='Find a sprint'
            className='text-base md:text-sm'
          />
          <CommandList>
            <CommandEmpty>No sprints match.</CommandEmpty>
            {sprints.map(({ sprint }) => (
              <CommandItem
                key={sprint.id}
                value={`${sprint.name} ${sprint.id}`}
                onSelect={() => {
                  setOpen(false)
                  onPick(sprint.id)
                }}
                className='min-h-11 md:min-h-8'
              >
                <span className='truncate'>{sprint.name}</span>
                {sprint.state === 'active' && <InProgress />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
  const neighbors = report.data ?? neighborsIn(sprints, sprintId)
  const current =
    report.data?.sprint.name ??
    sprints.find(({ sprint }) => sprint.id === sprintId)?.sprint.name
  const open = (id: number) =>
    void navigate({
      to: '/p/$key/reports/$id',
      params: { key: projectKey, id: String(id) },
    })
  const shown = !report.isPlaceholderData && report.data

  return (
    <>
      <div className='flex items-center gap-2'>
        <SprintPicker sprints={sprints} current={current} onPick={open} />
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
      ) : !report.data ? (
        <ReportSkeleton />
      ) : (
        <>
          <ReportHeader report={report.data} />
          {report.data.groups.map((group) => (
            <ReportGroupSection
              key={`${report.data.sprint.id}-${group.outcome}`}
              group={group}
              projectKey={projectKey}
            />
          ))}
        </>
      )}
    </>
  )
}
