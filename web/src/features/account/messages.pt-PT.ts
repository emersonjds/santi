import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  saved: 'Guardado',
  theme: 'Tema',
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
  themeFailed: 'Não foi possível guardar o tema.',
  language: 'Idioma',
  languageFailed: 'Não foi possível guardar o idioma.',
  timeZone: 'Fuso horário',
  browserTimeZone: 'Fuso horário do navegador ({zone})',
  timeZoneFailed: 'Não foi possível guardar o fuso horário.',
  findTimeZone: 'Procurar um fuso horário',
  noTimeZone: 'Nenhum fuso horário corresponde.',
} satisfies Translation<typeof messages>
