import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar senha',
  hidePassword: 'Ocultar senha',
  toggleSidebar: 'Mostrar ou ocultar a barra lateral',
  resizeSidebar: 'Redimensionar a barra lateral',
  close: 'Fechar',
  retry: 'Tentar de novo',
  sidebar: 'Barra lateral',
  sidebarHint: 'Mostra a barra lateral no celular.',
} satisfies Translation<typeof messages>
