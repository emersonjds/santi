import { type ComponentProps, useRef } from 'react'
import { Button } from '@/shared/ui/button'
import { ACCEPTED } from './upload-queue'

type AttachButtonProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  onFiles: (files: Iterable<File>) => void
}

/** A button that opens the file picker, several files at a time. */
export const AttachButton = ({ onFiles, ...props }: AttachButtonProps) => {
  const picker = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        type='button'
        variant='ghost'
        {...props}
        onClick={() => picker.current?.click()}
      />
      <input
        ref={picker}
        type='file'
        multiple
        hidden
        accept={ACCEPTED}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
    </>
  )
}
