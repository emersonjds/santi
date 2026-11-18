import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { sessionQuery } from '@/entities/session/session-query'
import {
  readStoredLanguage,
  readyOrTimeout,
  switchLanguage,
} from '@/shared/i18n/i18n'
import { listenForStaleChunks } from '@/shared/lib/stale-chunks'
import { App } from './app'
import { createApp } from './create-app'
import './styles/index.css'

listenForStaleChunks()
const { queryClient, router } = createApp()
const root = document.getElementById('root')

const render = () => {
  if (!root) return
  createRoot(root).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>
  )
}

// D62: a non-English device renders once its language's chunk is in (2 s at most), with /api/me already on its way.
const stored = readStoredLanguage()
if (stored === 'en') render()
else {
  void queryClient.prefetchQuery(sessionQuery)
  void readyOrTimeout(switchLanguage(stored), 2000).then(render)
}
