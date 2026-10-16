import { type ComponentProps, useState } from 'react'
import { Input } from '@/shared/ui/input'

type CommitInputProps = Omit<ComponentProps<typeof Input>, 'value'> & {
  value: string
  /** Called with the trimmed text on Enter or blur, only when it changed. */
  onCommit: (value: string) => void
}

/** A text field that saves on Enter or blur and follows the saved value when it changes (or rolls back). */
export const CommitInput = ({
  value,
  onCommit,
  ...props
}: CommitInputProps) => {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }

  const commit = () => {
    const next = draft.trim()
    if (next === value) return
    if (!next && props.required) return setDraft(value)
    onCommit(next)
  }

  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
      }}
    />
  )
}
