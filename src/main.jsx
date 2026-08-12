import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { getLabels } from './services/labelStore'
import './i18n'
import App from './App'
import './App.css'

// App version — auto-injected at build time (vite.config.js define).
// Guarantees a fresh index bundle hash on every deploy (CDN cache bust).
window.__ELABEL_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : 'dev'

// Force dedup cleanup on every app load (getLabels auto-deduplicates)
try { getLabels() } catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
