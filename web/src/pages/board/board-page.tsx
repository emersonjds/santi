import { useParams, useSearch } from '@tanstack/react-router'
import { Board } from '@/widgets/board/board'

export const BoardPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key/board' })
  const search = useSearch({ from: '/_authenticated/p/$key/board' })
  return <Board projectKey={key} search={search} />
}
