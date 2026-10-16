import type { BoardType } from '@/shared/api/client'
import { Badge } from '@/shared/ui/badge'
import { BOARD_TYPE_LABEL } from './labels'

export const BoardTypeBadge = ({ type }: { type: BoardType }) => (
  <Badge variant='outline' className='text-muted-foreground'>
    {BOARD_TYPE_LABEL[type]}
  </Badge>
)
