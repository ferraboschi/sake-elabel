import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { getLabels } from './services/labelStore'
import './i18n'
import App from './App'
import './App.css'

// App version — logged on startup to verify CDN serves latest code
window.__ELABEL_VERSION = '2026.04.03.1'

// Force dedup cleanup on every app load (getLabels auto-deduplicates)
try { getLabels() } catch { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
