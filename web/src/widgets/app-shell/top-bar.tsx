import { Suspense, lazy } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { SantiMark } from '@/shared/ui/santi-mark'
import { SidebarTrigger } from '@/shared/ui/sidebar'
import { AccountButton } from './account-button'
import { CommandMenu } from './command-menu'
import { CreateButton } from './create-button'
import { ProjectSearch } from './project-search'

// Lazy: the Radix menu and its popper weigh ~20 KB gzip on every first visit (D39).
const AccountMenu = lazy(() =>
  import('./account-menu').then((module) => ({ default: module.AccountMenu }))
)

export const TopBar = () => {
  const { key } = useParams({ strict: false })

  return (
    <header className='sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-2 sm:px-4'>
      <SidebarTrigger className='size-11 md:size-9' />
      <Link
        to='/'
        className='flex h-11 min-w-11 shrink-0 items-center gap-2 font-semibold'
      >
        <SantiMark className='size-7 text-base' />
        <span className='max-sm:sr-only'>santi</span>
      </Link>
      <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
        {key ? <ProjectSearch projectKey={key} /> : null}
        <CommandMenu showTrigger={!key} />
        <CreateButton />
        <Suspense fallback={<AccountButton disabled />}>
          <AccountMenu />
        </Suspense>
      </div>
    </header>
  )
}
