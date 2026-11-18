import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  enterName: 'Escribe un nombre.',
  nameTooLong: 'Usa como máximo 100 caracteres.',
  newToken: 'Nuevo token',
  copied: 'Copiado',
  copyToken: 'Copiar token',
  copyNow: 'Cópialo ahora: no lo volverás a ver.',
  done: 'Listo',
  tokenName: 'Nombre del token',
  tokenNameHint: 'Nombre del token, como portátil o CI',
  createToken: 'Crear token',
  revoke: 'Revocar',
  revokeName: 'Revocar {name}',
  revokeTitle: '¿Revocar {name}?',
  revokeEffect: 'Todo lo que use este token dejará de funcionar de inmediato.',
  cancel: 'Cancelar',
  revokeToken: 'Revocar token',
} satisfies Translation<typeof messages>
