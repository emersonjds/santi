import { createContext } from 'react'
import type { Backlog, BoardView } from '@/shared/api/client'

/** The board on screen, for the card actions that place a card among its neighbours. */
export const BoardContext = createContext<BoardView | null>(null)

/** The backlog on screen, for the row actions that send a row to another section. */
export const BacklogContext = createContext<Backlog | null>(null)
