import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  notifications: 'Notificações',
  notificationsFailed: 'Não foi possível carregar as notificações.',
  tryAgain: 'Tentar novamente',
  loadingNotifications: 'A carregar notificações',
  caughtUp: 'Está tudo em dia.',
  loadMore: 'Carregar mais',
  markAllRead: 'Marcar todas como lidas',
  close: 'Fechar',
} satisfies Translation<typeof messages>
