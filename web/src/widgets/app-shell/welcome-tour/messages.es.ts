import type { Translation } from '@/shared/i18n/i18n'
import type { messages } from './messages'

export default {
  welcomeTitle: 'Te damos la bienvenida a santi',
  welcomeBody:
    'Pulsa C en cualquier parte para crear un elemento. Este breve recorrido cubre lo básico en menos de un minuto.',
  boardTitle: 'Tablero y backlog',
  boardBody:
    'El trabajo avanza en el tablero y se planifica en el backlog. Salta con G y luego B, o G y luego L.',
  searchTitle: 'Buscar y saltar',
  searchBody:
    'Pulsa / para buscar dentro de un proyecto, o ⌘ K para saltar a cualquier proyecto.',
  inviteTitle: 'Invita a tu equipo',
  inviteBody:
    'Los proyectos son más útiles en equipo. Usa Invitar en la parte superior de un proyecto para sumar compañeros con un enlace.',
  shortcutsTitle: 'Atajos, CLI y MCP',
  shortcutsBody:
    'Pulsa ? en cualquier momento para ver todos los atajos. La CLI y un asistente de IA también pueden leer y cambiar elementos.',
  tourStep: 'Paso {step} de {total}',
  back: 'Atrás',
  next: 'Siguiente',
  done: 'Listo',
  skipTour: 'Omitir recorrido',
} satisfies Translation<typeof messages>
