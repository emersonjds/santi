import { CreateProjectForm } from '@/features/project/create-project-form'
import { SampleProjectButton } from '@/features/project/sample-project-button'

export const NewProjectPage = () => (
  <div className='mx-auto w-full max-w-xl px-4 py-8'>
    <h1 className='text-2xl font-semibold tracking-tight'>New project</h1>
    <p className='mt-1.5 text-muted-foreground'>
      You will be its admin and can invite your team next.
    </p>
    <div className='mt-6'>
      <CreateProjectForm />
    </div>
    <div className='mt-8 grid justify-items-start gap-2 border-t pt-6'>
      <p className='text-sm text-muted-foreground'>
        Just looking around? Open a sample with sprints, epics and issues
        already in place.
      </p>
      <SampleProjectButton />
    </div>
  </div>
)
