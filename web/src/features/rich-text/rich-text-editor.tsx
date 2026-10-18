import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  acceptCompletion,
  autocompletion,
  completionStatus,
} from '@codemirror/autocomplete'
import { history, historyKeymap, standardKeymap } from '@codemirror/commands'
import { Language, defineLanguageFacet, syntaxTree } from '@codemirror/language'
import {
  Compartment,
  EditorState,
  Prec,
  type Range as Ranged,
  Transaction,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
  placeholder as placeholderText,
} from '@codemirror/view'
import { GFM, parser } from '@lezer/markdown'
import type { Member } from '@/shared/api/client'
import { avatarTone, initials, shortName } from '@/shared/lib/initials'
import { cn } from '@/shared/lib/utils'
import { ACTIONS, applyEdit } from './editor-actions'
import { emojiNamed, emojiStartingWith } from './emoji'
import {
  type Range,
  continueList,
  indentList,
  wrapLink,
} from './markdown-commands'
import { MAX_RICH_TEXT, mentionToken, parseMention } from './mention'
import { Toolbar } from './toolbar'

export type RichTextEditorProps = {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  /** Mod-Enter. */
  onSubmit: () => void
  /** Esc, once the picker is closed. */
  onCancel?: () => void
  members: Member[]
  /** Listed first in the mention picker, in this order (assignee, reporter). */
  firstIds: number[]
  /** The caret the textarea had before the editor took over. */
  selection?: Range
  autoFocus?: boolean
  readOnly?: boolean
  keyShortcut?: string
}

const markdown = new Language(
  defineLanguageFacet(),
  parser.configure(GFM),
  [],
  'markdown'
)

const MUTED = 'text-muted-foreground'
const HEADING = 'font-semibold'

// Q4: marks style as they are typed; the Markdown characters stay, muted.
const STYLE: Record<string, string> = {
  StrongEmphasis: 'font-semibold',
  Emphasis: 'italic',
  Strikethrough: 'line-through',
  InlineCode: 'rounded bg-muted font-mono text-[0.875em]',
  Link: 'text-accent-foreground underline underline-offset-2',
  ATXHeading1: `text-xl ${HEADING}`,
  ATXHeading2: `text-lg ${HEADING}`,
  ATXHeading3: HEADING,
  ATXHeading4: HEADING,
  ATXHeading5: HEADING,
  ATXHeading6: HEADING,
  SetextHeading1: `text-xl ${HEADING}`,
  SetextHeading2: `text-lg ${HEADING}`,
  Blockquote: MUTED,
  FencedCode: 'font-mono text-[0.875em]',
  CodeBlock: 'font-mono text-[0.875em]',
  HorizontalRule: MUTED,
  EmphasisMark: MUTED,
  CodeMark: MUTED,
  CodeInfo: MUTED,
  HeaderMark: MUTED,
  QuoteMark: MUTED,
  ListMark: MUTED,
  LinkMark: MUTED,
  URL: MUTED,
  StrikethroughMark: MUTED,
  TaskMarker: MUTED,
}
const MARKS = Object.fromEntries(
  Object.entries(STYLE).map(([name, style]) => [
    name,
    Decoration.mark({ class: style }),
  ])
)

const styled = (view: EditorView) => {
  const ranges: Ranged<Decoration>[] = []
  syntaxTree(view.state).iterate({
    from: view.viewport.from,
    to: view.viewport.to,
    enter: ({ name, from, to }) => {
      if (MARKS[name] && to > from) ranges.push(MARKS[name].range(from, to))
    },
  })
  return Decoration.set(ranges, true)
}

const liveStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = styled(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = styled(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

const avatar = (name: string) => {
  const dot = document.createElement('span')
  dot.setAttribute('aria-hidden', 'true')
  dot.className = cn(
    'grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold',
    avatarTone(name)
  )
  dot.textContent = initials(name)
  return dot
}

class Chip extends WidgetType {
  constructor(
    readonly name: string,
    readonly member: boolean
  ) {
    super()
  }

  eq(other: Chip) {
    return other.name === this.name && other.member === this.member
  }

  toDOM() {
    const text = document.createElement('span')
    if (!this.member) {
      text.className = MUTED
      text.textContent = `@${this.name}`
      return text
    }
    text.textContent = `@${shortName(this.name)}`
    const chip = document.createElement('span')
    chip.className =
      'inline-flex items-center gap-1 rounded-full bg-accent py-px ps-0.5 pe-2 align-middle font-medium text-accent-foreground'
    chip.append(avatar(this.name), text)
    return chip
  }
}

const MENTION = /\[@((?:\\.|[^\\[\]])*)\]\(mention:(\d+)\)/g

/** D50: a mention token shows as one chip with the member's current name. */
const chips = (members: () => Member[]) => {
  const decorator = new MatchDecorator({
    regexp: MENTION,
    decoration: ([token]) => {
      const { userId, name } = parseMention(token) ?? { userId: 0, name: '' }
      const member = members().find((each) => each.user_id === userId)
      return Decoration.replace({
        widget: new Chip(member?.display_name ?? name, Boolean(member)),
      })
    },
  })
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations)
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      provide: (plugin) =>
        EditorView.atomicRanges.of(
          (view) => view.plugin(plugin)?.decorations ?? Decoration.none
        ),
    }
  )
}

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const NO_MATCH: Completion = {
  label: 'No matching members',
  type: 'empty',
  apply: () => {},
}

