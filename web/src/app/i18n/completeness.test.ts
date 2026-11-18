import { describe, expect, it } from 'vitest'
import {
  folderOf,
  languagesWithLoader,
  loadDictionary,
} from './load-dictionary'

const english = import.meta.glob<{ id: string }>('/src/**/messages.ts', {
  eager: true,
  import: 'messages',
})
const sources = import.meta.glob<string>('/src/**/messages.*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const translations = Object.keys(sources)

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

  it('types every translation file against its English one', () => {
    for (const [path, source] of Object.entries(sources))
      expect(source, path).toContain('satisfies Translation<')
  })

  it('loads nothing for a language without a chunk', async () => {
    await expect(loadDictionary('zh-CN')).resolves.toEqual({})
  })
})
