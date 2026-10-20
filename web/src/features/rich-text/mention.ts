import type { Member } from '@/shared/api/client'

/** D50: one cap, in characters, for a description and a comment body. */
export const MAX_RICH_TEXT = 65_536

const MENTION = String.raw`\[@((?:\\.|[^\\[\]])*)\]\(mention:(\d+)\)`
const TOKEN = new RegExp(`^${MENTION}$`)
const TOKENS = new RegExp(MENTION, 'g')
const unescapeName = (name: string) => name.replace(/\\(.)/g, '$1')
const MENTION_URL = /^mention:(\d+)$/
const PUNCTUATION = /[!-/:-@[-`{-~]/g

/** D50: `[@Display Name](mention:<user_id>)`, with every ASCII punctuation mark of the name escaped. */
export const mentionToken = ({
  user_id,
  display_name,
}: Pick<Member, 'user_id' | 'display_name'>) =>
  `[@${display_name.replace(PUNCTUATION, '\\$&')}](mention:${user_id})`

export const parseMention = (token: string) => {
  const match = TOKEN.exec(token)
  if (!match) return null
  return {
    userId: Number(match[2]),
    name: unescapeName(match[1]),
  }
}

export const mentionUserId = (href: string) => {
  const match = MENTION_URL.exec(href)
  return match ? Number(match[1]) : null
}

/** Untrusted Markdown with each mention as `@Name`, for a plain-text excerpt. */
export const mentionsAsText = (markdown: string) =>
  markdown.replace(TOKENS, (_token, name: string) => `@${unescapeName(name)}`)
