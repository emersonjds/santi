import type { ReactNode } from 'react'
import Markdown, { type Components, defaultUrlTransform } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { PersonName, UserAvatar } from '@/entities/user/user-avatar'
import type { Member } from '@/shared/api/client'
import { mentionUserId } from './mention'

export type MarkdownViewProps = { source: string; members: Member[] }

const PLUGINS = [remarkGfm, remarkBreaks]

const PROSE = [
  'grid min-w-0 gap-2 text-sm break-words',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5 [&_.contains-task-list]:list-none [&_.contains-task-list]:ps-0',
  '[&_input]:me-1.5 [&_input]:align-middle',
  '[&_blockquote]:border-s-2 [&_blockquote]:ps-3 [&_blockquote]:text-muted-foreground',
  '[&_hr]:border-border',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
  '[&_code]:font-mono [&_code]:text-[0.8125rem] [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1',
  '[&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_th]:border [&_td]:px-2 [&_th]:px-2 [&_td]:py-1 [&_th]:py-1 [&_th]:text-start',
].join(' ')

const LINK = 'text-accent-foreground underline underline-offset-2'

// `mention:` links never get an href; the `a` component below turns them into chips.
const keepMentions = (url: string) =>
  url.startsWith('mention:') ? url : defaultUrlTransform(url)

const SafeLink = ({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) => {
  if (!href) return <span>{children}</span>
  if (new URL(href, location.href).origin === location.origin)
    return (
      <a href={href} className={LINK}>
        {children}
      </a>
    )
  return (
    <a href={href} target='_blank' rel='noopener noreferrer' className={LINK}>
      {children}
    </a>
  )
}

const MentionChip = ({ name }: { name: string }) => (
  <span
    data-mention
    className='inline-flex items-center gap-1 rounded-full bg-accent py-px ps-0.5 pe-2 align-middle font-medium text-accent-foreground'
  >
    <span aria-hidden='true'>
      <UserAvatar name={name} className='size-5' />
    </span>
    <span>
      @<PersonName name={name} />
    </span>
  </span>
)

const componentsFor = (members: Member[]): Components => ({
  a: ({ href = '', children }) => {
    if (!href.startsWith('mention:'))
      return <SafeLink href={href}>{children}</SafeLink>
    const userId = mentionUserId(href)
    const member = members.find((each) => each.user_id === userId)
    return member ? (
      <MentionChip name={member.display_name} />
    ) : (
      <span className='text-muted-foreground'>{children}</span>
    )
  },
  // CSP blocks images from other origins, and a link never loads a tracking pixel.
  img: ({ src, alt }) => (
    <SafeLink href={typeof src === 'string' ? src : ''}>{alt || src}</SafeLink>
  ),
  h1: ({ children }) => <h4 className='text-lg font-semibold'>{children}</h4>,
  h2: ({ children }) => <h5 className='text-base font-semibold'>{children}</h5>,
  h3: ({ children }) => <h6 className='text-sm font-semibold'>{children}</h6>,
  h4: ({ children }) => <h6 className='text-sm font-medium'>{children}</h6>,
  h5: ({ children }) => <h6 className='text-sm font-medium'>{children}</h6>,
  h6: ({ children }) => <h6 className='text-sm font-medium'>{children}</h6>,
})

/** D50: the one HTML renderer of descriptions and comments; React elements only, raw HTML stays text. */
export const MarkdownView = ({ source, members }: MarkdownViewProps) => (
  <div className={PROSE}>
    <Markdown
      remarkPlugins={PLUGINS}
      urlTransform={keepMentions}
      components={componentsFor(members)}
    >
      {source}
    </Markdown>
  </div>
)
