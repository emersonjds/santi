import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { legalStatusQuery } from '@/entities/session/legal-queries'
import { api, dataOrThrow } from '@/shared/api/client'
import { Button } from '@/shared/ui/button'
import { RootError } from '@/shared/ui/root-error'
import { AGE_REQUIRED, TERMS_REQUIRED, TermsLabel } from './terms-label'

type CheckProps = {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  children: ReactNode
}

const Check = ({ id, checked, onChange, error, children }: CheckProps) => (
  <div className='grid gap-1'>
    <div className='flex min-h-11 items-start gap-3'>
      <input
        id={id}
        type='checkbox'
        className='mt-0.5 size-5 shrink-0 accent-primary'
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
      />
      <label htmlFor={id} className='text-sm leading-snug'>
        {children}
      </label>
    </div>
    <p id={`${id}-error`} className='text-sm text-destructive'>
      {error}
    </p>
  </div>
)

const AcceptLegal = () => {
  const queryClient = useQueryClient()
  const [terms, setTerms] = useState(false)
  const [age, setAge] = useState(false)
  const [tried, setTried] = useState(false)
  const accept = useMutation({
    mutationFn: async () =>
      dataOrThrow(
        await api.POST('/api/me/legal', {
          body: { accept_terms: true, confirm_age: true },
        })
      ),
    onSuccess: (status) =>
      queryClient.setQueryData(legalStatusQuery.queryKey, status),
  })

  return (
    <div className='mx-auto grid w-full max-w-xl gap-5 px-4 py-8'>
      <div className='grid gap-1.5'>
        <h1 className='text-2xl font-semibold tracking-tight'>
          Review the updated terms
        </h1>
        <p className='text-muted-foreground'>
          The Terms of Use or the Privacy Policy changed since you last accepted
          them. Read them and accept to keep using santi; you can also export
          your data or delete your account from the account page.
        </p>
      </div>
      <form
        className='grid gap-3'
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setTried(true)
          if (terms && age) accept.mutate()
        }}
      >
        <Check
          id='gate-terms'
          checked={terms}
          onChange={setTerms}
          error={tried && !terms ? TERMS_REQUIRED : undefined}
        >
          <TermsLabel />
        </Check>
        <Check
          id='gate-age'
          checked={age}
          onChange={setAge}
          error={tried && !age ? AGE_REQUIRED : undefined}
        >
          I am 18 or older
        </Check>
        <RootError message={accept.error?.message} />
        <Button className='h-11 justify-self-start' disabled={accept.isPending}>
          {accept.isPending && <Loader2 className='animate-spin' />}
          Accept and continue
        </Button>
      </form>
    </div>
  )
}

/** D45: an account that has not accepted the current versions sees this before the app; the app stays closed until the answer arrives. */
export const LegalGate = ({ children }: { children: ReactNode }) => {
  const { data, isError, refetch } = useQuery(legalStatusQuery)
  if (isError)
    return (
      <div
        role='alert'
        className='mx-auto mt-8 flex w-full max-w-xl items-center justify-between gap-4 rounded-lg border px-4 py-3'
      >
        The terms check did not load.
        <Button
          variant='outline'
          className='h-11 md:h-9'
          onClick={() => refetch()}
        >
          Try again
        </Button>
      </div>
    )
  if (data?.accepted === false) return <AcceptLegal />
  // Mounted but hidden while pending, the page's queries join the route's prefetches; the
  // wrapper stays put so nothing remounts when the answer arrives.
  return (
    <>
      {!data && (
        <div
          role='status'
          aria-label='Checking the terms'
          className='flex flex-1 items-center justify-center py-16'
        >
          <Loader2 className='size-6 animate-spin text-muted-foreground' />
        </div>
      )}
      <div className={data ? 'contents' : 'hidden'}>{children}</div>
    </>
  )
}
