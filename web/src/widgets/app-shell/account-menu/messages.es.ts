import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: 'Cuenta',
  keyboardShortcuts: 'Atajos de teclado',
  takeTour: 'Hacer el recorrido',
  sendFeedback: 'Enviar comentarios',
  signOut: 'Cerrar sesión',
} satisfies Translation<typeof messages>
