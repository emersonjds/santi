/** Pure edits over the Markdown source; the editor turns them into one transaction. */
export type Range = { from: number; to: number }
export type Change = { from: number; to: number; insert: string }
export type Edit = { changes: Change[]; selection: Range }

export type Block = 'bullet' | 'numbered' | 'task' | 'quote'

const LIST_ITEM = /^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/
const IS: Record<Block, RegExp> = {
  bullet: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/,
  numbered: /^\s*\d+[.)]\s+/,
  task: /^\s*[-*+]\s+\[[ xX]\]\s+/,
  quote: /^>\s?/,
}
const HEADING = /^#{1,6}\s+/
const INDENT = '    '

const lineStart = (text: string, pos: number) =>
  text.lastIndexOf('\n', pos - 1) + 1

const lineEnd = (text: string, pos: number) => {
  const end = text.indexOf('\n', pos)
  return end === -1 ? text.length : end
}

/** Rewrites every line the range touches, keeping a caret on its line or selecting the new block. */
const rewriteLines = (
  text: string,
  range: Range,
  rewrite: (lines: string[]) => string[]
): Edit => {
  const start = lineStart(text, range.from)
  const end = lineEnd(text, range.to)
  const before = text.slice(start, end)
  const insert = rewrite(before.split('\n')).join('\n')
  const selection =
    range.from === range.to
      ? {
          from: Math.max(start, range.from + insert.length - before.length),
          to: Math.max(start, range.from + insert.length - before.length),
        }
      : { from: start, to: start + insert.length }
  return { changes: [{ from: start, to: end, insert }], selection }
}

export const toggleMark = (
  text: string,
  { from, to }: Range,
  marker: string
): Edit => {
  const size = marker.length
  const selected = text.slice(from, to)
  if (
    text.slice(from - size, from) === marker &&
    text.slice(to, to + size) === marker
  )
    return {
      changes: [
        { from: from - size, to: from, insert: '' },
        { from: to, to: to + size, insert: '' },
      ],
      selection: { from: from - size, to: to - size },
    }
  if (
    selected.length >= size * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(size, -size)
    return {
      changes: [{ from, to, insert: inner }],
      selection: { from, to: from + inner.length },
    }
  }
  return {
    changes: [
      { from, to: from, insert: marker },
      { from: to, to, insert: marker },
    ],
    selection: { from: from + size, to: to + size },
  }
}

const prefixOf = (block: Block, index: number) =>
  ({
    bullet: '- ',
    numbered: `${index + 1}. `,
    task: '- [ ] ',
    quote: '> ',
  })[block]

export const toggleBlock = (text: string, range: Range, block: Block) =>
  rewriteLines(text, range, (lines) => {
    if (lines.every((line) => IS[block].test(line)))
      return lines.map((line) =>
        block === 'quote'
          ? line.replace(IS.quote, '')
          : line.replace(LIST_ITEM, '$1')
      )
    if (block === 'quote') return lines.map((line) => prefixOf(block, 0) + line)
    return lines.map((line, index) => {
      const [, indent = ''] = /^(\s*)/.exec(line) ?? []
      return (
        indent +
        prefixOf(block, index) +
        line.replace(LIST_ITEM, '').trimStart()
      )
    })
  })

export const setHeading = (text: string, range: Range, level: number) =>
  rewriteLines(text, range, (lines) =>
    lines.map(
      (line) =>
        (level ? `${'#'.repeat(level)} ` : '') + line.replace(HEADING, '')
    )
  )

export const insertLink = (text: string, { from, to }: Range): Edit => {
  const label = text.slice(from, to) || 'link'
  const start = from + label.length + 3
  return {
    changes: [{ from, to, insert: `[${label}](url)` }],
    selection: { from: start, to: start + 3 },
  }
}

export const wrapLink = (
  text: string,
  { from, to }: Range,
  url: string
): Edit => {
  const insert = `[${text.slice(from, to)}](${url})`
  return {
    changes: [{ from, to, insert }],
    selection: { from: from + insert.length, to: from + insert.length },
  }
}

export const insertCodeBlock = (text: string, range: Range): Edit => {
  const start = lineStart(text, range.from)
  const end = lineEnd(text, range.to)
  const code = text.slice(start, end)
  return {
    changes: [{ from: start, to: end, insert: `\`\`\`\n${code}\n\`\`\`` }],
    selection: { from: start + 4, to: start + 4 + code.length },
  }
}

export const insertDivider = (text: string, range: Range): Edit => {
  const end = lineEnd(text, range.to)
  // A blank line first: `---` right under text would make that text a heading.
  const insert = `${end === lineStart(text, end) ? '' : '\n\n'}---\n`
  return {
    changes: [{ from: end, to: end, insert }],
    selection: { from: end + insert.length, to: end + insert.length },
  }
}

const MARK = /(\*\*|__|~~|`|\*|_)(.+?)\1/g

export const clearMarks = (text: string, { from, to }: Range): Edit => {
  let plain = text.slice(from, to)
  for (let last = ''; last !== plain;) {
    last = plain
    plain = plain.replace(MARK, '$2')
  }
  return {
    changes: [{ from, to, insert: plain }],
    selection: { from, to: from + plain.length },
  }
}

/** Enter inside a list item: the next item, or the end of the list on an empty one; null outside a list. */
export const continueList = (text: string, pos: number): Edit | null => {
  const start = lineStart(text, pos)
  const line = text.slice(start, lineEnd(text, pos))
  const item = LIST_ITEM.exec(line)
  if (!item || pos - start < item[0].length) return null
  if (line.trim() === item[0].trim())
    return {
      changes: [{ from: start, to: start + line.length, insert: '' }],
      selection: { from: start, to: start },
    }
  const [, indent, bullet, number, delimiter, task] = item
  const marker = number ? `${Number(number) + 1}${delimiter}` : bullet
  const insert = `\n${indent}${marker} ${task ? '[ ] ' : ''}`
  return {
    changes: [{ from: pos, to: pos, insert }],
    selection: { from: pos + insert.length, to: pos + insert.length },
  }
}

/** Tab and Shift-Tab inside a list item; null outside one, so focus can leave the editor. */
export const indentList = (
  text: string,
  range: Range,
  direction: 1 | -1
): Edit | null => {
  const start = lineStart(text, range.from)
  if (!LIST_ITEM.test(text.slice(start, lineEnd(text, start)))) return null
  return rewriteLines(text, range, (lines) =>
    lines.map((line) =>
      direction === 1
        ? INDENT + line
        : line.replace(new RegExp(`^ {1,${INDENT.length}}|^\\t`), '')
    )
  )
}
