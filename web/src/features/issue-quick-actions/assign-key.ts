import { useQuery } from '@tanstack/react-query'
import { sessionQuery } from '@/entities/session/session-query'
import type { Card, UpdateIssue } from '@/shared/api/client'
import { focusedIssueKey, useShortcuts } from '@/shared/lib/shortcuts'

type Update = { card: Card; change: UpdateIssue; shown: Partial<Card> }

/** UI-38 `i`: the focused card or row goes to the viewer, through the view's own optimistic write. */
export const useAssignKey = (
  cards: () => Card[],
  update: { mutate: (variables: Update) => void }
) => {
  const { data: me } = useQuery(sessionQuery)
  useShortcuts((event) => {
    if (event.key !== 'i' || !me) return
    const key = focusedIssueKey()
    const card = key && cards().find((each) => each.key === key)
    if (!card) return
    event.preventDefault()
    if (card.assignee_id === me.id) return
    const assignee = { assignee_id: me.id, assignee_name: me.display_name }
    update.mutate({ card, change: { assignee_id: me.id }, shown: assignee })
  })
}
