import { startCompletion } from '@codemirror/autocomplete'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import {
  Bold,
  Code,
  Italic,
  Link,
  List,
  ListOrdered,
  type LucideIcon,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Smile,
  SquareCode,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import {
  type Block,
  type Edit,
  type Range,
  clearMarks,
  insertCodeBlock,
  insertDivider,
  insertLink,
  toggleBlock,
  toggleMark,
} from './markdown-commands'

type Command = (view: EditorView) => boolean

export type Action = {
  label: string
  icon: LucideIcon
  run: Command
  key?: string
  /** The syntax node that makes the toolbar button pressed. */
  node?: string
}

// `input.format` keeps each formatting step its own undo step.
export const applyEdit =
  (command: (text: string, range: Range) => Edit | null): Command =>
  (view) => {
    const { from, to } = view.state.selection.main
    const edit = command(view.state.doc.toString(), { from, to })
    if (!edit) return false
    view.dispatch({
      changes: edit.changes,
      selection: { anchor: edit.selection.from, head: edit.selection.to },
      scrollIntoView: true,
      userEvent: 'input.format',
    })
    return true
  }

const mark = (marker: string) =>
  applyEdit((text, range) => toggleMark(text, range, marker))

const block = (kind: Block) =>
  applyEdit((text, range) => toggleBlock(text, range, kind))

const openEmoji: Command = (view) => {
  const { from, to } = view.state.selection.main
  const insert = /\S/.test(view.state.sliceDoc(from - 1, from)) ? ' :' : ':'
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    userEvent: 'input',
  })
  return startCompletion(view)
}

export const ACTIONS = {
  bold: {
    label: 'Bold',
    key: 'Mod-b',
    icon: Bold,
    run: mark('**'),
    node: 'StrongEmphasis',
  },
  italic: {
    label: 'Italic',
    key: 'Mod-i',
    icon: Italic,
    run: mark('_'),
    node: 'Emphasis',
  },
  link: {
    label: 'Link',
    key: 'Mod-Shift-k',
    icon: Link,
    run: applyEdit(insertLink),
    node: 'Link',
  },
  code: {
    label: 'Inline code',
    key: 'Mod-Shift-m',
    icon: Code,
    run: mark('`'),
    node: 'InlineCode',
  },
  bullet: {
    label: 'Bullet list',
    key: 'Mod-Shift-8',
    icon: List,
    run: block('bullet'),
    node: 'BulletList',
  },
  numbered: {
    label: 'Numbered list',
    key: 'Mod-Shift-7',
    icon: ListOrdered,
    run: block('numbered'),
    node: 'OrderedList',
  },
  emoji: { label: 'Emoji', icon: Smile, run: openEmoji },
  strikethrough: {
    label: 'Strikethrough',
    key: 'Mod-Shift-s',
    icon: Strikethrough,
    run: mark('~~'),
  },
  quote: {
    label: 'Quote',
    key: 'Mod-Shift-9',
    icon: Quote,
    run: block('quote'),
  },
  codeBlock: {
    label: 'Code block',
    icon: SquareCode,
    run: applyEdit(insertCodeBlock),
  },
  divider: {
    label: 'Divider',
    key: 'Mod-Shift--',
    icon: Minus,
    run: applyEdit(insertDivider),
  },
  clear: {
    label: 'Clear formatting',
    key: 'Mod-\\',
    icon: RemoveFormatting,
    run: applyEdit(clearMarks),
  },
  undo: { label: 'Undo', key: 'Mod-z', icon: Undo2, run: undo },
  redo: { label: 'Redo', key: 'Mod-Shift-z', icon: Redo2, run: redo },
} satisfies Record<string, Action>

const MAC = /Mac|iPhone|iPad/.test(navigator.platform)

/** `Mod-Shift-8` as people read it: `⌘⇧8` on a Mac, `Ctrl+Shift+8` elsewhere. */
export const keyLabel = (key: string) =>
  key
    .split(/-(?!$)/)
    .map((part) =>
      part === 'Mod'
        ? MAC
          ? '⌘'
          : 'Ctrl'
        : part === 'Shift'
          ? MAC
            ? '⇧'
            : 'Shift'
          : part.toUpperCase()
    )
    .join(MAC ? '' : '+')
