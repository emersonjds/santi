import { defineMessages } from '@/shared/i18n/i18n'

export const messages = defineMessages('features/account', {
  saved: 'Saved',
  theme: 'Theme',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  themeFailed: 'Could not save your theme.',
  language: 'Language',
  languageFailed: 'Could not save your language.',
  timeZone: 'Time zone',
  browserTimeZone: 'Browser time zone ({zone})',
  timeZoneFailed: 'Could not save your time zone.',
  findTimeZone: 'Find a time zone',
  noTimeZone: 'No time zone matches.',
})
