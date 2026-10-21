import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { DeleteAccountButton } from '@/features/account/delete-account-button'
import { DisplayNameField } from '@/features/account/display-name-field'
import { ExportDataButton } from '@/features/account/export-data-button'
import { ThemeControl } from '@/features/account/theme-control'
import { TimeZoneControl } from '@/features/account/time-zone-control'
import { CreateTokenForm } from '@/features/api-token/create-token-form'
import { RevokeTokenButton } from '@/features/api-token/revoke-token-button'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import { useTimeZone } from '@/entities/session/session-query'
import { tokensQuery } from '@/entities/user/api-tokens'
import { formatDate } from '@/shared/lib/format-date'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Skeleton } from '@/shared/ui/skeleton'

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
  const { data: tokens, error } = useQuery(tokensQuery)
  const timeZone = useTimeZone()
  if (error) throw error
  if (!tokens) return <Skeleton className='h-11' />
  if (tokens.length === 0)
    return <p className='text-sm text-muted-foreground'>No tokens yet.</p>
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
              Created{' '}
              {formatDate(token.created_at, { dateStyle: 'medium' }, timeZone)}
            </span>
          </span>
          <RevokeTokenButton token={token} />
        </li>
      ))}
    </ul>
  )
}

export const AccountPage = () => {
  const { user } = useRouteContext({ from: '/_authenticated' })
  const { data: legal } = useQuery(legalDocumentsQuery)
  const legalPages = useLegalRequired(legal?.required)

  return (
    <div className='mx-auto grid w-full max-w-2xl gap-8 px-4 py-8'>
      <h1 className='text-2xl font-semibold tracking-tight'>Account</h1>
      <section aria-labelledby='profile' className='grid gap-4'>
        <h2 id='profile' className='text-lg font-semibold'>
          Profile
        </h2>
        <DisplayNameField saved={user.display_name} />
        <ReadOnlyField id='account-email' label='Email' value={user.email} />
      </section>
      <section aria-labelledby='preferences' className='grid gap-4'>
        <h2 id='preferences' className='text-lg font-semibold'>
          Preferences
        </h2>
        <ThemeControl saved={user.theme} />
        <TimeZoneControl saved={user.time_zone} />
      </section>
      <section aria-labelledby='tokens' className='grid gap-4'>
        <div className='grid gap-1'>
          <h2 id='tokens' className='text-lg font-semibold'>
            API tokens
          </h2>
          <p className='text-sm text-muted-foreground'>
            The CLI and MCP sign in with a token sent as{' '}
            <code className='font-mono'>Authorization: Bearer</code>. A token
            acts with all your rights until you revoke it.
          </p>
        </div>
        <CreateTokenForm />
        <TokenList />
      </section>
      <section aria-labelledby='your-data' className='grid gap-4'>
        <div className='grid gap-1'>
          <h2 id='your-data' className='text-lg font-semibold'>
            Your data
          </h2>
          <p className='text-sm text-muted-foreground'>
            Your data is yours: download everything santi holds about you and
            the projects you run, or delete your account.
            {legalPages && (
              <>
                {' '}
                <a href='/privacy' className='text-primary underline'>
                  Privacy Policy
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
