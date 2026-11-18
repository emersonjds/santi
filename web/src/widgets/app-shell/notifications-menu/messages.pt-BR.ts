import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  notifications: 'Notificações',
  notificationsFailed: 'As notificações não carregaram.',
  tryAgain: 'Tentar de novo',
  loadingNotifications: 'Carregando notificações',
  caughtUp: 'Você está em dia.',
  loadMore: 'Carregar mais',
  markAllRead: 'Marcar todas como lidas',
  close: 'Fechar',
} satisfies Translation<typeof messages>
