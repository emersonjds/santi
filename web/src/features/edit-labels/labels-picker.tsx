import { Suspense, lazy, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { LabelChip } from '@/entities/issue/label-chip'
import { LOCKED, lockedButton, useReadOnly } from '@/shared/lib/read-only'
import { cn } from '@/shared/lib/utils'
import { buttonVariants } from '@/shared/ui/button'
import { hasLabel } from './labels'

const LabelsMenu = lazy(() =>
  import('./labels-menu').then((module) => ({ default: module.LabelsMenu }))
)

const TRIGGER = cn(
  buttonVariants({ variant: 'ghost' }),
  'h-11 px-2 text-muted-foreground md:h-7'
)

type LabelsPickerProps = {
  projectKey: string
  value: string[]
  onChange: (labels: string[]) => void
  id?: string
}

/** Chips with an x each, then "Add label"; the menu chunk loads after first paint (D39) in the same box. */
export const LabelsPicker = ({
  projectKey,
  value,
  onChange,
  id,
}: LabelsPickerProps) => {
  const [announcement, setAnnouncement] = useState('')
  const note = useReadOnly()
  const add = (label: string) => {
    if (hasLabel(value, label)) return
    onChange([...value, label])
    setAnnouncement(`Label ${label} added`)
  }
  const remove = (label: string) => {
    onChange(value.filter((each) => each !== label))
    setAnnouncement(`Label ${label} removed`)
  }
  const trigger = (
    <>
      <Plus aria-hidden='true' />
      Add label
    </>
  )

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1'>
      {value.map((label) => (
        <LabelChip key={label} name={label} className='pe-0'>
          <button
            type='button'
            aria-label={`Remove label ${label}`}
            onClick={() => remove(label)}
            {...lockedButton(note)}
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-md outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-6',
              LOCKED
            )}
          >
            <X className='size-3.5' aria-hidden='true' />
          </button>
        </LabelChip>
      ))}
      {note ? (
        <button
          type='button'
          id={id}
          aria-label='Add label'
          className={cn(TRIGGER, LOCKED)}
          {...lockedButton(note)}
        >
          {trigger}
        </button>
      ) : (
        <Suspense fallback={<span className={TRIGGER}>{trigger}</span>}>
          <LabelsMenu
            projectKey={projectKey}
            value={value}
            onAdd={add}
            onRemove={remove}
            trigger={trigger}
            className={TRIGGER}
            id={id}
          />
        </Suspense>
      )}
      <p role='status' className='sr-only'>
        {announcement}
      </p>
    </div>
  )
}
