import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  skipToContent: 'Saltar para o conteúdo',
  projectsAndPages: 'Projetos e páginas',
  forYou: 'Para si',
  recent: 'Recentes',
  starred: 'Favoritos',
  moreProjects: 'Mais projetos',
  projects: 'Projetos',
  newProject: 'Novo projeto',
  projectsOptions: 'Opções de projetos',
  aboutSanti: 'Sobre o santi',
  privacy: 'Privacidade',
  terms: 'Termos',
  feedback: 'Comentários',
  projectActions: 'Ações de {name}',
  create: 'Criar',
  accountOf: 'Conta ({name})',
  notifications: 'Notificações',
  notificationsUnread: { other: 'Notificações, {count} por ler' },
  position: '{index} de {total}',
} satisfies Translation<typeof messages>
