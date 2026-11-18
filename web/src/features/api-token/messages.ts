import { defineMessages } from '@/shared/i18n/i18n'

export const messages = defineMessages('features/api-token', {
  enterName: 'Enter a name.',
  nameTooLong: 'Use at most 100 characters.',
  newToken: 'New token',
  copied: 'Copied',
  copyToken: 'Copy token',
  copyNow: 'Copy it now: you will not see it again.',
  done: 'Done',
  tokenName: 'Token name',
  tokenNameHint: 'Token name, like laptop or CI',
  createToken: 'Create token',
  revoke: 'Revoke',
  revokeName: 'Revoke {name}',
  revokeTitle: 'Revoke {name}?',
  revokeEffect: 'Anything using this token will stop working right away.',
  cancel: 'Cancel',
  revokeToken: 'Revoke token',
})
