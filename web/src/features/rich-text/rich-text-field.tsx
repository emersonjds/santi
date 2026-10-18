import { useEffect, useState } from 'react'
import { useReadOnly } from '@/shared/lib/read-only'
import { Textarea } from '@/shared/ui/textarea'
import type { Range } from './markdown-commands'
import { MAX_RICH_TEXT } from './mention'
import type { RichTextEditorProps } from './rich-text-editor'

type EditorModule = typeof import('./rich-text-editor')

let chunk: Promise<EditorModule> | undefined
let loaded: EditorModule | undefined

/** D50: the editor is its own chunk, fetched once the page is idle. */
const loadEditor = () =>
  (chunk ??= import('./rich-text-editor').then((module) => (loaded = module)))

const whenIdle = (run: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(run) : setTimeout(run)

const codePoints = (text: string) => [...text].length

/** Q12, in characters: input stops at the cap, and a shorter text always goes through. */
const fits = (next: string, before: string) =>
  next.length <= MAX_RICH_TEXT ||
  codePoints(next) <= Math.max(MAX_RICH_TEXT, codePoints(before))

/** Q3: today's textarea until the editor chunk is in and the field is focused; then the editor, same text and caret. */
export const RichTextField = (
  props: Omit<RichTextEditorProps, 'selection'>
) => {
  const locked = Boolean(useReadOnly())
  const [editor, setEditor] = useState(loaded)
  const [focused, setFocused] = useState(Boolean(props.autoFocus))
  const [used, setUsed] = useState(Boolean(props.autoFocus))
  const [selection, setSelection] = useState<Range>()

  useEffect(() => {
    if (locked) return
    // A failed chunk keeps the textarea; the stale-chunk listener reloads after a deploy.
    whenIdle(() => void loadEditor().then(setEditor, () => {}))
  }, [locked])

  if (editor && used && !locked)
    return (
      <editor.RichTextEditor
        {...props}
        selection={selection}
        autoFocus={focused}
      />
    )

  const { label, value, onChange, onSubmit, onCancel } = props
  return (
    <Textarea
      aria-label={label}
      aria-keyshortcuts={props.keyShortcut}
      data-own-escape={onCancel ? '' : undefined}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      readOnly={props.readOnly}
      className='min-h-24'
      value={value}
      onChange={({ target }) => {
        if (fits(target.value, value)) onChange(target.value)
      }}
      onFocus={() => {
        setFocused(true)
        setUsed(true)
      }}
      onBlur={() => setFocused(false)}
      onSelect={(event) =>
        setSelection({
          from: event.currentTarget.selectionStart,
          to: event.currentTarget.selectionEnd,
        })
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          onSubmit()
        } else if (event.key === 'Escape' && onCancel) {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}
