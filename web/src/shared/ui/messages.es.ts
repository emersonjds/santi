import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  showPassword: 'Mostrar contraseña',
  hidePassword: 'Ocultar contraseña',
  toggleSidebar: 'Mostrar u ocultar la barra lateral',
  resizeSidebar: 'Cambiar el tamaño de la barra lateral',
  close: 'Cerrar',
  retry: 'Reintentar',
  sidebar: 'Barra lateral',
  sidebarHint: 'Muestra la barra lateral en el móvil.',
} satisfies Translation<typeof messages>
