import { defineMessages } from '@/shared/i18n/i18n'

export const messages = defineMessages('widgets/app-shell/welcome-tour', {
  welcomeTitle: 'Welcome to santi',
  welcomeBody:
    'Press C anywhere to create an issue. This short tour covers the basics in under a minute.',
  boardTitle: 'Board and backlog',
  boardBody:
    'Work moves on the board; plan it in the backlog. Jump with G then B, or G then L.',
  searchTitle: 'Search and jump',
  searchBody:
    'Press / to search inside a project, or ⌘ K to jump to any project.',
  inviteTitle: 'Invite your team',
  inviteBody:
    'Projects are more useful together. Use Invite at the top of a project to add teammates with a link.',
  shortcutsTitle: 'Shortcuts, CLI and MCP',
  shortcutsBody:
    'Press ? any time for the full shortcut list. The CLI and an AI assistant can read and change issues too.',
  tourStep: 'Step {step} of {total}',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  skipTour: 'Skip tour',
})
