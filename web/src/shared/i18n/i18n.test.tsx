import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, renderHook } from 'vitest-browser-react'
import {
  type Language,
  currentLanguage,
  defineMessages,
  offeredLanguages,
  readStoredLanguage,
  readyOrTimeout,
  setDictionaryLoader,
  switchLanguage,
  useT,
} from './i18n'

const messages = defineMessages('test/i18n', {
  hello: 'Hello, {name}',
  total: 'Total {count}',
  issues: { one: '{count} issue', other: '{count} issues' },
  sentence: 'Send {header} first',
  untranslated: 'Only English',
})
const absent = defineMessages('test/absent', { title: 'Absent' })

const dictionaries: Partial<Record<Language, object>> = {
  'pt-BR': {
    'test/i18n': {
      hello: 'Olá, {name}',
      total: 'Total {count}',
      issues: { one: '{count} item', other: '{count} itens' },
      sentence: 'Envie {header} antes',
    },
  },
  'zh-CN': { 'test/i18n': { issues: { other: '{count} 个事项' } } },
  es: {
    'test/i18n': {
      issues: { one: '{count} elemento', other: '{count} elementos' },
    },
  },
}

const useLoader = (
  load = async (language: Language) => dictionaries[language] ?? {}
) => setDictionaryLoader(async (language) => ({ ...(await load(language)) }))

const translate = async () => {
  const { result } = await renderHook(() => useT(messages))
  return result
}

describe('i18n', () => {
  afterEach(async () => {
    useLoader()
    await switchLanguage('en')
  })

  it('fills params and formats numbers in the language', async () => {
    useLoader()
    const t = await translate()

    expect(t.current('hello', { name: 'Ada' })).toBe('Hello, Ada')
    expect(t.current('hello')).toBe('Hello, {name}')
    expect(t.current('total', { count: 1234 })).toBe('Total 1,234')

    await switchLanguage('pt-BR')

    await expect
      .poll(() => t.current('hello', { name: 'Ada' }))
      .toBe('Olá, Ada')
    expect(t.current('total', { count: 1234 })).toBe('Total 1.234')
  })

  it('picks the plural form the language uses', async () => {
    useLoader()
    const t = await translate()
    expect(t.current('issues', { count: 1 })).toBe('1 issue')
    expect(t.current('issues', { count: 0 })).toBe('0 issues')

    await switchLanguage('pt-BR')
    await expect.poll(() => t.current('issues', { count: 0 })).toBe('0 item')
    expect(t.current('issues', { count: 2 })).toBe('2 itens')

    await switchLanguage('zh-CN')
    await expect.poll(() => t.current('issues', { count: 1 })).toBe('1 个事项')

    await switchLanguage('es')
    await expect
      .poll(() => t.current('issues', { count: 1_000_000 }))
      .toBe('1.000.000 elementos')
  })

  it('puts nodes inside a sentence', async () => {
    useLoader()
    const t = await translate()
    const screen = await render(
      <p>{t.current.rich('sentence', { header: <code>X-Key</code> })}</p>
    )

    await expect
      .element(screen.getByRole('paragraph'))
      .toHaveTextContent('Send X-Key first')
    await expect
      .element(screen.getByText('X-Key'))
      .toHaveProperty('tagName', 'CODE')
  })

  it('falls back to English for a missing key or namespace', async () => {
    useLoader()
    const t = await translate()
    const other = await renderHook(() => useT(absent))

    await switchLanguage('pt-BR')

    await expect
      .poll(() => t.current('hello', { name: 'Ada' }))
      .toBe('Olá, Ada')
    expect(t.current('untranslated')).toBe('Only English')
    expect(other.result.current('title')).toBe('Absent')
  })

  it('sets the page language and remembers it', async () => {
    useLoader()
    await switchLanguage('pt-BR')

    expect(document.documentElement.lang).toBe('pt-BR')
    expect(currentLanguage()).toBe('pt-BR')
    expect(readStoredLanguage()).toBe('pt-BR')
  })

  it('reads English when storage is unusable or holds junk', () => {
    localStorage.setItem('santi-language', 'klingon')
    expect(readStoredLanguage()).toBe('en')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredLanguage()).toBe('en')
    vi.restoreAllMocks()
  })

  it('keeps the current language when a load fails', async () => {
    useLoader(async () => {
      throw new Error('offline')
    })

    await expect(switchLanguage('es')).rejects.toThrow('offline')

    expect(currentLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('drops a chunk that arrives after a newer choice', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    useLoader(async (language) => {
      await held
      return dictionaries[language] ?? {}
    })

    const late = switchLanguage('pt-BR')
    await switchLanguage('en')
    release()
    await late

    expect(currentLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('offers only released languages outside development', () => {
    expect(offeredLanguages(false).map((language) => language.value)).toEqual([
      'en',
    ])
    expect(offeredLanguages().map((language) => language.name)).toEqual([
      'English',
      'Español',
      'Português (Brasil)',
      'Português (Portugal)',
      '中文（简体）',
    ])
  })
  it('treats an unreleased language as English outside development', async () => {
    const load = vi.fn(async () => ({}))
    setDictionaryLoader(load)
    const released = offeredLanguages(false)
    localStorage.setItem('santi-language', 'pt-BR')

    expect(readStoredLanguage(released)).toBe('en')
    await switchLanguage('pt-BR', released)

    expect(currentLanguage()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(readStoredLanguage()).toBe('en')
    expect(load).not.toHaveBeenCalled()
  })

  it('skips the load when the language is already on, still dropping an older pending one', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const load = vi.fn(async (language: Language) => {
      if (language === 'es') await held
      return { ...dictionaries[language] }
    })
    setDictionaryLoader(load)
    await switchLanguage('pt-BR')
    await switchLanguage('pt-BR')
    expect(load).toHaveBeenCalledTimes(1)

    await switchLanguage('en')
    localStorage.setItem('santi-language', 'pt-BR')
    const late = switchLanguage('es')
    await switchLanguage('en')
    release()
    await late

    expect(currentLanguage()).toBe('en')
    expect(readStoredLanguage()).toBe('en')
  })

  it('waits for the first language until it settles or the time is up', async () => {
    await expect(readyOrTimeout(new Promise(() => {}), 10)).resolves.toBe(
      undefined
    )
    await expect(
      readyOrTimeout(Promise.reject(new Error('offline')), 5000)
    ).resolves.toBe(undefined)

    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    useLoader(async (language) => {
      await held
      return dictionaries[language] ?? {}
    })
    const late = switchLanguage('pt-BR')
    await readyOrTimeout(late, 10)
    expect(currentLanguage()).toBe('en')

    release()
    await late
    expect(currentLanguage()).toBe('pt-BR')
  })
})
