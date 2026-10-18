import { describe, expect, it } from 'vitest'
import type { MyProject } from '@/shared/api/client'
import { moreProjects, sidebarProjects } from './sidebar-projects'

const project = (key: string, fields: Partial<MyProject> = {}): MyProject => ({
  key,
  name: key,
  board_type: 'scrum',
  role: 'member',
  starred: false,
  open_assigned: 0,
  ...fields,
})

const keys = (projects: MyProject[]) => projects.map(({ key }) => key)

// The /api/me/projects order: the most recent visit first.
const LIST = [
  project('A'),
  project('S1', { starred: true, starred_at: '2026-10-01T10:00:00Z' }),
  project('B'),
  project('C'),
  project('S2', { starred: true, starred_at: '2026-10-02T10:00:00Z' }),
  project('D'),
  project('E'),
  project('F'),
]

describe('sidebar projects', () => {
  it('puts starred projects first, newest star first, then five recent ones', () => {
    const { starred, recent } = sidebarProjects(LIST, 'recent-starred')

    expect(keys(starred)).toEqual(['S2', 'S1'])
    expect(keys(recent)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('shows only the starred ones, or only the latest project', () => {
    expect(keys(sidebarProjects(LIST, 'starred').starred)).toEqual(['S2', 'S1'])
    expect(sidebarProjects(LIST, 'starred').recent).toEqual([])
    expect(sidebarProjects(LIST, 'latest')).toEqual({
      starred: [],
      recent: [LIST[0]],
    })
  })

  it('keeps the current project in view when only starred ones show', () => {
    expect(sidebarProjects(LIST, 'starred', 'C')).toEqual({
      starred: [LIST[4], LIST[1]],
      recent: [LIST[3]],
    })
    expect(sidebarProjects(LIST, 'starred', 'S1').recent).toEqual([])
    expect(sidebarProjects(LIST, 'starred', 'GONE').recent).toEqual([])
  })

  it('ranks a star with no time yet last', () => {
    const list = [project('X', { starred: true }), ...LIST]

    expect(keys(sidebarProjects(list, 'recent-starred').starred)).toEqual([
      'S2',
      'S1',
      'X',
    ])
  })
})

describe('more projects', () => {
  const list = [
    project('V1', { name: 'Visited', visited_at: '2026-10-03T10:00:00Z' }),
    project('IN', {
      name: 'In the sidebar',
      visited_at: '2026-10-02T10:00:00Z',
    }),
    project('ZE', { name: 'zeta' }),
    project('BE', { name: 'Beta' }),
    project('AL', { name: 'alpha' }),
  ]
  const shown = [list[1]]

  it('leaves out the sidebar rows, recent ones first, the others by name ignoring case', () => {
    const { recent, other } = moreProjects(list, shown, '')

    expect(keys(recent)).toEqual(['V1'])
    expect(keys(other)).toEqual(['AL', 'BE', 'ZE'])
  })

  it('matches the name or the key, ignoring case', () => {
    expect(moreProjects(list, shown, 'BET')).toEqual({
      recent: [],
      other: [list[3]],
    })
    expect(keys(moreProjects(list, shown, 'v1').recent)).toEqual(['V1'])
    expect(moreProjects(list, shown, 'sidebar')).toEqual({
      recent: [],
      other: [],
    })
  })
})
