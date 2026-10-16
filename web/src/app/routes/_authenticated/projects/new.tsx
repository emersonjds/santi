import { createFileRoute } from '@tanstack/react-router'
import { NewProjectPage } from '@/pages/new-project/new-project-page'

export const Route = createFileRoute('/_authenticated/projects/new')({
  component: NewProjectPage,
})
