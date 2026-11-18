import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: '账户',
  profile: '个人资料',
  email: '邮箱',
  preferences: '偏好设置',
  security: '安全',
  sessions: '会话',
  apiTokens: 'API令牌',
  tokensIntro:
    'CLI和MCP使用以{header}发送的令牌登录。令牌拥有你的全部权限，直到你将其撤销。',
  noTokens: '还没有令牌。',
  created: '创建于{date}',
  yourData: '你的数据',
  dataIntro:
    '你的数据归你所有：可以下载santi保存的有关你以及你管理的项目的全部数据，也可以删除你的账户。',
  privacyPolicy: '隐私政策',
} satisfies Translation<typeof messages>
