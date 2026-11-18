import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar senha',
  hidePassword: 'Ocultar senha',
} satisfies Translation<typeof messages>
