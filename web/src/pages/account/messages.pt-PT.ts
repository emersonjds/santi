import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  account: 'Conta',
  profile: 'Perfil',
  email: 'E-mail',
  preferences: 'Preferências',
  security: 'Segurança',
  sessions: 'Sessões',
  apiTokens: 'Tokens de API',
  tokensIntro:
    'A CLI e o MCP iniciam sessão com um token enviado como {header}. Um token age com todos os seus direitos até o revogar.',
  noTokens: 'Ainda não há tokens.',
  created: 'Criado a {date}',
  yourData: 'Os seus dados',
  dataIntro:
    'Os seus dados são seus: transfira tudo o que o santi guarda sobre si e sobre os projetos que administra, ou elimine a sua conta.',
  privacyPolicy: 'Política de Privacidade',
} satisfies Translation<typeof messages>
