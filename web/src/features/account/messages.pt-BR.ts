import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  saved: 'Salvo',
  theme: 'Tema',
  light: 'Claro',
  dark: 'Escuro',
  system: 'Sistema',
  themeFailed: 'Não foi possível salvar o seu tema.',
  language: 'Idioma',
  languageFailed: 'Não foi possível salvar o seu idioma.',
  timeZone: 'Fuso horário',
  browserTimeZone: 'Fuso horário do navegador ({zone})',
  timeZoneFailed: 'Não foi possível salvar o seu fuso horário.',
  findTimeZone: 'Buscar um fuso horário',
  noTimeZone: 'Nenhum fuso horário encontrado.',
} satisfies Translation<typeof messages>
