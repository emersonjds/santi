import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  saved: 'Guardado',
  theme: 'Tema',
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
  themeFailed: 'No se pudo guardar tu tema.',
  language: 'Idioma',
  languageFailed: 'No se pudo guardar tu idioma.',
  timeZone: 'Zona horaria',
  browserTimeZone: 'Zona horaria del navegador ({zone})',
  timeZoneFailed: 'No se pudo guardar tu zona horaria.',
  findTimeZone: 'Buscar una zona horaria',
  noTimeZone: 'Ninguna zona horaria coincide.',
} satisfies Translation<typeof messages>
