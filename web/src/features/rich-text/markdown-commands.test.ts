import { describe, expect, it } from 'vitest'
import {
  type Edit,
  type Range,
  clearMarks,
  continueList,
  indentList,
  insertCodeBlock,
  insertDivider,
  insertLink,
  setHeading,
  toggleBlock,
  toggleMark,
  wrapLink,
} from './markdown-commands'

// `«` and `»` mark the selection; `«»` is a caret.
const parse = (marked: string): [string, Range] => {
  const from = marked.indexOf('«')
  const to = marked.indexOf('»') - 1
  return [marked.replace('«', '').replace('»', ''), { from, to }]
}

const show = (text: string, edit: Edit | null) => {
  if (!edit) return null
  const changed = [...edit.changes]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (doc, { from, to, insert }) =>
        doc.slice(0, from) + insert + doc.slice(to),
      text
    )
  const { from, to } = edit.selection
  return `${changed.slice(0, from)}«${changed.slice(from, to)}»${changed.slice(to)}`
}

const run = (
  marked: string,
  command: (text: string, range: Range) => Edit | null
) => {
  const [text, range] = parse(marked)
  return show(text, command(text, range))
}

describe('markdown commands', () => {
  it('wraps a selection in a mark and unwraps it again', () => {
    const bold = (text: string, range: Range) => toggleMark(text, range, '**')
    expect(run('ship «today» now', bold)).toBe('ship **«today»** now')
    expect(run('ship **«today»** now', bold)).toBe('ship «today» now')
    expect(run('ship «**today**» now', bold)).toBe('ship «today» now')
    expect(run('a «»b', (t, r) => toggleMark(t, r, '`'))).toBe('a `«»`b')
    expect(run('«x»', (t, r) => toggleMark(t, r, '_'))).toBe('_«x»_')
    expect(run('«x»', (t, r) => toggleMark(t, r, '~~'))).toBe('~~«x»~~')
  })

  it('turns lines into list items, quotes and tasks, and back', () => {
    expect(run('one«»', (t, r) => toggleBlock(t, r, 'bullet'))).toBe('- one«»')
    expect(run('«one\ntwo»', (t, r) => toggleBlock(t, r, 'numbered'))).toBe(
      '«1. one\n2. two»'
    )
    expect(run('«- one\n- two»', (t, r) => toggleBlock(t, r, 'bullet'))).toBe(
      '«one\ntwo»'
    )
    expect(run('- one«»', (t, r) => toggleBlock(t, r, 'numbered'))).toBe(
      '1. one«»'
    )
    expect(run('idea«»', (t, r) => toggleBlock(t, r, 'quote'))).toBe('> idea«»')
    expect(run('> idea«»', (t, r) => toggleBlock(t, r, 'quote'))).toBe('idea«»')
    expect(run('todo«»', (t, r) => toggleBlock(t, r, 'task'))).toBe(
      '- [ ] todo«»'
    )
    expect(run('first\nsec«»ond', (t, r) => toggleBlock(t, r, 'bullet'))).toBe(
      'first\n- sec«»ond'
    )
  })

  it('sets the heading level of the lines, 0 for normal text', () => {
    expect(run('Goal«»', (t, r) => setHeading(t, r, 2))).toBe('## Goal«»')
    expect(run('## Goal«»', (t, r) => setHeading(t, r, 0))).toBe('Goal«»')
    expect(run('# Go«»al', (t, r) => setHeading(t, r, 3))).toBe('### Go«»al')
  })

  it('inserts a link with its URL selected, and wraps a selection around a pasted URL', () => {
    expect(run('see «docs» here', insertLink)).toBe('see [docs](«url») here')
    expect(run('see «»', insertLink)).toBe('see [link](«url»)')
    expect(run('see «docs»', (t, r) => wrapLink(t, r, 'https://x.dev'))).toBe(
      'see [docs](https://x.dev)«»'
    )
  })

  it('fences the lines as a code block and adds a divider below the line', () => {
    expect(run('«»', insertCodeBlock)).toBe('```\n«»\n```')
    expect(run('run «cargo test»', insertCodeBlock)).toBe(
      '```\n«run cargo test»\n```'
    )
    expect(run('Intro«»', insertDivider)).toBe('Intro\n\n---\n«»')
    expect(run('«»', insertDivider)).toBe('---\n«»')
  })

  it('clears inline marks in the selection', () => {
    expect(run('«**bold** and _it_ ~~gone~~ `code`»', clearMarks)).toBe(
      '«bold and it gone code»'
    )
  })

  it('continues a list on Enter and ends it on an empty item', () => {
    const enter = (text: string, range: Range) => continueList(text, range.from)
    expect(run('- one«»', enter)).toBe('- one\n- «»')
    expect(run('3. three«»', enter)).toBe('3. three\n4. «»')
    expect(run('- [x] done«»', enter)).toBe('- [x] done\n- [ ] «»')
    expect(run('  * nested«»', enter)).toBe('  * nested\n  * «»')
    expect(run('- one\n- «»', enter)).toBe('- one\n«»')
    expect(run('plain«»', enter)).toBeNull()
  })

  it('indents and outdents list items only', () => {
    expect(run('- one\n- t«»wo', (t, r) => indentList(t, r, 1))).toBe(
      '- one\n    - t«»wo'
    )
    expect(run('- one\n    - t«»wo', (t, r) => indentList(t, r, -1))).toBe(
      '- one\n- t«»wo'
    )
    expect(run('- o«»ne', (t, r) => indentList(t, r, -1))).toBe('- o«»ne')
    expect(run('plain«»', (t, r) => indentList(t, r, 1))).toBeNull()
  })
})
