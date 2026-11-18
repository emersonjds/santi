import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  notifications: '通知',
  notificationsFailed: '无法加载通知。',
  tryAgain: '重试',
  loadingNotifications: '正在加载通知',
  caughtUp: '没有新通知。',
  loadMore: '加载更多',
  markAllRead: '全部标为已读',
  close: '关闭',
} satisfies Translation<typeof messages>
