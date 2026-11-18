import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  keyboardShortcuts: 'Atajos de teclado',
  shortcutsHint:
    'Las teclas simples funcionan en cualquier parte, salvo en un campo donde estés escribiendo.',
  useShortcuts: 'Usar atajos de teclado',
  replayTour: 'Repetir el recorrido de bienvenida',
  global: 'Generales',
  navigation: 'Navegación',
  issueActions: 'Acciones del elemento',
  createIssue: 'Crear un elemento',
  searchProject: 'Buscar en este proyecto',
  jumpToProject: 'Ir a un proyecto',
  goToBoard: 'Ir al tablero',
  goToBacklog: 'Ir al backlog',
  linkIssue: 'Vincular el elemento abierto con otro',
  showShortcuts: 'Mostrar estos atajos',
  nextIssue: 'Elemento siguiente',
  previousIssue: 'Elemento anterior',
  nextColumn: 'Columna o sección siguiente',
  previousColumn: 'Columna o sección anterior',
  openIssue: 'Abrir el elemento seleccionado',
  closeIssue: 'Cerrar el elemento',
  assignToMe: 'Asignarme',
  changeAssignee: 'Cambiar el responsable del elemento abierto',
  commentOnIssue: 'Comentar el elemento abierto',
  editSummary: 'Editar el resumen de una fila del backlog',
} satisfies Translation<typeof messages>
