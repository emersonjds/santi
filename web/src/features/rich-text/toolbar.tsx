import type { EditorView } from '@codemirror/view'
import { ChevronDown, Ellipsis, Type } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ACTIONS, type Action, applyEdit, keyLabel } from './editor-actions'
import { setHeading } from './markdown-commands'

type ToolbarProps = {
  view: EditorView | null
  /** Syntax nodes around the selection. */
  active: ReadonlySet<string>
  disabled: boolean
}

const TARGET = 'h-11 min-w-11 shrink-0 md:h-8 md:min-w-8'

const STYLES = [
  ['Normal text', 0],
  ['Heading 1', 1],
  ['Heading 2', 2],
  ['Heading 3', 3],
] as const

const MORE: Action[] = [
  ACTIONS.strikethrough,
  ACTIONS.quote,
  ACTIONS.codeBlock,
  ACTIONS.divider,
  ACTIONS.clear,
]

const titleOf = ({ label, key }: Action) =>
  key ? `${label} (${keyLabel(key)})` : label

const Divider = () => (
  <span aria-hidden='true' className='mx-0.5 h-5 w-px shrink-0 bg-border' />
)

/** Q5: one row in ED-5 order; under `sm` it scrolls inside itself. */
export const Toolbar = ({ view, active, disabled }: ToolbarProps) => {
  const run = (action: Action) => {
    if (!view) return
    action.run(view)
    view.focus()
  }
  const menuProps = {
    align: 'start' as const,
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      view?.focus()
    },
  }
  const button = (action: Action) => (
    <Button
      key={action.label}
      type='button'
      variant='ghost'
      size='icon'
      className={TARGET}
      aria-label={action.label}
      title={titleOf(action)}
      aria-pressed={action.node ? active.has(action.node) : undefined}
      disabled={disabled || !view}
      // Keeps the focus and the selection in the editor.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(action)}
    >
      <action.icon />
    </Button>
  )

  return (
    <div
      role='toolbar'
      aria-label='Formatting'
      className='flex items-center gap-0.5 overflow-x-auto border-b p-1'
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled || !view}>
          <Button
            type='button'
            variant='ghost'
            className={`${TARGET} gap-0.5 px-2`}
            aria-label='Text style'
            title='Text style'
          >
            <Type />
            <ChevronDown className='size-3' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent {...menuProps}>
          {STYLES.map(([label, level]) => (
            <DropdownMenuItem
              key={label}
              onSelect={() =>
                view &&
                applyEdit((text, range) => setHeading(text, range, level))(view)
              }
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />
      {button(ACTIONS.bold)}
      {button(ACTIONS.italic)}
      <Divider />
      {button(ACTIONS.link)}
      {button(ACTIONS.code)}
      <Divider />
      {button(ACTIONS.bullet)}
      {button(ACTIONS.numbered)}
      <Divider />
      {button(ACTIONS.emoji)}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled || !view}>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className={TARGET}
            aria-label='More formatting'
            title='More formatting'
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent {...menuProps}>
          {MORE.map((action) => (
            <DropdownMenuItem
              key={action.label}
              onSelect={() => view && action.run(view)}
            >
              <action.icon />
              {action.label}
              {action.key && (
                <DropdownMenuShortcut>
                  {keyLabel(action.key)}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className='ms-auto' />
      {button(ACTIONS.undo)}
      {button(ACTIONS.redo)}
    </div>
  )
}
