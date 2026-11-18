import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: '显示密码',
  hidePassword: '隐藏密码',
  toggleSidebar: '显示或隐藏侧边栏',
  resizeSidebar: '调整侧边栏宽度',
  close: '关闭',
  retry: '重试',
  sidebar: '侧边栏',
  sidebarHint: '显示移动端侧边栏。',
} satisfies Translation<typeof messages>
