import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Input } from '@/shared/ui/input'

export const ProjectSearch = ({ projectKey }: { projectKey: string }) => {
  const navigate = useNavigate()
  const label = `Search ${projectKey}`

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const q = String(new FormData(event.currentTarget).get('q'))
    void navigate({
      to: '/p/$key/search',
      params: { key: projectKey },
      search: { q },
    })
  }

  return (
    <form
      role='search'
      onSubmit={search}
      // ui-layout 375px: a search button that opens the field across the bar.
      className='relative min-w-0 flex-1 max-sm:size-11 max-sm:flex-none max-sm:focus-within:absolute max-sm:focus-within:inset-x-2 max-sm:focus-within:top-1.5 max-sm:focus-within:z-20 max-sm:focus-within:size-auto sm:max-w-64'
    >
      <Search
        aria-hidden='true'
        className='pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground sm:start-2.5'
      />
      <Input
        type='search'
        name='q'
        aria-label={label}
        aria-keyshortcuts='/'
        placeholder={label}
        className='h-11 bg-background ps-8 text-base max-sm:cursor-pointer max-sm:placeholder:text-transparent max-sm:focus:ps-10 max-sm:focus:placeholder:text-subtle-foreground md:h-9 md:text-sm'
      />
    </form>
  )
}
