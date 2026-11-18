import { type ReactNode, Suspense, lazy, useEffect } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { switchLanguage, useT } from '@/shared/i18n/i18n'
import { applyTheme } from '@/shared/lib/theme'
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { messages } from './messages'
import { TopBar } from './top-bar'
import { TourHost } from './tour-host'

// Lazy: toasts only follow a user action, long after first paint.
const Toaster = lazy(() =>
  import('@/shared/ui/sonner').then((module) => ({ default: module.Toaster }))
)

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const t = useT(messages)
  useEffect(() => applyTheme(user.theme), [user.theme])
  useEffect(
    () => void switchLanguage(user.language).catch(() => {}),
    [user.language]
  )

  return (
    <SidebarProvider>
      <a
        href='#content'
        className='sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:start-2 focus:top-2'
      >
        {t('skipToContent')}
      </a>
      <AppSidebar />
      <SidebarInset className='min-w-0'>
        <TopBar />
        <main
          id='content'
          tabIndex={-1}
          className='flex min-w-0 flex-1 flex-col outline-none'
        >
          {children}
        </main>
      </SidebarInset>
      <TourHost />
      <Suspense>
        <Toaster position='bottom-right' />
      </Suspense>
    </SidebarProvider>
  )
}
