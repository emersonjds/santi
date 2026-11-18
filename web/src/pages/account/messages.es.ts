import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: 'Cuenta',
  profile: 'Perfil',
  email: 'Correo electrónico',
  preferences: 'Preferencias',
  security: 'Seguridad',
  sessions: 'Sesiones',
  apiTokens: 'Tokens de API',
  tokensIntro:
    'La CLI y el MCP inician sesión con un token enviado como {header}. Un token actúa con todos tus permisos hasta que lo revoques.',
  noTokens: 'Aún no hay tokens.',
  created: 'Creado el {date}',
  yourData: 'Tus datos',
  dataIntro:
    'Tus datos son tuyos: descarga todo lo que santi guarda sobre ti y los proyectos que administras, o elimina tu cuenta.',
  privacyPolicy: 'Política de privacidad',
} satisfies Translation<typeof messages>
