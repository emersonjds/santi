import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: '账户',
  keyboardShortcuts: '键盘快捷键',
  takeTour: '查看导览',
  sendFeedback: '发送反馈',
  signOut: '退出登录',
} satisfies Translation<typeof messages>
