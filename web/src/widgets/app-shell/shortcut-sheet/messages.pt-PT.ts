import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  keyboardShortcuts: 'Atalhos de teclado',
  shortcutsHint:
    'As teclas simples funcionam em todo o lado, exceto num campo onde esteja a escrever.',
  useShortcuts: 'Utilizar atalhos de teclado',
  replayTour: 'Rever a visita guiada',
  global: 'Geral',
  navigation: 'Navegação',
  issueActions: 'Ações do item',
  createIssue: 'Criar um item',
  searchProject: 'Pesquisar neste projeto',
  jumpToProject: 'Ir para um projeto',
  goToBoard: 'Ir para o quadro',
  goToBacklog: 'Ir para o backlog',
  linkIssue: 'Associar o item aberto a outro',
  showShortcuts: 'Mostrar estes atalhos',
  nextIssue: 'Item seguinte',
  previousIssue: 'Item anterior',
  nextColumn: 'Coluna ou secção seguinte',
  previousColumn: 'Coluna ou secção anterior',
  openIssue: 'Abrir o item selecionado',
  closeIssue: 'Fechar o item',
  assignToMe: 'Atribuir a mim',
  changeAssignee: 'Alterar o responsável pelo item aberto',
  commentOnIssue: 'Comentar o item aberto',
  editSummary: 'Editar o resumo de uma linha do backlog',
} satisfies Translation<typeof messages>
