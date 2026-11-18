import { defineMessages } from '@/shared/i18n/i18n'

export const messages = defineMessages('pages/account', {
  account: 'Account',
  profile: 'Profile',
  email: 'Email',
  preferences: 'Preferences',
  security: 'Security',
  sessions: 'Sessions',
  apiTokens: 'API tokens',
  tokensIntro:
    'The CLI and MCP sign in with a token sent as {header}. A token acts with all your rights until you revoke it.',
  noTokens: 'No tokens yet.',
  created: 'Created {date}',
  yourData: 'Your data',
  dataIntro:
    'Your data is yours: download everything santi holds about you and the projects you run, or delete your account.',
  privacyPolicy: 'Privacy Policy',
})
