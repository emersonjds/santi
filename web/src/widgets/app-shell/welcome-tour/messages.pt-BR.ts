import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  welcomeTitle: 'Boas-vindas ao santi',
  welcomeBody:
    'Pressione C em qualquer lugar para criar um item. Este tour rápido mostra o básico em menos de um minuto.',
  boardTitle: 'Quadro e backlog',
  boardBody:
    'O trabalho anda no quadro e é planejado no backlog. Vá direto com G e depois B, ou G e depois L.',
  searchTitle: 'Buscar e ir direto',
  searchBody:
    'Pressione / para buscar dentro de um projeto, ou ⌘ K para ir a qualquer projeto.',
  inviteTitle: 'Convide sua equipe',
  inviteBody:
    'Projetos rendem mais em equipe. Use Convidar no topo de um projeto para chamar colegas com um link.',
  shortcutsTitle: 'Atalhos, CLI e MCP',
  shortcutsBody:
    'Pressione ? a qualquer momento para ver todos os atalhos. A CLI e um assistente de IA também leem e alteram itens.',
  tourStep: 'Passo {step} de {total}',
  back: 'Voltar',
  next: 'Próximo',
  done: 'Concluir',
  skipTour: 'Pular o tour',
} satisfies Translation<typeof messages>
