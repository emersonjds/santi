import { useSuspenseQuery } from '@tanstack/react-query'
import { boardSettingsQuery } from '@/entities/issue/board-query'
import { NativeSelect } from '@/shared/ui/native-select'
import { RootError } from '@/shared/ui/root-error'
import { useSettingsEdit } from './settings-edits'

const NEVER = 'never'

/** KB-23, D8: kanban boards hide done work this long after it reached done. */
export const DoneWindow = ({ projectKey }: { projectKey: string }) => {
  const { data: settings } = useSuspenseQuery(boardSettingsQuery(projectKey))
  const edit = useSettingsEdit(projectKey)
  return (
    <section aria-labelledby='done-window-title' className='grid gap-3'>
      <h3 id='done-window-title' className='text-base font-semibold'>
        Done work
      </h3>
      <p className='text-sm text-muted-foreground'>
        Done issues leave the board once they have been done this long. Search
        still finds them.
      </p>
      <label className='grid max-w-xs gap-1 text-sm font-medium'>
        Hide done work after
        <NativeSelect
          value={settings.done_window_days?.toString() ?? NEVER}
          onChange={(event) =>
            edit.mutate({
              kind: 'done-window',
              done_window_days:
                event.target.value === NEVER
                  ? null
                  : Number(event.target.value),
            })
          }
        >
          <option value='7'>7 days</option>
          <option value='14'>14 days</option>
          <option value='30'>30 days</option>
          <option value={NEVER}>Never</option>
        </NativeSelect>
      </label>
      <RootError message={edit.error?.message} />
    </section>
  )
}
