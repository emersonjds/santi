import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { App } from './app'
import { createAppRouter } from './router'
import './styles/index.css'

const queryClient = new QueryClient()
const router = createAppRouter(queryClient)
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App queryClient={queryClient} router={router} />
    </StrictMode>
  )
}
