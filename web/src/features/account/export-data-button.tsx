import { useMutation } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { api, dataOrThrow } from '@/shared/api/client'
import { toast } from '@/shared/lib/toast'
import { Button } from '@/shared/ui/button'

const save = (data: unknown) => {
  const file = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = `santi-export-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** D45: the account and every project it administers, as one JSON file. */
export const ExportDataButton = () => {
  const download = useMutation({
    mutationFn: async () => dataOrThrow(await api.GET('/api/me/export')),
    onSuccess: save,
    onError: (error) => toast.error(error.message),
  })

  return (
    <Button
      variant='outline'
      className='h-11 md:h-9'
      disabled={download.isPending}
      onClick={() => download.mutate()}
    >
      {download.isPending ? <Loader2 className='animate-spin' /> : <Download />}
      Export my data
    </Button>
  )
}
