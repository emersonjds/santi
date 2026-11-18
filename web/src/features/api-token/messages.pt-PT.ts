import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  enterName: 'Introduza um nome.',
  nameTooLong: 'Use no máximo 100 caracteres.',
  newToken: 'Novo token',
  copied: 'Copiado',
  copyToken: 'Copiar token',
  copyNow: 'Copie-o agora: não o voltará a ver.',
  done: 'Concluir',
  tokenName: 'Nome do token',
  tokenNameHint: 'Nome do token, como portátil ou CI',
  createToken: 'Criar token',
  revoke: 'Revogar',
  revokeName: 'Revogar {name}',
  revokeTitle: 'Revogar {name}?',
  revokeEffect: 'Tudo o que usa este token deixa de funcionar de imediato.',
  cancel: 'Cancelar',
  revokeToken: 'Revogar token',
} satisfies Translation<typeof messages>
