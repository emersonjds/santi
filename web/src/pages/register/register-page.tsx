import { useQuery } from '@tanstack/react-query'
import { Link, useSearch } from '@tanstack/react-router'
import { AuthLayout } from '@/widgets/auth-layout/auth-layout'
import { SignUpForm } from '@/features/auth/sign-up-form'
import {
  legalDocumentsQuery,
  useLegalRequired,
} from '@/entities/session/legal-queries'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card'

export const RegisterPage = () => {
  const { redirect } = useSearch({ from: '/register' })
  const { data: legal } = useQuery(legalDocumentsQuery)
  const legalRequired = useLegalRequired(legal?.required)
  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <h1 className='text-lg leading-none font-semibold'>
            Create an account
          </h1>
          <CardDescription>
            Already have one?{' '}
            <Link
              to='/login'
              search={{ redirect }}
              className='text-primary underline'
            >
              Sign in
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm redirectTo={redirect} />
          {legalRequired && (
            <p className='mt-4 text-sm text-muted-foreground'>
              We never sell your data.{' '}
              <a href='/privacy' className='text-primary underline'>
                Read our privacy policy
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
