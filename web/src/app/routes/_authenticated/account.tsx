import { createFileRoute } from '@tanstack/react-router'
import { AccountPage } from '@/pages/account/account-page'
import { preloadAccountForms } from '@/pages/account/load-account-forms'
import { tokensQuery } from '@/entities/user/api-tokens'
import { sessionsQuery } from '@/entities/user/sessions'

export const Route = createFileRoute('/_authenticated/account')({
  loader: ({ context: { queryClient } }) => {
    void preloadAccountForms().catch(() => undefined)
    void queryClient.prefetchQuery(tokensQuery)
    void queryClient.prefetchQuery(sessionsQuery)
  },
  component: AccountPage,
})
