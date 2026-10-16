import { useParams, useSearch } from '@tanstack/react-router'
import { IssueOverlay } from '@/widgets/issue-detail/issue-overlay'
import { SearchResults } from '@/widgets/search/search-results'

const ROUTE = '/_authenticated/p/$key/search'

export const SearchPage = () => {
  const { key } = useParams({ from: ROUTE })
  const searchWithoutIssue = useSearch({
    from: ROUTE,
    select: ({ issue: _, ...results }) => results,
    structuralSharing: true,
  })
  const issue = useSearch({ from: ROUTE, select: (each) => each.issue })
  return (
    <div className='flex flex-col gap-3 px-4 py-4 sm:px-6'>
      <h1 className='text-xl font-semibold tracking-tight'>
        Search
        {searchWithoutIssue.q && (
          <span className='font-normal text-muted-foreground'>
            {' '}
            · “{searchWithoutIssue.q}”
          </span>
        )}
      </h1>
      <SearchResults projectKey={key} search={searchWithoutIssue} />
      <IssueOverlay projectKey={key} issue={issue} />
    </div>
  )
}
