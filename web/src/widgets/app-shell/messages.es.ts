import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  skipToContent: 'Saltar al contenido',
  projectsAndPages: 'Proyectos y páginas',
  forYou: 'Para ti',
  recent: 'Recientes',
  starred: 'Favoritos',
  moreProjects: 'Más proyectos',
  projects: 'Proyectos',
  newProject: 'Nuevo proyecto',
  projectsOptions: 'Opciones de proyectos',
  aboutSanti: 'Acerca de santi',
  privacy: 'Privacidad',
  terms: 'Términos',
  feedback: 'Comentarios',
  projectActions: 'Acciones de {name}',
  create: 'Crear',
  accountOf: 'Cuenta ({name})',
  notifications: 'Notificaciones',
  notificationsUnread: { other: 'Notificaciones, {count} sin leer' },
  position: '{index} de {total}',
} satisfies Translation<typeof messages>