/** Q7: a prefix of the email or of any word of the name; the issue's people first, then by name. */
const mentionSource =
  (members: () => Member[], firstIds: () => number[]) =>
  (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/(?:^|\s)@[^\s@]*$/)
    if (!match) return null
    const at = match.text.lastIndexOf('@')
    const query = fold(match.text.slice(at + 1))
    const first = firstIds()
    const rank = (member: Member) => {
      const index = first.indexOf(member.user_id)
      return index === -1 ? first.length : index
    }
    const found = members()
      .filter(
        (member) =>
          fold(member.email).startsWith(query) ||
          fold(member.display_name)
            .split(/\s+/)
            .some((word) => word.startsWith(query))
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) || a.display_name.localeCompare(b.display_name)
      )
      .slice(0, 8)
    return {
      from: match.from + at,
      filter: false,
      options: found.length
        ? found.map((member) => ({
            label: member.display_name,
            displayLabel: shortName(member.display_name),
            detail: member.email,
            type: 'mention',
            apply: mentionToken(member),
          }))
        : [NO_MATCH],
    }
  }

/** Q9: after a space and two letters, or from the toolbar button. */
const emojiSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(/(?:^|\s):[\w+-]*$/)
  if (!match) return null
  const at = match.text.lastIndexOf(':')
  const query = match.text.slice(at + 1)
  if (query.length < 2 && !context.explicit && !completionStatus(context.state))
    return null
  const found = emojiStartingWith(query)
  if (!found.length) return null
  return {
    from: match.from + at,
    filter: false,
    options: found.map(([name, char]) => ({
      label: `:${name}:`,
      displayLabel: `${char} :${name}:`,
      apply: char,
    })),
  }
}

const emojiOnColon = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== ':') return false
  const line = view.state.doc.lineAt(from)
  const name = /(?:^|\s):([\w+-]+)$/.exec(
    view.state.sliceDoc(line.from, from)
  )?.[1]
  if (!name) return false
  const char = emojiNamed(name)
  if (!char) return false
  const start = from - name.length - 1
  view.dispatch({
    changes: { from: start, to, insert: char },
    selection: { anchor: start + char.length },
    userEvent: 'input.type',
  })
  return true
})

const URL_ONLY = /^https?:\/\/\S+$/

/** Q10: a URL pasted over a selection links it; Mod-Shift-V pastes it as is. */
const pasteLinks = () => {
  let plain = false
  return EditorView.domEventHandlers({
    keydown: (event) => {
      plain =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'v'
      return false
    },
    paste: (event, view) => {
      const url = event.clipboardData?.getData('text/plain').trim() ?? ''
      const asIs = plain
      plain = false
      if (asIs || view.state.selection.main.empty || !URL_ONLY.test(url))
        return false
      event.preventDefault()
      return applyEdit((text, range) => wrapLink(text, range, url))(view)
    },
  })
}

const codePoints = (text: string) => [...text].length

/** Q12: input stops at the cap; a paste past it is refused whole. */
const capped = (onRefused: () => void) =>
  EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.newDoc.length <= MAX_RICH_TEXT) return tr
    const after = codePoints(tr.newDoc.toString())
    if (
      after <= MAX_RICH_TEXT ||
      after <= codePoints(tr.startState.doc.toString())
    )
      return tr
    if (tr.isUserEvent('input.paste')) onRefused()
    return []
  })

const activeAt = (state: EditorState) => {
  const { from, empty } = state.selection.main
  const names = new Set<string>()
  const cursor = syntaxTree(state).cursorAt(from, empty ? -1 : 1)
  do names.add(cursor.name)
  while (cursor.parent())
  return names
}

const theme = EditorView.theme({
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.5' },
  '.cm-content': {
    minHeight: '6rem',
    padding: '0.5rem 0.75rem',
    caretColor: 'var(--foreground)',
  },
  '.cm-line': { padding: '0' },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
  '& .cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  '& .cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxWidth: 'calc(100vw - 2rem)',
    maxHeight: '20rem',
    padding: '0.25rem',
  },
  '& .cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minHeight: '2.75rem',
    padding: '0 0.5rem',
    borderRadius: 'var(--radius-sm)',
  },
  '& .cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '& .cm-tooltip.cm-tooltip-autocomplete > ul > li.cm-empty-option[aria-selected]':
    { backgroundColor: 'transparent', color: 'var(--muted-foreground)' },
  '.cm-empty-option': { color: 'var(--muted-foreground)' },
  '.cm-completionDetail': {
    marginInlineStart: 'auto',
    fontStyle: 'normal',
    color: 'var(--muted-foreground)',
  },
})

