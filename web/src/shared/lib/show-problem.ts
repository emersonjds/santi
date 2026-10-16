import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import type { Problem } from '@/shared/api/client'

/** Puts each D24 `errors[]` entry on its form field; anything else lands on the form root. */
export const showProblem = <Values extends FieldValues>(
  setError: UseFormSetError<Values>,
  fields: readonly Path<Values>[],
  problem: Problem
) => {
  let shownOnField = false
  for (const error of problem.errors ?? []) {
    const field = fields.find((name) => name === error.field)
    if (!field) continue
    setError(field, { message: error.message })
    shownOnField = true
  }
  if (!shownOnField) setError('root', { message: problem.detail })
}
