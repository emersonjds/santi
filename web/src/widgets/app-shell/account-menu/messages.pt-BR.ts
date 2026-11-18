import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: 'Conta',
  keyboardShortcuts: 'Atalhos de teclado',
  takeTour: 'Fazer o tour',
  sendFeedback: 'Enviar feedback',
  signOut: 'Sair',
} satisfies Translation<typeof messages>
