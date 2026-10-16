import { useParams } from '@tanstack/react-router'
import { AuthLayout } from '@/widgets/auth-layout/auth-layout'
import { JoinProject } from '@/features/project/join-project'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/shared/ui/card'

export const JoinPage = () => {
  const { token } = useParams({ from: '/invites/$token' })
  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <h1 className='text-lg leading-none font-semibold'>Join a project</h1>
          <CardDescription>
            You were invited to a project. Joining adds it to your sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinProject token={token} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
