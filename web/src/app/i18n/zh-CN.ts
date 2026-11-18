import type { Dictionary } from '@/shared/i18n/i18n'

// Every Simplified Chinese string in one lazy chunk (D62).
export default import.meta.glob<Dictionary[string]>(
  '/src/**/messages.zh-CN.ts',
  { eager: true, import: 'default' }
)
