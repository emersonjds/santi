import { createContext } from 'react'
import type { BoardView } from '@/shared/api/client'

/** The board on screen, for the card actions that place a card among its neighbours. */
export const BoardContext = createContext<BoardView | null>(null)
