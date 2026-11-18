import { Suspense, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { DeleteAccountButton } from '@/features/account/delete-account-button'
import { DisplayNameField } from '@/features/account/display-name-field'
import { ExportDataButton } from '@/features/account/export-data-button'
import { LanguageControl } from '@/features/account/language-control'
import { SessionsList } from '@/features/account/sessions-list'
import { ThemeControl } from '@/features/account/theme-control'
import { TimeZoneControl } from '@/features/account/time-zone-control'
import { RevokeTokenButton } from '@/features/api-token/revoke-token-button'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import { useTimeZone } from '@/entities/session/session-query'
import { tokensQuery } from '@/entities/user/api-tokens'
import { offeredLanguages, useT } from '@/shared/i18n/i18n'
import { formatDate } from '@/shared/lib/format-date'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Skeleton } from '@/shared/ui/skeleton'
import { preloadAccountForms } from './load-account-forms'
import { messages } from './messages'

const BEARER = 'Authorization: Bearer'

// Lazy: react-hook-form stays off the first visit; each form has its own fixed-height boundary (D39).
const ChangePasswordForm = lazy(() =>
  preloadAccountForms().then((module) => ({
    default: module.ChangePasswordForm,
  }))
)
const CreateTokenForm = lazy(() =>
  preloadAccountForms().then((module) => ({
    default: module.CreateTokenForm,
  }))
)

type ReadOnlyFieldProps = { id: string; label: string; value: string }

const ReadOnlyField = ({ id, label, value }: ReadOnlyFieldProps) => (
  <div className='grid gap-1.5'>
    <Label htmlFor={id}>{label}</Label>
    <Input
      id={id}
      readOnly
      value={value}
      className='h-11 bg-muted text-base md:text-sm'
    />
  </div>
)

const TokenList = () => {
  const t = useT(messages)
  const { data: tokens, error } = useQuery(tokensQuery)
  const timeZone = useTimeZone()
  if (error) throw error
  if (!tokens) return <Skeleton className='h-11' />
  if (tokens.length === 0)
    return <p className='text-sm text-muted-foreground'>{t('noTokens')}</p>
  return (
    <ul className='grid gap-px overflow-hidden rounded-md border bg-border'>
      {tokens.map((token) => (
        <li
          key={token.id}
          className='flex min-h-11 items-center gap-3 bg-card px-3 py-2'
        >
          <span className='grid min-w-0 flex-1'>
            <span className='truncate font-medium'>{token.name}</span>
            <span className='text-xs text-muted-foreground'>
              {t('created', {
                date: formatDate(
                  token.created_at,
                  { dateStyle: 'medium' },
                  timeZone
                ),
              })}
            </span>
          </span>
          <RevokeTokenButton token={token} />
        </li>
      ))}
    </ul>
  )
}

export const AccountPage = () => {
  const t = useT(messages)
  const { user } = useRouteContext({ from: '/_authenticated' })
  const { data: legal } = useQuery(legalDocumentsQuery)
  const legalPages = useLegalRequired(legal?.required)

  return (
    <div className='mx-auto grid w-full max-w-2xl gap-8 px-4 py-8'>
      <h1 className='text-2xl font-semibold tracking-tight'>{t('account')}</h1>
      <section aria-labelledby='profile' className='grid gap-4'>
        <h2 id='profile' className='text-lg font-semibold'>
          {t('profile')}
        </h2>
        <DisplayNameField saved={user.display_name} />
        <ReadOnlyField
          id='account-email'
          label={t('email')}
          value={user.email}
        />
      </section>
      <section aria-labelledby='preferences' className='grid gap-4'>
        <h2 id='preferences' className='text-lg font-semibold'>
          {t('preferences')}
        </h2>
        <ThemeControl saved={user.theme} />
        {offeredLanguages().length > 1 && (
          <LanguageControl saved={user.language} />
        )}
        <TimeZoneControl saved={user.time_zone} />
      </section>
      <section aria-labelledby='security' className='grid gap-4'>
        <h2
          id='security'
          tabIndex={-1}
          className='text-lg font-semibold outline-none'
        >
          {t('security')}
        </h2>
        <Suspense fallback={<Skeleton className='h-[318px]' />}>
          <ChangePasswordForm />
        </Suspense>
        <h3 className='font-medium'>{t('sessions')}</h3>
        <SessionsList headingId='security' />
      </section>
      <section aria-labelledby='tokens' className='grid gap-4'>
        <div className='grid gap-1'>
          <h2 id='tokens' className='text-lg font-semibold'>
            {t('apiTokens')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t.rich('tokensIntro', {
              header: <code className='font-mono'>{BEARER}</code>,
            })}
          </p>
        </div>
        <Suspense fallback={<Skeleton className='h-28 sm:h-14' />}>
          <CreateTokenForm />
        </Suspense>
        <TokenList />
      </section>
      <section aria-labelledby='your-data' className='grid gap-4'>
        <div className='grid gap-1'>
          <h2 id='your-data' className='text-lg font-semibold'>
            {t('yourData')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('dataIntro')}
            {legalPages && (
              <>
                {' '}
                <a href='/privacy' className='text-primary underline'>
                  {t('privacyPolicy')}
                </a>
              </>
            )}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <ExportDataButton />
          <DeleteAccountButton />
        </div>
      </section>
    </div>
  )
}
