import {
  Fragment,
  type ReactNode,
  createElement,
  useMemo,
  useSyncExternalStore,
} from 'react'
import type { User } from '@/shared/api/client'

export type Language = User['language']

/** D62: own names, in the order the control lists them; `released` only after a native speaker's review. */
export const LANGUAGES = [
  { value: 'en', name: 'English', released: true },
  { value: 'es', name: 'Español', released: false },
  { value: 'pt-BR', name: 'Português (Brasil)', released: false },
  { value: 'pt-PT', name: 'Português (Portugal)', released: false },
  { value: 'zh-CN', name: '中文（简体）', released: false },
] satisfies { value: Language; name: string; released: boolean }[]

export const offeredLanguages = (all: boolean = import.meta.env.DEV) =>
  LANGUAGES.filter((language) => language.released || all)

type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
type Message = string | Plural
type Messages = Record<string, Message>
export type Dictionary = Record<string, Partial<Messages>>
type Params = Record<string, string | number>

export type Namespace<M extends Messages> = { id: string; en: M }

/** What a `messages.<lang>.ts` must hold: every key of the English one. */
export type Translation<N extends Namespace<Messages>> = {
  [K in keyof N['en']]: N['en'][K] extends string ? string : Plural
}

export const defineMessages = <const M extends Messages>(
  id: string,
  en: M
): Namespace<M> => ({ id, en })

const KEY = 'santi-language'
const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.some((language) => language.value === value)

export const readStoredLanguage = (): Language => {
  try {
    const value = localStorage.getItem(KEY)
    return isLanguage(value) ? value : 'en'
  } catch {
    return 'en'
  }
}

let state: { language: Language; dictionary: Dictionary } = {
  language: 'en',
  dictionary: {},
}
let load = async (_: Language): Promise<Dictionary> => ({})
let latest = 0
const listeners = new Set<() => void>()

export const setDictionaryLoader = (loader: typeof load) => {
  load = loader
}

export const currentLanguage = () => state.language

/** Loads the language's chunk, then switches the whole UI; a switch overtaken by a newer one is dropped. */
export const switchLanguage = async (language: Language) => {
  const ticket = ++latest
  const dictionary = language === 'en' ? {} : await load(language)
  if (ticket !== latest) return
  state = { language, dictionary }
  document.documentElement.lang = language
  try {
    localStorage.setItem(KEY, language)
  } catch {
    // the choice lasts until the reload
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const cached = <T>(make: (language: Language) => T) => {
  const cache = new Map<Language, T>()
  return (language: Language) => {
    const value = cache.get(language) ?? make(language)
    cache.set(language, value)
    return value
  }
}
const pluralRules = cached((language) => new Intl.PluralRules(language))
const numbers = cached((language) => new Intl.NumberFormat(language))

const translator = <M extends Messages>(
  namespace: Namespace<M>,
  { language, dictionary }: typeof state
) => {
  const t = (key: keyof M & string, params: Params = {}) => {
    const message = dictionary[namespace.id]?.[key] ?? namespace.en[key]
    const text =
      typeof message === 'string'
        ? message
        : (message[pluralRules(language).select(Number(params.count))] ??
          message.other)
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = params[name]
      if (value === undefined) return placeholder
      return typeof value === 'number' ? numbers(language).format(value) : value
    })
  }
  const rich = (key: keyof M & string, nodes: Record<string, ReactNode>) =>
    t(key)
      .split(/(\{\w+\})/)
      .map((part, index) =>
        createElement(
          Fragment,
          { key: index },
          index % 2 ? (nodes[part.slice(1, -1)] ?? part) : part
        )
      )
  return Object.assign(t, { rich })
}

/** `t(key, params)` and `t.rich(key, nodes)` in the current language, English where a string is missing. */
export const useT = <M extends Messages>(namespace: Namespace<M>) => {
  const current = useSyncExternalStore(subscribe, () => state)
  return useMemo(() => translator(namespace, current), [namespace, current])
}
