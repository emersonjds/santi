import type { ImportPreview } from '@/shared/api/client'

/** Rows the server refused or changed, by line of the file (the first 100). */
export const ProblemRows = ({
  problems,
}: {
  problems: ImportPreview['problems']
}) =>
  problems.length > 0 && (
    <details className='rounded-md border px-3'>
      <summary className='flex min-h-11 cursor-pointer items-center text-sm font-medium'>
        {problems.length === 1
          ? '1 row with a problem'
          : `${problems.length} rows with problems`}
      </summary>
      <ul className='grid gap-1 pb-3 text-sm text-muted-foreground'>
        {problems.map((problem, index) => (
          <li key={index}>
            Line {problem.line}: {problem.message}
          </li>
        ))}
      </ul>
    </details>
  )
