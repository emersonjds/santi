import { formatPoints } from '@/entities/report/report-queries'
import type { Velocity } from '@/shared/api/client'
import { Disclosure } from '@/shared/ui/disclosure'
import { Skeleton } from '@/shared/ui/skeleton'

/** One height for the chart, its empty state and its skeleton (CLS 0, D39). */
const FRAME = 'min-h-76 rounded-md border bg-card p-3'

// viewBox units per sprint and of height; one unit draws as 1.6px, so a sprint is 4rem wide.
const SLOT = 40
const HEIGHT = 100
const PLOT = 90

export const VelocitySkeleton = () => (
  <Skeleton role='status' aria-label='Loading velocity' className='h-76' />
)

const Swatch = ({ className }: { className: string }) => (
  <span aria-hidden='true' className={`size-2.5 rounded-sm ${className}`} />
)

const VelocityTable = ({ velocity }: { velocity: Velocity }) => (
  <table className='mb-3 w-full text-sm'>
    <caption className='pb-2 text-start text-xs text-muted-foreground'>
      Velocity by sprint
    </caption>
    <thead>
      <tr className='border-b text-xs text-muted-foreground'>
        <th scope='col' className='py-1 text-start font-medium'>
          Sprint
        </th>
        <th scope='col' className='py-1 text-end font-medium'>
          Committed
        </th>
        <th scope='col' className='py-1 text-end font-medium'>
          Completed
        </th>
      </tr>
    </thead>
    <tbody className='tabular-nums'>
      {velocity.sprints.map(({ sprint, committed, completed }) => (
        <tr key={sprint.id} className='border-b'>
          <th scope='row' className='py-1 text-start font-normal'>
            {sprint.name}
          </th>
          <td className='py-1 text-end'>{formatPoints(committed)}</td>
          <td className='py-1 text-end'>{formatPoints(completed)}</td>
        </tr>
      ))}
    </tbody>
    <tfoot className='tabular-nums'>
      <tr>
        <th scope='row' className='py-1 text-start font-medium'>
          Average
        </th>
        <td />
        <td className='py-1 text-end font-medium'>
          {formatPoints(velocity.average_completed)}
        </td>
      </tr>
    </tfoot>
  </table>
)

/** RP-23 velocity: committed and completed bars per closed sprint, oldest first, and the average of completed. */
export const VelocityChart = ({ velocity }: { velocity: Velocity }) => {
  const { sprints, average_completed: average } = velocity
  if (sprints.length === 0)
    return (
      <p
        className={`${FRAME} grid place-content-center text-sm text-muted-foreground`}
      >
        No sprint has finished yet.
      </p>
    )

  const highest = Math.max(
    1,
    average ?? 0,
    ...sprints.flatMap(({ committed, completed }) => [
      committed ?? 0,
      completed ?? 0,
    ])
  )
  const top = (points: number) => HEIGHT - (points / highest) * PLOT
  const width = `${sprints.length * 4}rem`

  return (
    <div className={`${FRAME} grid content-start gap-2`}>
      <p className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
        <span className='inline-flex items-center gap-1.5'>
          <Swatch className='bg-muted-foreground/40' />
          Committed
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <Swatch className='bg-primary' />
          Completed
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span
            aria-hidden='true'
            className='w-4 border-t-2 border-dashed border-foreground'
          />
          Average {formatPoints(average)}
        </span>
      </p>
      <div className='overflow-x-auto'>
        <svg
          aria-hidden='true'
          className='h-40'
          style={{ width }}
          viewBox={`0 0 ${sprints.length * SLOT} ${HEIGHT}`}
          preserveAspectRatio='none'
        >
          {sprints.map(({ sprint, committed, completed }, index) => (
            <g key={sprint.id}>
              <rect
                className='fill-muted-foreground/40'
                x={index * SLOT + 8}
                y={top(committed ?? 0)}
                width={11}
                height={HEIGHT - top(committed ?? 0)}
              />
              <rect
                className='fill-primary'
                x={index * SLOT + 21}
                y={top(completed ?? 0)}
                width={11}
                height={HEIGHT - top(completed ?? 0)}
              />
            </g>
          ))}
          <line
            className='stroke-border'
            x1={0}
            x2={sprints.length * SLOT}
            y1={HEIGHT}
            y2={HEIGHT}
            vectorEffect='non-scaling-stroke'
          />
          {average != null && (
            <line
              className='stroke-foreground'
              x1={0}
              x2={sprints.length * SLOT}
              y1={top(average)}
              y2={top(average)}
              strokeDasharray='4 3'
              vectorEffect='non-scaling-stroke'
            />
          )}
        </svg>
        <div
          aria-hidden='true'
          className='grid text-center text-xs text-muted-foreground'
          style={{
            width,
            gridTemplateColumns: `repeat(${sprints.length}, minmax(0, 1fr))`,
          }}
        >
          {sprints.map(({ sprint }) => (
            <span key={sprint.id} className='truncate px-1'>
              {sprint.name}
            </span>
          ))}
        </div>
      </div>
      <Disclosure title='View as table'>
        <VelocityTable velocity={velocity} />
      </Disclosure>
    </div>
  )
}
