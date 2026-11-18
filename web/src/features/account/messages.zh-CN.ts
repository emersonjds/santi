import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  saved: '已保存',
  theme: '主题',
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
  themeFailed: '无法保存主题。',
  language: '语言',
  languageFailed: '无法保存语言。',
  timeZone: '时区',
  browserTimeZone: '浏览器时区（{zone}）',
  timeZoneFailed: '无法保存时区。',
  findTimeZone: '查找时区',
  noTimeZone: '没有匹配的时区。',
} satisfies Translation<typeof messages>
