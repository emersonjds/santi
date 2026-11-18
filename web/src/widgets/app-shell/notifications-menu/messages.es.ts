import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  notifications: 'Notificaciones',
  notificationsFailed: 'No se pudieron cargar las notificaciones.',
  tryAgain: 'Reintentar',
  loadingNotifications: 'Cargando notificaciones',
  caughtUp: 'Estás al día.',
  loadMore: 'Cargar más',
  markAllRead: 'Marcar todas como leídas',
  close: 'Cerrar',
} satisfies Translation<typeof messages>
