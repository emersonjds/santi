import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: '显示密码',
  hidePassword: '隐藏密码',
} satisfies Translation<typeof messages>
