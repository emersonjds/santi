import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  toggleProject: 'Expandir ou recolher {name}',
  board: 'Quadro',
  backlog: 'Backlog',
  reports: 'Relatórios',
  settings: 'Configurações',
  projectsFailed: 'Os projetos não carregaram.',
  noProjects: 'Nenhum projeto ainda',
  createProject: 'Criar projeto',
  starred: 'Favoritos',
  recent: 'Recentes',
} satisfies Translation<typeof messages>
