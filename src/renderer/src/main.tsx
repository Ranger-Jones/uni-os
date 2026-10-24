import './styles.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { ConfirmHost } from './components/ui/confirm'
import { PromptHost } from './components/ui/prompt'
import { queryClient } from './lib/queries'
import { useDarkMode } from './lib/theme'
import { router } from './router'

function App() {
  const dark = useDarkMode()
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ConfirmHost />
      <PromptHost />
      <Toaster position="bottom-right" theme={dark ? 'dark' : 'light'} toastOptions={{ className: 'text-[13px]' }} />
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
