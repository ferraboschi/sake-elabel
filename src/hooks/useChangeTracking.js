/**
 * Hook for managing change tracking in React components
 * Provides change detection, sync, and approval workflow
 */

import { useState, useCallback, useEffect } from 'react'
import {
  captureSnapshot,
  detectChanges,
  syncCatalog,
  approveChange,
  rejectChange,
  getChangeLog,
  getBaselineInfo,
  clearTracking
} from '../services/changeTracker'

export const useChangeTracking = (products = []) => {
  const [changes, setChanges] = useState([])
  const [hasChanges, setHasChanges] = useState(false)
  const [baselineTimestamp, setBaselineTimestamp] = useState(null)
  const [baselineInfo, setBaselineInfo] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Update baseline info on mount and when changes
  useEffect(() => {
    const info = getBaselineInfo()
    setBaselineInfo(info)
  }, [hasChanges])

  /**
   * Manually trigger catalog sync
   * Captures current state as new baseline and clears change log
   */
  const handleSync = useCallback(() => {
    setIsLoading(true)
    try {
      const snapshot = syncCatalog(products)
      setChanges([])
      setHasChanges(false)
      setBaselineTimestamp(snapshot?.timestamp || null)
      setMessage('Catalogo sincronizzato con successo')
      setBaselineInfo(getBaselineInfo())
      return true
    } catch (err) {
      console.error('Sync failed:', err)
      setMessage('Errore durante la sincronizzazione')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [products])

  /**
   * Detect changes between live catalog and baseline
   */
  const handleDetectChanges = useCallback(() => {
    setIsLoading(true)
    try {
      const result = detectChanges(products)
      setChanges(result.changes)
      setHasChanges(result.hasChanges)
      setBaselineTimestamp(result.baselineTimestamp)
      setMessage(result.message)
      return result
    } catch (err) {
      console.error('Detection failed:', err)
      setMessage('Errore nel rilevamento delle modifiche')
      return { changes: [], hasChanges: false }
    } finally {
      setIsLoading(false)
    }
  }, [products])

  /**
   * Approve a detected change
   */
  const handleApproveChange = useCallback((productId) => {
    try {
      approveChange(productId)
      setChanges(prev =>
        prev.map(change =>
          change.productId === productId
            ? { ...change, status: 'approved' }
            : change
        )
      )
      return true
    } catch (err) {
      console.error('Approve failed:', err)
      return false
    }
  }, [])

  /**
   * Reject a detected change
   */
  const handleRejectChange = useCallback((productId) => {
    try {
      rejectChange(productId)
      setChanges(prev =>
        prev.map(change =>
          change.productId === productId
            ? { ...change, status: 'rejected' }
            : change
        )
      )
      return true
    } catch (err) {
      console.error('Reject failed:', err)
      return false
    }
  }, [])

  /**
   * Clear all tracking data
   */
  const handleClearTracking = useCallback(() => {
    clearTracking()
    setChanges([])
    setHasChanges(false)
    setBaselineTimestamp(null)
    setBaselineInfo({})
    setMessage('Dati di tracciamento cancellati')
  }, [])

  /**
   * Manually capture baseline without clearing changes log
   */
  const handleCaptureBaseline = useCallback(() => {
    setIsLoading(true)
    try {
      const snapshot = captureSnapshot(products)
      setBaselineTimestamp(snapshot?.timestamp || null)
      setMessage('Baseline catturato con successo')
      setBaselineInfo(getBaselineInfo())
      return true
    } catch (err) {
      console.error('Capture failed:', err)
      setMessage('Errore nel salvataggio del baseline')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [products])

  return {
    // State
    changes,
    hasChanges,
    baselineTimestamp,
    baselineInfo,
    isLoading,
    message,

    // Actions
    detectChanges: handleDetectChanges,
    syncCatalog: handleSync,
    approveChange: handleApproveChange,
    rejectChange: handleRejectChange,
    captureBaseline: handleCaptureBaseline,
    clearTracking: handleClearTracking,
    getChangeLog
  }
}
