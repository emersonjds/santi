import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { createApp } from './create-app'
import { listenForStaleChunks } from '@/shared/lib/stale-chunks'
import './styles/index.css'

listenForStaleChunks()
const { queryClient, router } = createApp()
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>
  )
}
