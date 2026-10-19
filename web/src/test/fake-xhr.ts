import { vi } from 'vitest'

/** The part of XMLHttpRequest the upload helper uses; a test drives progress, the answer or a network failure. */
export class FakeXhr {
  method = ''
  url = ''
  body: unknown = null
  withCredentials = false
  responseType = ''
  status = 0
  statusText = ''
  response: unknown = null
  aborted = false
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor(private readonly sent: FakeXhr[]) {}

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  send(body: unknown) {
    this.body = body
    this.sent.push(this)
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }

  /** The name of the one file in the body. */
  get fileName() {
    const file = this.body instanceof FormData && this.body.get('file')
    return file instanceof File ? file.name : ''
  }

  progress(loaded: number, total: number) {
    this.upload.onprogress?.(
      new ProgressEvent('progress', { loaded, total, lengthComputable: true })
    )
  }

  respond(status: number, response: unknown) {
    this.status = status
    this.response = response
    this.onload?.()
  }

  fail() {
    this.onerror?.()
  }
}

/** Replaces XMLHttpRequest for the test; returns every request sent, in order. */
export const fakeXhr = () => {
  const sent: FakeXhr[] = []
  vi.stubGlobal(
    'XMLHttpRequest',
    class extends FakeXhr {
      constructor() {
        super(sent)
      }
    }
  )
  return sent
}
