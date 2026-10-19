import { type KeyboardEvent, useRef } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import type { Attachment } from '@/shared/api/client'
import { ReadOnly } from '@/shared/lib/read-only'
import { useReturnFocus } from '@/shared/lib/use-return-focus'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'

const SWIPE_PX = 50

type AttachmentLightboxProps = {
  images: Attachment[]
  index: number
  urlOf: (image: Attachment) => string
  onIndex: (index: number) => void
  onClose: () => void
}

/** SAN-158 "Preview": one image at a time; arrows, buttons and swipes step through them (lazy chunk). */
export const AttachmentLightbox = ({
  images,
  index,
  urlOf,
  onIndex,
  onClose,
}: AttachmentLightboxProps) => {
  const returnFocus = useReturnFocus()
  const swipeFrom = useRef<number | null>(null)
  const image = images[index]
  const step = (by: number) =>
    onIndex((index + by + images.length) % images.length)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') step(1)
    if (event.key === 'ArrowLeft') step(-1)
  }

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={returnFocus}
        onKeyDown={onKeyDown}
        className='max-md:p-4 sm:max-w-4xl'
      >
        <DialogTitle className='truncate pe-10 text-base'>
          {image.file_name}
        </DialogTitle>
        <img
          src={urlOf(image)}
          alt={image.file_name}
          draggable={false}
          className='max-h-[70svh] w-full touch-pan-y rounded-md object-contain select-none'
          onPointerDown={(event) => {
            swipeFrom.current = event.clientX
          }}
          onPointerUp={(event) => {
            if (swipeFrom.current === null) return
            const moved = event.clientX - swipeFrom.current
            swipeFrom.current = null
            if (Math.abs(moved) >= SWIPE_PX) step(moved < 0 ? 1 : -1)
          }}
        />
        <div className='flex items-center gap-2'>
          {images.length > 1 && (
            <ReadOnly value={undefined}>
              <Button
                variant='outline'
                size='icon'
                aria-label='Previous image'
                className='size-11 md:size-9'
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant='outline'
                size='icon'
                aria-label='Next image'
                className='size-11 md:size-9'
                onClick={() => step(1)}
              >
                <ChevronRight />
              </Button>
            </ReadOnly>
          )}
          <a
            href={`${urlOf(image)}?download=1`}
            download={image.file_name}
            className={buttonVariants({
              variant: 'outline',
              className: 'ms-auto h-11 md:h-9',
            })}
          >
            <Download />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
