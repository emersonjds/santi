import { Suspense, lazy, useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { issueLinks, useShortcuts } from '@/shared/lib/shortcuts'

// Lazy: the sheet loads on the first `?` (D39).
const ShortcutSheet = lazy(() =>
  import('./shortcut-sheet').then((module) => ({
    default: module.ShortcutSheet,
  }))
)

const CHORD_MS = 1000
const STEPS = new Map([
  ['j', 1],
  ['k', -1],
  ['n', 1],
  ['p', -1],
])

const groupOf = (link: HTMLElement) =>
  link.closest<HTMLElement>('[data-issue-group]')

/** A control marked `aria-keyshortcuts`: in the open issue first, then the selected card or row, then the top bar. */
const markedFor = (key: string) => {
  const selector = `[aria-keyshortcuts="${CSS.escape(key)}"]`
  const scopes = [
    document.querySelector('[data-issue-view]'),
    document.activeElement?.closest('li'),
    document.querySelector('header'),
  ]
  for (const scope of scopes) {
    const found = scope?.querySelector<HTMLElement>(selector)
    if (found) return found
  }
}

type ShortcutsProps = { open: boolean; setOpen: (open: boolean) => void }

/** UI-26, UI-37, UI-38: the single-key layer; the selection is the focused card or row. */
export const Shortcuts = ({ open, setOpen }: ShortcutsProps) => {
  const { key: projectKey } = useParams({ strict: false })
  const navigate = useNavigate()
  const chordAt = useRef(-Infinity)
  const [said, say] = useState('')

  const select = (links: HTMLElement[], link?: HTMLElement) => {
    if (!link) return
    link.focus()
    const group = groupOf(link)
    const peers = links.filter((each) => groupOf(each) === group)
    say(
      [
        link.dataset.issueKey,
        group?.dataset.issueGroup,
        `${peers.indexOf(link) + 1} of ${peers.length}`,
      ]
        .filter(Boolean)
        .join(', ')
    )
  }

  useShortcuts((event) => {
    const { key } = event
    const chorded = event.timeStamp - chordAt.current < CHORD_MS
    chordAt.current = key === 'g' ? event.timeStamp : -Infinity
    if (chorded && projectKey && (key === 'b' || key === 'l')) {
      event.preventDefault()
      void navigate({
        to: key === 'b' ? '/p/$key/board' : '/p/$key/backlog',
        params: { key: projectKey },
      })
      return
    }
    if (key === '?') {
      event.preventDefault()
      setOpen(true)
      return
    }
    const marked = markedFor(key)
    if (marked) {
      event.preventDefault()
      if (marked.matches('input, select, textarea')) marked.focus()
      else marked.click()
      return
    }
    // The open issue steps through the view itself (issue dialog).
    if (document.querySelector('[data-issue-dialog]')) return
    const links = issueLinks()
    const at = links.findIndex((link) => link === document.activeElement)
    if (key === 'o' && at >= 0) {
      event.preventDefault()
      links[at].click()
      return
    }
    const step = STEPS.get(key)
    if (!step) return
    event.preventDefault()
    if (key === 'j' || key === 'k')
      return select(links, links[at < 0 ? 0 : at + step])
    const groups = [...new Set(links.map(groupOf))]
    const group = groups[at < 0 ? 0 : groups.indexOf(groupOf(links[at])) + step]
    select(
      links,
      links.find((link) => group !== undefined && groupOf(link) === group)
    )
  })

  return (
    <>
      <p role='status' className='sr-only'>
        {said}
      </p>
      {open && (
        <Suspense fallback={null}>
          <ShortcutSheet onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
