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
    'A CLI e o MCP entram com um token enviado como {header}. Um token age com todos os seus direitos até você revogá-lo.',
  noTokens: 'Nenhum token ainda.',
  created: 'Criado em {date}',
  yourData: 'Seus dados',
  dataIntro:
    'Seus dados são seus: baixe tudo o que o santi guarda sobre você e os projetos que você administra, ou exclua a sua conta.',
  privacyPolicy: 'Política de Privacidade',
} satisfies Translation<typeof messages>
