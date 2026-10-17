import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { SprintHistory } from '@/widgets/reports/sprint-history'
import {
  VelocityChart,
  VelocitySkeleton,
} from '@/widgets/reports/velocity-chart'
import { velocityQuery } from '@/entities/report/report-queries'
import { LoadFailed } from '@/shared/ui/load-failed'

const VelocityBox = ({ projectKey }: { projectKey: string }) => {
  const velocity = useQuery(velocityQuery(projectKey))
  if (velocity.isError)
    return (
      <LoadFailed
        message="Couldn't load velocity."
        onRetry={() => void velocity.refetch()}
      />
    )
  if (!velocity.data) return <VelocitySkeleton />
  return <VelocityChart velocity={velocity.data} />
}

export const ReportsPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key/reports/' })
  return (
    <div className='mx-auto flex w-full max-w-[68.75rem] flex-col gap-6 px-4 py-4 sm:px-6'>
      <h1 className='text-xl font-semibold tracking-tight'>Reports</h1>
      <section aria-labelledby='velocity-title' className='grid gap-2'>
        <h2
          id='velocity-title'
          className='text-sm font-semibold text-muted-foreground'
        >
          Velocity
        </h2>
        <VelocityBox projectKey={key} />
      </section>
      <SprintHistory projectKey={key} />
    </div>
  )
}
