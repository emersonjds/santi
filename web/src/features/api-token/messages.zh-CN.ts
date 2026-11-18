import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  enterName: '请输入名称。',
  nameTooLong: '最多100个字符。',
  newToken: '新令牌',
  copied: '已复制',
  copyToken: '复制令牌',
  copyNow: '请立即复制：之后将无法再次查看。',
  done: '完成',
  tokenName: '令牌名称',
  tokenNameHint: '令牌名称，例如laptop或CI',
  createToken: '创建令牌',
  revoke: '撤销',
  revokeName: '撤销{name}',
  revokeTitle: '撤销{name}？',
  revokeEffect: '使用此令牌的所有程序将立即停止工作。',
  cancel: '取消',
  revokeToken: '撤销令牌',
} satisfies Translation<typeof messages>
