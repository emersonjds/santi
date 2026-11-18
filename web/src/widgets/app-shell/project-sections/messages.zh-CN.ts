import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  toggleProject: '展开或收起{name}',
  board: '看板',
  backlog: '待办列表',
  reports: '报告',
  settings: '设置',
  projectsFailed: '无法加载项目。',
  noProjects: '还没有项目',
  createProject: '创建项目',
  starred: '星标',
  recent: '最近',
} satisfies Translation<typeof messages>
