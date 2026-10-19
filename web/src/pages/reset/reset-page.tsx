import { useParams } from '@tanstack/react-router'
import { AuthLayout } from '@/widgets/auth-layout/auth-layout'
import { ResetPasswordForm } from '@/features/auth/reset-password-form'
import { Card, CardContent, CardHeader } from '@/shared/ui/card'

export const ResetPage = () => {
  const { token } = useParams({ from: '/reset/$token' })
  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <h1 className='text-lg leading-none font-semibold'>
            Choose a new password
          </h1>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={token} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
