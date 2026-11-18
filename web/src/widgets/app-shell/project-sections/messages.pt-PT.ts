import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  toggleProject: 'Expandir ou fechar {name}',
  board: 'Quadro',
  backlog: 'Backlog',
  reports: 'Relatórios',
  settings: 'Definições',
  projectsFailed: 'Não foi possível carregar os projetos.',
  noProjects: 'Ainda sem projetos',
  createProject: 'Criar projeto',
  starred: 'Favoritos',
  recent: 'Recentes',
} satisfies Translation<typeof messages>
