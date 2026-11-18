import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  toggleProject: 'Mostrar u ocultar {name}',
  board: 'Tablero',
  backlog: 'Backlog',
  reports: 'Informes',
  settings: 'Configuración',
  projectsFailed: 'No se pudieron cargar los proyectos.',
  noProjects: 'Aún no hay proyectos',
  createProject: 'Crear proyecto',
  starred: 'Favoritos',
  recent: 'Recientes',
} satisfies Translation<typeof messages>
