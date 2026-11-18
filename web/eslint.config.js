import pluginQuery from '@tanstack/eslint-plugin-query'
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// FSD (D37): a layer imports only from the layers below it.
const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const onlyDownward = layers.slice(1).map((layer, index) => ({
  files: [`src/${layer}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: layers.slice(0, index + 1).map((upper) => `@/${upper}/*`),
            message: `${layer} imports only from layers below it (FSD, D37).`,
          },
        ],
      },
    ],
  },
}))

// D62 A5: files whose copy moved to messages.ts; the list grows batch by batch until it covers src/**/*.tsx.
const translated = [
  'src/pages/account/account-page.tsx',
  'src/features/account/change-password-form.tsx',
  'src/features/account/delete-account-button.tsx',
  'src/features/account/delete-account-dialog.tsx',
  'src/features/account/display-name-field.tsx',
  'src/features/account/export-data-button.tsx',
  'src/features/account/language-control.tsx',
  'src/features/account/sessions-list.tsx',
  'src/features/account/theme-control.tsx',
  'src/features/account/time-zone-control.tsx',
  'src/features/account/time-zone-picker.tsx',
  'src/features/api-token/create-token-form.tsx',
  'src/features/api-token/revoke-token-button.tsx',
  'src/features/api-token/revoke-token-dialog.tsx',
  'src/widgets/app-shell/account-button.tsx',
  'src/widgets/app-shell/account-menu.tsx',
  'src/widgets/app-shell/app-shell.tsx',
  'src/widgets/app-shell/app-sidebar.tsx',
  'src/widgets/app-shell/create-button.tsx',
  'src/widgets/app-shell/notifications-button.tsx',
  'src/widgets/app-shell/notifications-menu.tsx',
  'src/widgets/app-shell/project-actions-button.tsx',
  'src/widgets/app-shell/project-sections.tsx',
  'src/widgets/app-shell/shortcut-sheet.tsx',
  'src/widgets/app-shell/shortcuts.tsx',
  'src/widgets/app-shell/sidebar-entries.tsx',
  'src/widgets/app-shell/tour-host.tsx',
  'src/widgets/app-shell/welcome-tour.tsx',
]
const copyAttribute =
  'JSXAttribute[name.name=/^(aria-label|placeholder|title|alt|label)$/]'
const rawCopy = 'Copy comes from messages.ts through useT (D62).'
const notCopy =
  'JSXAttribute[name.name=/^(className|key|id|href|to|type|role|name|value|htmlFor|lang|dir|data-.+|aria-(hidden|controls|describedby|labelledby|current|live|haspopup|expanded))$/] *'
const rendered = ':matches(LogicalExpression, ConditionalExpression)'

export default defineConfig(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'src/shared/ui',
      'src/app/routeTree.gen.ts',
      'src/shared/api/schema.d.ts',
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...pluginQuery.configs['flat/recommended'],
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-console': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Enforce type-only imports for TypeScript types
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      // Prevent duplicate imports from the same module
      'no-duplicate-imports': 'error',
    },
  },
  ...onlyDownward,
  {
    files: translated,
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'JSXText[value=/[A-Za-z]/]', message: rawCopy },
        {
          selector: `${copyAttribute} > Literal[value=/[A-Za-z]/]`,
          message: rawCopy,
        },
        {
          selector: `:matches(JSXExpressionContainer, JSXExpressionContainer ${rendered}) > Literal[value=/[A-Za-z]/]:not(${notCopy})`,
          message: rawCopy,
        },
        {
          selector: `JSXExpressionContainer TemplateElement[value.raw=/[A-Za-z]/]:not(${notCopy})`,
          message: rawCopy,
        },
      ],
    },
  }
)
