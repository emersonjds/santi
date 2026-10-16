import { describe, expect, it } from 'vitest'
import { parseBoardSearch } from './board-query'
import { parseIssueSearch } from './search-query'

describe('board and search URL params', () => {
  it('keeps a well-formed epic, or none', () => {
    expect(parseBoardSearch({ epic: 'WEB-9' }).epic).toBe('WEB-9')
    expect(parseBoardSearch({ epic: 'none' }).epic).toBe('none')
  })

  it.each(['web-9', 'WEB-0', 'WEB', 'WEB-9; drop', '../x', 'W-1', ' WEB-9'])(
    'drops the epic %j',
    (epic) => {
      expect(parseBoardSearch({ epic }).epic).toBeUndefined()
    }
  )

  it('drops NUL from the text, and text made of nothing else', () => {
    expect(parseBoardSearch({ q: 'log\u0000in' }).q).toBe('login')
    expect(parseBoardSearch({ q: '\u0000' }).q).toBeUndefined()
  })

  it.each(['toString', '__proto__', 'constructor', 'hasOwnProperty'])(
    'drops the inherited name %s as a status or a type',
    (name) => {
      const search = parseIssueSearch({ status: name, type: name })
      expect(search.status).toBeUndefined()
      expect(search.type).toBeUndefined()
    }
  )

  it('keeps a real status and type', () => {
    const search = parseIssueSearch({ status: 'done', type: ['bug'] })
    expect(search.status).toBe('done')
    expect(search.type).toEqual(['bug'])
  })
})
