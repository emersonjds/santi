import { useQuery } from '@tanstack/react-query'
import { projectQuery } from './project-queries'

/** The archived banner's text, which every locked control points at. */
export const ARCHIVED_NOTE = 'archived-note'

/** SAN-70: an archived project answers every write with 409, so its pages offer none. */
export const useProjectWritable = (projectKey: string) =>
  useQuery(projectQuery(projectKey)).data?.state !== 'archived'
