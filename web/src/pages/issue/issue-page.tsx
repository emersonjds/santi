import { useNavigate, useParams } from '@tanstack/react-router'
import { IssueDetail } from '@/widgets/issue-detail/issue-detail'

const ROUTE = '/_authenticated/p/$key/issues/$number'

export const IssuePage = () => {
  const { key, number } = useParams({ from: ROUTE })
  const navigate = useNavigate()
  return (
    <section
      aria-label='Issue'
      className='mx-auto w-full max-w-5xl px-4 py-6 sm:px-6'
    >
      <IssueDetail
        projectKey={key}
        number={Number(number)}
        onDeleted={() => void navigate({ to: '/p/$key', params: { key } })}
      />
    </section>
  )
}
