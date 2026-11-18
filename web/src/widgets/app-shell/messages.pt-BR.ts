import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  skipToContent: 'Pular para o conteúdo',
  projectsAndPages: 'Projetos e páginas',
  forYou: 'Para você',
  recent: 'Recentes',
  starred: 'Favoritos',
  moreProjects: 'Mais projetos',
  projects: 'Projetos',
  newProject: 'Novo projeto',
  projectsOptions: 'Opções de projetos',
  aboutSanti: 'Sobre o santi',
  privacy: 'Privacidade',
  terms: 'Termos',
  feedback: 'Feedback',
  projectActions: 'Ações de {name}',
  create: 'Criar',
  accountOf: 'Conta ({name})',
  notifications: 'Notificações',
  notificationsUnread: {
    one: 'Notificações, {count} não lida',
    other: 'Notificações, {count} não lidas',
  },
  position: '{index} de {total}',
} satisfies Translation<typeof messages>
