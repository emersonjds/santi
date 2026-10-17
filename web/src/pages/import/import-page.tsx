import { Suspense, lazy, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { ForbiddenPage } from '@/pages/forbidden/forbidden-page'
import { projectQuery } from '@/entities/project/project-queries'
import { useProjectWritable } from '@/entities/project/writable'
import type { ImportPreview, ImportResult } from '@/shared/api/client'
import { Skeleton } from '@/shared/ui/skeleton'

// Lazy: each step loads when it is reached, outside the route's first-visit JS (D39).
const UploadStep = lazy(() =>
  import('@/features/import/upload-step').then((module) => ({
    default: module.UploadStep,
  }))
)
const MappingStep = lazy(() =>
  import('@/features/import/mapping-step').then((module) => ({
    default: module.MappingStep,
  }))
)
const ImportResultView = lazy(() =>
  import('@/features/import/import-result').then((module) => ({
    default: module.ImportResultView,
  }))
)

type Step =
  | { name: 'upload' }
  | { name: 'review'; file: File; preview: ImportPreview }
  | { name: 'done'; result: ImportResult }

const NUMBER = { upload: 1, review: 2, done: 3 } satisfies Record<
  Step['name'],
  number
>

/** D41: a Jira or Linear CSV export in three steps (upload, review, import), for admins only. */
export const ImportPage = () => {
  const { key } = useParams({ from: '/_authenticated/p/$key' })
  const { data: project } = useSuspenseQuery(projectQuery(key))
  const [step, setStep] = useState<Step>({ name: 'upload' })
  const writable = useProjectWritable(key)
  if (project.role !== 'admin') return <ForbiddenPage projectKey={key} />
  const kanban = project.board_type === 'kanban'
  const restart = () => setStep({ name: 'upload' })

  return (
    <div className='mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:px-6'>
      <div className='grid gap-1'>
        <h2 className='text-lg font-semibold'>Import issues</h2>
        <p className='text-sm text-muted-foreground'>
          Step {NUMBER[step.name]} of 3
        </p>
      </div>
      {!writable && (
        <p className='text-sm text-muted-foreground'>
          Unarchive the project to import issues.
        </p>
      )}
      <Suspense fallback={<Skeleton className='h-96' />}>
        {writable && step.name === 'upload' && (
          <UploadStep
            projectKey={key}
            onPreview={(file, preview) =>
              setStep({ name: 'review', file, preview })
            }
          />
        )}
        {step.name === 'review' && (
          <MappingStep
            projectKey={key}
            kanban={kanban}
            file={step.file}
            preview={step.preview}
            onBack={restart}
            onDone={(result) => setStep({ name: 'done', result })}
          />
        )}
        {step.name === 'done' && (
          <ImportResultView
            projectKey={key}
            kanban={kanban}
            result={step.result}
            onAgain={restart}
          />
        )}
      </Suspense>
    </div>
  )
}
