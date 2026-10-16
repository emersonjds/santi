import { Link } from '@tanstack/react-router'
import { AuthLayout } from '@/widgets/auth-layout/auth-layout'
import { SignUpForm } from '@/features/auth/sign-up-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card'

export const RegisterPage = () => (
  <AuthLayout>
    <Card>
      <CardHeader>
        <h1 className='text-lg leading-none font-semibold'>
          Create an account
        </h1>
        <CardDescription>
          Already have one?{' '}
          <Link to='/login' className='text-primary underline'>
            Sign in
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm />
      </CardContent>
    </Card>
  </AuthLayout>
)
