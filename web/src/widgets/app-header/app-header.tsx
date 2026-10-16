import { Link } from '@tanstack/react-router'
import { SignOutButton } from '@/features/auth/sign-out-button'
import { SantiMark } from '@/shared/ui/santi-mark'

// ponytail: mark + sign out only; the sidebar shell from the template lands with the board screens.
export const AppHeader = () => (
  <header className='flex h-14 items-center justify-between border-b bg-sidebar px-4'>
    <Link to='/' className='flex items-center gap-2 font-semibold'>
      <SantiMark className='size-7 text-base' />
      santi
    </Link>
    <SignOutButton />
  </header>
)
