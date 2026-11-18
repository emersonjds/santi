import { describe, expect, it } from 'vitest'
import { folderOf, languagesWithLoader } from './load-dictionary'

const english = import.meta.glob<{ id: string }>('/src/**/messages.ts', {
  eager: true,
  import: 'messages',
})
const translations = Object.keys(import.meta.glob('/src/**/messages.*.ts'))

describe('dictionaries', () => {
  it('names each namespace after its folder', () => {
    const files = Object.entries(english)
    expect(files.length).toBeGreaterThan(0)
    for (const [path, messages] of files)
      expect(messages.id, path).toBe(folderOf(path))
  })

  it('has a translation file beside every English one', () => {
    for (const language of languagesWithLoader)
      for (const path of Object.keys(english))
        expect(translations, language).toContain(
          path.replace(/\.ts$/, `.${language}.ts`)
        )
  })
})
