import { type ComponentProps, type KeyboardEvent, useState } from 'react'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

type CommitProps = {
  value: string
  /** Called with the trimmed text on Enter or blur, only when it changed. */
  onCommit: (value: string) => void
  required?: boolean
}

type CommitInputProps = Omit<ComponentProps<typeof Input>, 'value'> &
  CommitProps

type CommitTextareaProps = Omit<ComponentProps<typeof Textarea>, 'value'> &
  CommitProps

const useCommitDraft = ({ value, onCommit, required }: CommitProps) => {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }

  const commit = () => {
    const next = draft.trim()
    if (next === value) return
    if (!next && required) return setDraft(value)
    onCommit(next)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!event.shiftKey) commit()
  }

  return { draft, setDraft, commit, onKeyDown }
}

/** A text field that saves on Enter or blur and follows the saved value when it changes (or rolls back). */
export const CommitInput = ({
  value,
  onCommit,
  ...props
}: CommitInputProps) => {
  const field = useCommitDraft({ value, onCommit, required: props.required })
  return (
    <Input
      {...props}
      value={field.draft}
      onChange={(event) => field.setDraft(event.target.value)}
      onBlur={field.commit}
      onKeyDown={field.onKeyDown}
    />
  )
}

/** CommitInput for one-line text that wraps and grows instead of scrolling sideways. */
export const CommitTextarea = ({
  value,
  onCommit,
  className,
  ...props
}: CommitTextareaProps) => {
  const field = useCommitDraft({ value, onCommit, required: props.required })
  return (
    <Textarea
      {...props}
      rows={1}
      className={`min-h-0 resize-none ${className ?? ''}`}
      value={field.draft}
      onChange={(event) =>
        field.setDraft(event.target.value.replace(/\r?\n/g, ' '))
      }
      onBlur={field.commit}
      onKeyDown={field.onKeyDown}
    />
  )
}
