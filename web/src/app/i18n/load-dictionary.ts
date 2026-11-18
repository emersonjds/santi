import type { Dictionary, Language } from '@/shared/i18n/i18n'

const loaders: Partial<
  Record<Language, () => Promise<{ default: Dictionary }>>
> = {
  es: () => import('./es'),
  'pt-BR': () => import('./pt-BR'),
  'pt-PT': () => import('./pt-PT'),
  'zh-CN': () => import('./zh-CN'),
}

export const languagesWithLoader = Object.keys(loaders)

/** `/src/features/account/messages.pt-BR.ts` → `features/account`. */
export const folderOf = (path: string) =>
  path.replace(/^\/src\//, '').replace(/\/messages(\.[\w-]+)?\.ts$/, '')

export const loadDictionary = async (
  language: Language
): Promise<Dictionary> => {
  const files = (await loaders[language]?.())?.default ?? {}
  return Object.fromEntries(
    Object.entries(files).map(([path, messages]) => [folderOf(path), messages])
  )
}
