import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar palavra-passe',
  hidePassword: 'Ocultar palavra-passe',
  toggleSidebar: 'Mostrar ou ocultar a barra lateral',
  resizeSidebar: 'Redimensionar a barra lateral',
  close: 'Fechar',
  retry: 'Tentar novamente',
  sidebar: 'Barra lateral',
  sidebarHint: 'Mostra a barra lateral no telemóvel.',
} satisfies Translation<typeof messages>
