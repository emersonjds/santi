import { createFileRoute } from '@tanstack/react-router'
import { ResetPage } from '@/pages/reset/reset-page'

export const Route = createFileRoute('/reset/$token')({
  component: ResetPage,
})
