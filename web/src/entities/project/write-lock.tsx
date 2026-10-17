import type { ReactNode } from 'react'
import { ReadOnly } from '@/shared/lib/read-only'
import { ARCHIVED_NOTE, useProjectWritable } from './writable'

export const WriteLock = ({
  projectKey,
  children,
}: {
  projectKey: string
  children: ReactNode
}) => (
  <ReadOnly value={useProjectWritable(projectKey) ? undefined : ARCHIVED_NOTE}>
    {children}
  </ReadOnly>
)
