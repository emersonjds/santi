import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  keyboardShortcuts: '键盘快捷键',
  shortcutsHint: '单键快捷键在任何地方都可用，正在输入的字段除外。',
  useShortcuts: '使用键盘快捷键',
  replayTour: '重新查看欢迎导览',
  global: '全局',
  navigation: '导航',
  issueActions: '事项操作',
  createIssue: '创建事项',
  searchProject: '搜索此项目',
  jumpToProject: '跳转到项目',
  goToBoard: '前往看板',
  goToBacklog: '前往待办列表',
  linkIssue: '将打开的事项关联到另一个事项',
  showShortcuts: '显示这些快捷键',
  nextIssue: '下一个事项',
  previousIssue: '上一个事项',
  nextColumn: '下一列或下一部分',
  previousColumn: '上一列或上一部分',
  openIssue: '打开所选事项',
  closeIssue: '关闭事项',
  assignToMe: '分配给我',
  changeAssignee: '更改打开事项的负责人',
  commentOnIssue: '评论打开的事项',
  editSummary: '编辑待办列表某一行的摘要',
} satisfies Translation<typeof messages>
