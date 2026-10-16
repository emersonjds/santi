import { type DragEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileUp, Loader2 } from 'lucide-react'
import {
  type ImportPreview,
  api,
  dataOrThrow,
  fieldMessage,
  formData,
} from '@/shared/api/client'
import { cn } from '@/shared/lib/utils'
import { Disclosure } from '@/shared/ui/disclosure'
import { RootError } from '@/shared/ui/root-error'

const MAX_BYTES = 10 * 1024 * 1024

const refusal = (file: File) => {
  if (!file.name.toLowerCase().endsWith('.csv'))
    return 'Pick a .csv file, as the export saved it.'
  if (file.size > MAX_BYTES)
    return 'This file is over 10 MB. Export fewer issues per file and import each one.'
}

const HELP = [
  {
    source: 'From Jira',
    steps:
      'Search for the issues you want to move (for example, the whole project), open the export menu above the results and pick the CSV option with all fields. Leave the date format as it is.',
    href: 'https://support.atlassian.com/jira/kb/how-to-export-issues-from-jira-cloud-in-csv-format/',
    guide: "Atlassian's export guide",
  },
  {
    source: 'From Linear',
    steps:
      'A workspace admin opens the workspace settings, goes to import and export, and asks for a CSV export. Linear emails a link to the file.',
    href: 'https://linear.app/docs/exporting-data',
    guide: "Linear's export guide",
  },
]

type UploadStepProps = {
  projectKey: string
  onPreview: (file: File, preview: ImportPreview) => void
}

/** Step 1: a CSV export, checked here first and then read by the server (D41). */
export const UploadStep = ({ projectKey, onPreview }: UploadStepProps) => {
  const [problem, setProblem] = useState<string>()
  const [over, setOver] = useState(false)
  const preview = useMutation({
    mutationFn: async (file: File) =>
      dataOrThrow(
        await api.POST('/api/projects/{key}/imports/preview', {
          params: { path: { key: projectKey } },
          // The generated type calls the binary part a string; the File itself rides in the serializer.
          body: { file: file.name },
          bodySerializer: () => formData(file),
        })
      ),
    onSuccess: (data, file) => onPreview(file, data),
    onError: (error) => setProblem(fieldMessage(error)),
  })

  const take = (file: File | undefined) => {
    if (!file) return
    const refused = refusal(file)
    setProblem(refused)
    if (!refused) preview.mutate(file)
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    take(event.dataTransfer.files[0])
  }

  return (
    <div className='grid gap-6'>
      <h3 className='font-semibold'>Upload an export</h3>
      <section
        aria-label='Drop a CSV export here'
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn(
          'grid justify-items-center gap-3 rounded-lg border border-dashed border-input bg-muted px-4 py-10 text-center transition-colors duration-150 ease-out',
          over && 'border-primary bg-accent'
        )}
      >
        <FileUp className='size-8 text-muted-foreground' aria-hidden='true' />
        <p className='font-medium'>Drop a CSV export here</p>
        <label className='inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2'>
          {preview.isPending && (
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
          )}
          Choose a CSV file
          <input
            type='file'
            accept='.csv,text/csv'
            className='sr-only'
            disabled={preview.isPending}
            onChange={(event) => {
              take(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        <p className='text-sm text-muted-foreground'>
          Up to 10 MB. Nothing is saved until you confirm the next step.
        </p>
        <RootError message={problem} />
      </section>
      <section aria-labelledby='how-to-export' className='grid gap-2'>
        <h4 id='how-to-export' className='text-sm font-semibold'>
          How to export
        </h4>
        {HELP.map((help) => (
          <Disclosure key={help.source} title={help.source}>
            <p className='pb-2 text-sm text-muted-foreground'>{help.steps}</p>
            <a
              href={help.href}
              target='_blank'
              rel='noreferrer'
              className='inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline'
            >
              {help.guide} (opens a new tab)
            </a>
          </Disclosure>
        ))}
      </section>
    </div>
  )
}
