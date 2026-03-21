import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Dashboard from './components/Dashboard'
import ELabel from './components/ELabel'

// Lazy load heavy admin components (jsPDF, QRCode, etc.)
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const LabelArchive = lazy(() => import('./components/LabelArchive'))
const ContainerLabels = lazy(() => import('./components/ContainerLabels'))
const Login = lazy(() => import('./components/Login'))
const SupplierPortal = lazy(() => import('./components/SupplierPortal'))

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
        {/* Public routes */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/nutrition" element={<SupplierPortal />} />
        <Route path="/supplier" element={<SupplierPortal />} />
        <Route path="/s" element={<SupplierPortal />} />
        <Route path="/label/:productSlug" element={<ELabel />} />
        <Route path="/product/:productSlug" element={<ELabel />} />

        {/* Protected routes - admin + partner */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'partner']}>
            <AdminPanel />
          </ProtectedRoute>
        } />
        <Route path="/archive" element={
          <ProtectedRoute allowedRoles={['admin', 'partner']}>
            <LabelArchive />
          </ProtectedRoute>
        } />
        <Route path="/containers" element={
          <ProtectedRoute allowedRoles={['admin', 'partner']}>
            <ContainerLabels />
          </ProtectedRoute>
        } />

        {/* Legacy: old e-label URL senza /label/ prefix */}
        <Route path="/:productSlug" element={<ELabel />} />
      </Routes>
    </Suspense>
  )
}

export default App
