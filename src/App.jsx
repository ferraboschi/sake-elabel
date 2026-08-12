import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ELabel from './components/ELabel'

// Lazy load heavy components (Dashboard pulls in the PDF stack — keep it lazy!)
const Dashboard = lazy(() => import('./components/Dashboard'))
const AdminPage = lazy(() => import('./components/admin/AdminPage'))
const LabelArchive = lazy(() => import('./components/LabelArchive'))
const Login = lazy(() => import('./components/Login'))
const SupplierPortal = lazy(() => import('./components/SupplierPortal'))
const ImporterManager = lazy(() => import('./components/ImporterManager'))

// New portal (clean UI)
const PortalDashboard = lazy(() => import('./components/portal/PortalDashboard'))
const PortalProduct = lazy(() => import('./components/portal/PortalProduct'))
const ChangesPage = lazy(() => import('./components/portal/ChangesPage'))

const Loading = () => (
  <div style={{ padding: '60px', textAlign: 'center', color: '#888' }}>Caricamento...</div>
)

// Protected route wrapper
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth()
  if (loading) return <Loading />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* New portal (clean UI) */}
        <Route path="/portal" element={<PortalDashboard />} />
        <Route path="/portal/product/:slug" element={<PortalProduct />} />
        <Route path="/portal/changes" element={<ChangesPage />} />

        {/* Public routes */}
        <Route path="/" element={<PortalDashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/nutrition" element={<SupplierPortal />} />
        <Route path="/supplier" element={<SupplierPortal />} />
        <Route path="/s" element={<SupplierPortal />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/label/:productSlug" element={<ELabel />} />
        <Route path="/product/:productSlug" element={<ELabel />} />

        {/* Protected routes — each page has its own URL */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'partner']}>
            <AdminPage />
          </ProtectedRoute>
        } />
        <Route path="/archive" element={<LabelArchive />} />
        <Route path="/importers" element={<ImporterManager />} />

        {/* Legacy: old e-label URL senza /label/ prefix */}
        <Route path="/:productSlug" element={<ELabel />} />
      </Routes>
    </Suspense>
  )
}

export default App
