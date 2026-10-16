import type { ReactNode } from 'react'
import { SantiMark } from '@/shared/ui/santi-mark'

export const AuthLayout = ({ children }: { children: ReactNode }) => (
  <main className='mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-6 px-4 py-8'>
    <div className='flex items-center justify-center gap-2'>
      <SantiMark />
      <span className='text-xl font-semibold'>santi</span>
    </div>
    {children}
  </main>
)
