import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: 'Conta',
  keyboardShortcuts: 'Atalhos de teclado',
  takeTour: 'Fazer a visita guiada',
  sendFeedback: 'Enviar comentários',
  signOut: 'Terminar sessão',
} satisfies Translation<typeof messages>
