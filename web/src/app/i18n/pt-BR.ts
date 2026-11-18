import type { Dictionary } from '@/shared/i18n/i18n'

// Every Portuguese (Brazil) string in one lazy chunk (D62).
export default import.meta.glob<Dictionary[string]>(
  '/src/**/messages.pt-BR.ts',
  { eager: true, import: 'default' }
)
