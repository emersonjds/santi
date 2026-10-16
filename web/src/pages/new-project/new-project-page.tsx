import { CreateProjectForm } from '@/features/project/create-project-form'

export const NewProjectPage = () => (
  <div className='mx-auto w-full max-w-xl px-4 py-8'>
    <h1 className='text-2xl font-semibold tracking-tight'>New project</h1>
    <p className='mt-1.5 text-muted-foreground'>
      You will be its admin and can invite your team next.
    </p>
    <div className='mt-6'>
      <CreateProjectForm />
    </div>
  </div>
)
