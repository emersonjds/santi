import type { Project, User } from '@/shared/api/client'

/** D40, the server's rule: admins delete any issue, members the ones they reported. */
export const mayDelete = (
  project: Pick<Project, 'role'> | undefined,
  me: Pick<User, 'id'> | null | undefined,
  reporterId: number
) => project?.role === 'admin' || me?.id === reporterId
