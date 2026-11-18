import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  enterName: 'Informe um nome.',
  nameTooLong: 'Use no máximo 100 caracteres.',
  newToken: 'Novo token',
  copied: 'Copiado',
  copyToken: 'Copiar token',
  copyNow: 'Copie agora: você não vai vê-lo de novo.',
  done: 'Concluir',
  tokenName: 'Nome do token',
  tokenNameHint: 'Nome do token, como laptop ou CI',
  createToken: 'Criar token',
  revoke: 'Revogar',
  revokeName: 'Revogar {name}',
  revokeTitle: 'Revogar {name}?',
  revokeEffect: 'Tudo o que usa este token para de funcionar na hora.',
  cancel: 'Cancelar',
  revokeToken: 'Revogar token',
} satisfies Translation<typeof messages>
