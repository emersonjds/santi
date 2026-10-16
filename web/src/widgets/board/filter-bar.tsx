import { type ReactNode, Suspense, lazy, useState } from 'react'
import { type BoardSearch, countFilters } from '@/entities/issue/board-query'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import {
  AssigneeToggles,
  ClearFilters,
  EpicFilter,
  LabelFilter,
  OnlyMineToggle,
  RecentToggle,
  TOGGLE,
  TextFilter,
  TypeFilter,
} from './filter-controls'

const FilterSheet = lazy(() =>
  import('./filter-sheet').then((module) => ({ default: module.FilterSheet }))
)

type FilterBarProps = {
  projectKey: string
  search: BoardSearch
  /** Board and backlog filter by text; on search, `q` is the query itself. */
  text?: boolean
  /** Page-specific filters (search: status), drawn before Clear. */
  children?: ReactNode
  /** How many of those page-specific filters are on. */
  pageFilters?: number
}

/** D18: every filter lives in the page URL; R-5: one row on desktop, a bottom sheet on a phone. */
export const FilterBar = ({
  projectKey,
  search,
  text = false,
  children,
  pageFilters = 0,
}: FilterBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const count =
    countFilters(text ? search : { ...search, q: undefined }) + pageFilters
  const props = { projectKey, search }
  const secondary = (
    <>
      <LabelFilter {...props} />
      <EpicFilter {...props} />
      <RecentToggle search={search} />
      {children}
    </>
  )
  const clear = count > 0 && <ClearFilters count={count} keepText={!text} />

  return (
    <>
      <div
        role='group'
        aria-label='Filters'
        className='hidden min-w-0 items-center gap-2 md:flex'
      >
        {text && <TextFilter q={search.q} />}
        <AssigneeToggles {...props} />
        <OnlyMineToggle search={search} />
        <TypeFilter search={search} />
        <div className='hidden xl:contents'>{secondary}</div>
        <Popover>
          <PopoverTrigger className={`${TOGGLE} xl:hidden`}>
            More filters
          </PopoverTrigger>
          <PopoverContent
            align='start'
            className='flex w-auto flex-col items-start gap-2 p-2'
          >
            {secondary}
          </PopoverContent>
        </Popover>
        {clear}
      </div>
      <button
        type='button'
        className={`${TOGGLE} self-start md:hidden`}
        onClick={() => setSheetOpen(true)}
      >
        Filters{count > 0 && ` (${count})`}
      </button>
      {sheetOpen && (
        <Suspense>
          <FilterSheet open onOpenChange={setSheetOpen}>
            {text && <TextFilter q={search.q} />}
            <AssigneeToggles {...props} />
            <OnlyMineToggle search={search} />
            <TypeFilter search={search} />
            {secondary}
            {clear}
          </FilterSheet>
        </Suspense>
      )}
    </>
  )
}
