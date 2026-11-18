import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar palavra-passe',
  hidePassword: 'Ocultar palavra-passe',
} satisfies Translation<typeof messages>
