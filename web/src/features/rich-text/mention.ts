import type { Member } from '@/shared/api/client'

/** D50: one cap, in characters, for a description and a comment body. */
export const MAX_RICH_TEXT = 65_536

const TOKEN = /^\[@((?:\\.|[^\\[\]])*)\]\(mention:(\d+)\)$/
const MENTION_URL = /^mention:(\d+)$/

/** D50: `[@Display Name](mention:<user_id>)`, with `[`, `]` and `\` escaped. */
export const mentionToken = ({
  user_id,
  display_name,
}: Pick<Member, 'user_id' | 'display_name'>) =>
  `[@${display_name.replace(/[\\[\]]/g, '\\$&')}](mention:${user_id})`

export const parseMention = (token: string) => {
  const match = TOKEN.exec(token)
  if (!match) return null
  return {
    userId: Number(match[2]),
    name: match[1].replace(/\\(.)/g, '$1'),
  }
}

export const mentionUserId = (href: string) => {
  const match = MENTION_URL.exec(href)
  return match ? Number(match[1]) : null
}
