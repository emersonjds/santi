import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/widgets/app-shell/app-shell'
import { LegalGate } from '@/features/legal/legal-gate'
import { requireSession } from '@/entities/session/require-session'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => ({
    user: await requireSession(context.queryClient, location.href),
  }),
  component: () => (
    <AppShell>
      <LegalGate>
        <Outlet />
      </LegalGate>
    </AppShell>
  ),
})
