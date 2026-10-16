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
      className='relative min-w-0 flex-1 sm:max-w-64'
    >
      <Search
        aria-hidden='true'
        className='pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
      />
      <Input
        type='search'
        name='q'
        aria-label={label}
        placeholder={label}
        className='h-11 ps-8 text-base md:h-9 md:text-sm'
      />
    </form>
  )
}
