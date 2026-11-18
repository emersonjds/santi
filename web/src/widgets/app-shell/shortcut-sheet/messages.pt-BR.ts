import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  keyboardShortcuts: 'Atalhos de teclado',
  shortcutsHint:
    'Teclas simples funcionam em qualquer lugar, menos num campo em que você está digitando.',
  useShortcuts: 'Usar atalhos de teclado',
  replayTour: 'Rever o tour de boas-vindas',
  global: 'Geral',
  navigation: 'Navegação',
  issueActions: 'Ações do item',
  createIssue: 'Criar um item',
  searchProject: 'Buscar neste projeto',
  jumpToProject: 'Ir para um projeto',
  goToBoard: 'Ir para o quadro',
  goToBacklog: 'Ir para o backlog',
  linkIssue: 'Vincular o item aberto a outro',
  showShortcuts: 'Mostrar estes atalhos',
  nextIssue: 'Próximo item',
  previousIssue: 'Item anterior',
  nextColumn: 'Próxima coluna ou seção',
  previousColumn: 'Coluna ou seção anterior',
  openIssue: 'Abrir o item selecionado',
  closeIssue: 'Fechar o item',
  assignToMe: 'Atribuir a mim',
  changeAssignee: 'Mudar o responsável pelo item aberto',
  commentOnIssue: 'Comentar no item aberto',
  editSummary: 'Editar o resumo de uma linha do backlog',
} satisfies Translation<typeof messages>
