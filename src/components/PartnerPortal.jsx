import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * PartnerPortal now redirects to the unified admin panel.
 * Partners and admins use the same interface (AdminPanel + LabelArchive).
 * The AdminPanel already handles role-based differences.
 */
const PartnerPortal = () => {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to="/admin" replace />
}

export default PartnerPortal