const WARN_AT = MAX_RICH_TEXT * 0.9

/** D50 / Q3: the Markdown source with live styling; the bytes typed are the bytes stored. */
export const RichTextEditor = (props: RichTextEditorProps) => {
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const [view, setView] = useState<EditorView | null>(null)
  const [active, setActive] = useState<ReadonlySet<string>>(new Set())
  const [picking, setPicking] = useState(false)
  const [refused, setRefused] = useState(false)
  const [readOnly] = useState(() => new Compartment())

  const mount = useCallback(
    (host: HTMLDivElement) => {
      const initial = latest.current
      const length = initial.value.length
      const editor = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: initial.value,
          selection: {
            anchor: Math.min(initial.selection?.from ?? length, length),
            head: Math.min(initial.selection?.to ?? length, length),
          },
          extensions: [
            history(),
            markdown.extension,
            liveStyles,
            chips(() => latest.current.members),
            autocompletion({
              override: [
                mentionSource(
                  () => latest.current.members,
                  () => latest.current.firstIds
                ),
                emojiSource,
              ],
              icons: false,
              optionClass: (option) =>
                option.type === 'empty' ? 'cm-empty-option' : '',
              addToOptions: [
                {
                  position: 20,
                  render: (option) =>
                    option.type === 'mention' ? avatar(option.label) : null,
                },
              ],
            }),
            Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
            keymap.of([
              {
                key: 'Mod-Enter',
                run: () => {
                  latest.current.onSubmit()
                  return true
                },
              },
              {
                key: 'Escape',
                run: () => {
                  const { onCancel } = latest.current
                  onCancel?.()
                  return Boolean(onCancel)
                },
              },
              {
                key: 'Enter',
                run: applyEdit((text, range) =>
                  range.from === range.to
                    ? continueList(text, range.from)
                    : null
                ),
              },
              {
                key: 'Tab',
                run: applyEdit((text, range) => indentList(text, range, 1)),
              },
              {
                key: 'Shift-Tab',
                run: applyEdit((text, range) => indentList(text, range, -1)),
              },
              ...Object.values(ACTIONS).flatMap((action) =>
                'key' in action ? [{ key: action.key, run: action.run }] : []
              ),
            ]),
            keymap.of([...standardKeymap, ...historyKeymap]),
            EditorView.lineWrapping,
            placeholderText(initial.placeholder),
            EditorView.contentAttributes.of({
              'aria-label': initial.label,
              ...(initial.keyShortcut && {
                'aria-keyshortcuts': initial.keyShortcut,
              }),
            }),
            theme,
            emojiOnColon,
            pasteLinks(),
            capped(() => setRefused(true)),
            readOnly.of(EditorState.readOnly.of(Boolean(initial.readOnly))),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                setRefused(false)
                latest.current.onChange(update.state.doc.toString())
              }
              if (update.docChanged || update.selectionSet)
                setActive(activeAt(update.state))
              setPicking(completionStatus(update.state) !== null)
            }),
          ],
        }),
      })
      setView(editor)
      setActive(activeAt(editor.state))
      if (initial.autoFocus) editor.focus()
      return () => editor.destroy()
    },
    [readOnly]
  )

  const { value } = props
  useEffect(() => {
    if (!view || value === view.state.doc.toString()) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    })
  }, [view, value])

  const locked = Boolean(props.readOnly)
  useEffect(() => {
    view?.dispatch({
      effects: readOnly.reconfigure(EditorState.readOnly.of(locked)),
    })
  }, [view, readOnly, locked])

  const left = value.length < WARN_AT ? null : MAX_RICH_TEXT - codePoints(value)

  return (
    <div className='grid min-w-0 gap-1'>
      <div
        // Radix hears Esc first; the editor keeps it while it cancels or closes the picker.
        data-own-escape={props.onCancel || picking ? '' : undefined}
        className='min-w-0 rounded-md border border-input text-base shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 md:text-sm dark:bg-input/30'
      >
        <Toolbar view={view} active={active} disabled={locked} />
        <div ref={mount} />
      </div>
      {refused && (
        <p className='text-sm text-destructive'>
          The paste would pass the limit of 65,536 characters.
        </p>
      )}
      {left !== null && (
        <p aria-live='polite' className='text-xs text-muted-foreground'>
          {`${left.toLocaleString('en-US')} character${left === 1 ? '' : 's'} left`}
        </p>
      )}
    </div>
  )
}
