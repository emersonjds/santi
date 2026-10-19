import {
  type ComponentProps,
  type DragEvent,
  type SyntheticEvent,
  useState,
} from 'react'
import { cn } from '@/shared/lib/utils'

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'

const carriesFiles = (event: DragEvent) =>
  event.dataTransfer.types.includes('Files')

/** A zone takes only the events aimed at it, not at a zone nested inside it. */
const owns = ({ target, currentTarget }: SyntheticEvent) => {
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  return element?.closest('[data-drop-zone]') === currentTarget
}

type DropZoneProps = ComponentProps<'div'> & {
  onFiles: (files: Iterable<File>) => void
  disabled: boolean
  /** Takes an image pasted into a field too, as the comment composer does. */
  takesFieldPaste?: boolean
}

/** SAN-158 decision 2: files dropped anywhere on it, or an image pasted outside a field, go to `onFiles`. */
export const DropZone = ({
  onFiles,
  disabled,
  takesFieldPaste = false,
  className,
  children,
  ...props
}: DropZoneProps) => {
  const [depth, setDepth] = useState(0)
  const takes = (event: DragEvent) =>
    !disabled && carriesFiles(event) && owns(event)

  return (
    <div
      {...props}
      data-drop-zone
      className={cn('relative', className)}
      onDragEnter={(event) => {
        if (!takes(event)) return
        event.preventDefault()
        setDepth((count) => count + 1)
      }}
      onDragOver={(event) => {
        if (takes(event)) event.preventDefault()
      }}
      onDragLeave={(event) => {
        if (takes(event)) setDepth((count) => Math.max(0, count - 1))
      }}
      // Capture phase: CodeMirror inserts a dropped text file into the editor unless the drop is already taken.
      onDropCapture={(event) => {
        if (!takes(event)) return
        event.preventDefault()
        setDepth(0)
        onFiles([...event.dataTransfer.files])
      }}
      onPaste={(event) => {
        if (
          disabled ||
          !owns(event) ||
          (!takesFieldPaste &&
            event.target instanceof Element &&
            event.target.closest(EDITABLE))
        )
          return
        const images = [...event.clipboardData.files].filter((file) =>
          file.type.startsWith('image/')
        )
        if (images.length === 0) return
        event.preventDefault()
        onFiles(images)
      }}
    >
      {children}
      {depth > 0 && (
        <div className='pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-background/85 text-sm font-medium'>
          Drop files to attach
        </div>
      )}
    </div>
  )
}
