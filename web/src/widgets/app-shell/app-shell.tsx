import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider } from '@/shared/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { TopBar } from './top-bar'

export const AppShell = ({ children }: { children: ReactNode }) => (
  <SidebarProvider>
    <a
      href='#content'
      className='sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:start-2 focus:top-2'
    >
      Skip to content
    </a>
    <AppSidebar />
    <SidebarInset>
      <TopBar />
      <main id='content' className='flex min-w-0 flex-1 flex-col'>
        {children}
      </main>
    </SidebarInset>
  </SidebarProvider>
)
