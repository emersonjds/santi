import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  welcomeTitle: 'Boas-vindas ao santi',
  welcomeBody:
    'Prima C em qualquer lado para criar um item. Esta visita rápida mostra o essencial em menos de um minuto.',
  boardTitle: 'Quadro e backlog',
  boardBody:
    'O trabalho avança no quadro e planeia-se no backlog. Salte com G e depois B, ou G e depois L.',
  searchTitle: 'Pesquisar e saltar',
  searchBody:
    'Prima / para pesquisar dentro de um projeto, ou ⌘ K para saltar para qualquer projeto.',
  inviteTitle: 'Convide a sua equipa',
  inviteBody:
    'Os projetos são mais úteis em equipa. Utilize Convidar no topo de um projeto para adicionar colegas com uma ligação.',
  shortcutsTitle: 'Atalhos, CLI e MCP',
  shortcutsBody:
    'Prima ? a qualquer momento para ver a lista completa de atalhos. A CLI e um assistente de IA também leem e alteram itens.',
  tourStep: 'Passo {step} de {total}',
  back: 'Anterior',
  next: 'Seguinte',
  done: 'Concluir',
  skipTour: 'Saltar a visita',
} satisfies Translation<typeof messages>
