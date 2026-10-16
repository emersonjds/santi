import { Link, useSearch } from '@tanstack/react-router'
import { AuthLayout } from '@/widgets/auth-layout/auth-layout'
import { SignInForm } from '@/features/auth/sign-in-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card'

export const LoginPage = () => {
  const { redirect } = useSearch({ from: '/login' })
  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <h1 className='text-lg leading-none font-semibold'>Sign in</h1>
          <CardDescription>
            New to santi?{' '}
            <Link
              to='/register'
              search={{ redirect }}
              className='text-primary underline'
            >
              Create an account
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm redirectTo={redirect} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
