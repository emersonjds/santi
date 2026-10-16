import { createContext } from 'react'
import type { Backlog, BoardView } from '@/shared/api/client'

export const BoardContext = createContext<BoardView | null>(null)

export const BacklogContext = createContext<Backlog | null>(null)
