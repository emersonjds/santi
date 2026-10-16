import { createFileRoute } from '@tanstack/react-router'
import { ImportPage } from '@/pages/import/import-page'

export const Route = createFileRoute('/_authenticated/p/$key/settings/import')({
  component: ImportPage,
})
