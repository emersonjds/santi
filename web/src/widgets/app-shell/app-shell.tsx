import { type ReactNode, Suspense, lazy, useEffect } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { applyTheme } from '@/shared/lib/theme'
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './top-bar'

// Lazy: toasts only follow a user action, long after first paint.
const Toaster = lazy(() =>
  import('@/shared/ui/sonner').then((module) => ({ default: module.Toaster }))
)

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  useEffect(() => applyTheme(user.theme), [user.theme])

  return (
    <SidebarProvider>
      <a
        href='#content'
        className='sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:start-2 focus:top-2'
      >
        Skip to content
      </a>
      <AppSidebar />
      <SidebarInset className='min-w-0'>
        <TopBar />
        <main id='content' className='flex min-w-0 flex-1 flex-col'>
          {children}
        </main>
      </SidebarInset>
      <Suspense>
        <Toaster position='bottom-right' />
      </Suspense>
    </SidebarProvider>
  )
}
