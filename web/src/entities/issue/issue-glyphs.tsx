import {
  BookOpen,
  Bug,
  CircleAlert,
  ClipboardCheck,
  Layers,
  ListTree,
  type LucideIcon,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from 'lucide-react'
import type { IssueType, Priority } from '@/shared/api/client'
import { PRIORITY_LABEL } from './labels'

type Glyph = { label: string; icon: LucideIcon; color: string }

// D36: glyph and text first, color second; of the priorities only urgent is colored.
const TYPES = {
  story: { label: 'Story', icon: BookOpen, color: 'text-type-story' },
  task: { label: 'Task', icon: ClipboardCheck, color: 'text-type-task' },
  bug: { label: 'Bug', icon: Bug, color: 'text-type-bug' },
  epic: { label: 'Epic', icon: Layers, color: 'text-type-epic' },
  subtask: { label: 'Subtask', icon: ListTree, color: 'text-type-subtask' },
} satisfies Record<IssueType, Glyph>

const PRIORITIES = {
  urgent: {
    label: PRIORITY_LABEL.urgent,
    icon: CircleAlert,
    color: 'text-priority-urgent',
  },
  high: {
    label: PRIORITY_LABEL.high,
    icon: SignalHigh,
    color: 'text-foreground',
  },
  medium: {
    label: PRIORITY_LABEL.medium,
    icon: SignalMedium,
    color: 'text-muted-foreground',
  },
  low: {
    label: PRIORITY_LABEL.low,
    icon: SignalLow,
    color: 'text-subtle-foreground',
  },
} satisfies Record<Priority, Glyph>

const GlyphIcon = ({ glyph, text }: { glyph: Glyph; text: string }) => (
  <span className={`inline-flex shrink-0 ${glyph.color}`} title={text}>
    <glyph.icon className='size-4' aria-hidden='true' />
    <span className='sr-only'>{text}</span>
  </span>
)

export const TypeGlyph = ({ type }: { type: IssueType }) => (
  <GlyphIcon glyph={TYPES[type]} text={TYPES[type].label} />
)

export const PriorityGlyph = ({ priority }: { priority: Priority }) => (
  <GlyphIcon
    glyph={PRIORITIES[priority]}
    text={`${PRIORITIES[priority].label} priority`}
  />
)
