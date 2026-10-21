import type { Member, MemberRole } from '@/shared/api/client'

export const LAST_ADMIN =
  'You are the last admin: make another member admin first, or delete the project.'

export const LAST_ADMIN_SHORT = 'You are the last admin'

/** SAN-70: the caller's membership, and whether they are the project's last admin, who can't leave. */
export const leaveRules = (
  role: MemberRole,
  members: Member[] | undefined,
  userId: number | undefined
) => ({
  own: members?.find((member) => member.user_id === userId),
  lastAdmin:
    role === 'admin' &&
    members?.filter((member) => member.role === 'admin').length === 1,
})
