import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar contraseña',
  hidePassword: 'Ocultar contraseña',
} satisfies Translation<typeof messages>
