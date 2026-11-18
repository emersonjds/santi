import type { Dictionary } from '@/shared/i18n/i18n'

// Every Spanish string in one lazy chunk (D62).
export default import.meta.glob<Dictionary[string]>('/src/**/messages.es.ts', {
  eager: true,
  import: 'default',
})
