import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmHost, Toaster } from './components/ui'
import './store/theme'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ConfirmHost />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>,
)
