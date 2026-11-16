import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmHost, Toaster } from './components/ui'
import './store/theme'
import './index.css'

// Error tracking only when a DSN is configured; the SDK is lazy-loaded so it costs nothing otherwise.
const dsn = import.meta.env.VITE_SENTRY_DSN
if (dsn) {
  void import('@sentry/react').then((Sentry) =>
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies
          delete event.request.headers
          delete event.request.data
          delete event.request.query_string
        }
        delete event.user
        return event
      },
    }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ConfirmHost />
      <Toaster />
    </ErrorBoundary>
  </StrictMode>,
)
