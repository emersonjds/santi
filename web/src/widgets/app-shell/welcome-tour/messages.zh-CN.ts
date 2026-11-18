import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  welcomeTitle: '欢迎使用santi',
  welcomeBody:
    '在任何地方按C即可创建事项。这个简短导览用不到一分钟介绍基础功能。',
  boardTitle: '看板和待办列表',
  boardBody: '工作在看板上推进，在待办列表中规划。先按G再按B或L即可跳转。',
  searchTitle: '搜索和跳转',
  searchBody: '按/在项目内搜索，按⌘ K跳转到任意项目。',
  inviteTitle: '邀请你的团队',
  inviteBody:
    '项目在团队协作中更有用。在项目顶部使用“邀请”，通过链接添加队友。',
  shortcutsTitle: '快捷键、CLI和MCP',
  shortcutsBody: '随时按?查看完整的快捷键列表。CLI和AI助手也能读取和更改事项。',
  tourStep: '第{step}步，共{total}步',
  back: '上一步',
  next: '下一步',
  done: '完成',
  skipTour: '跳过导览',
} satisfies Translation<typeof messages>
