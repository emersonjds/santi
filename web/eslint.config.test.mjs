import { ESLint } from 'eslint'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const eslint = new ESLint({ cwd: import.meta.dirname })
const rawCopy = async (jsx) => {
  const [result] = await eslint.lintText(
    `export const View = ({ on, n }: { on: boolean; n: number }) => (\n  ${jsx}\n)\n`,
    { filePath: 'src/pages/account/account-page.tsx' }
  )
  return result.messages.filter(
    (message) => message.ruleId === 'no-restricted-syntax'
  ).length
}

test('raw copy inside an expression fails in a translated file', async () => {
  for (const jsx of [
    "<p>{on && 'Saved'}</p>",
    "<p>{on ? 'Saved' : 'Failed'}</p>",
    '<p>{`Saved ${n}`}</p>',
    "<p>{on ? (n ? 'Saved' : null) : null}</p>",
    "<p title={on ? 'Saved' : 'Failed'} />",
  ])
    assert.notEqual(await rawCopy(jsx), 0, jsx)
})

test('class names, keys and links stay allowed', async () => {
  for (const jsx of [
    "<p className={on ? 'text-sm' : 'hidden'} />",
    '<p className={`flex ${n}`} />',
    "<a key={on ? 'a' : 'b'} href={on ? '/account' : '/'} data-state={on && 'open'} />",
    "<p>{on && n === 1 ? null : 'x'.length}</p>",
  ])
    assert.equal(await rawCopy(jsx), 0, jsx)
})
