import { createFileRoute } from '@tanstack/react-router'
import { AccountPage } from '@/pages/account/account-page'
import { tokensQuery } from '@/entities/user/api-tokens'

export const Route = createFileRoute('/_authenticated/account')({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(tokensQuery)
  },
  component: AccountPage,
})
