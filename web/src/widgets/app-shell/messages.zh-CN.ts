import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  skipToContent: '跳到主要内容',
  projectsAndPages: '项目和页面',
  forYou: '为你推荐',
  recent: '最近',
  starred: '星标',
  moreProjects: '更多项目',
  projects: '项目',
  newProject: '新建项目',
  projectsOptions: '项目选项',
  aboutSanti: '关于santi',
  privacy: '隐私',
  terms: '条款',
  feedback: '反馈',
  projectActions: '{name}的操作',
  create: '创建',
  accountOf: '账户（{name}）',
  notifications: '通知',
  notificationsUnread: { other: '通知，{count}条未读' },
  position: '第{index}个，共{total}个',
} satisfies Translation<typeof messages>
