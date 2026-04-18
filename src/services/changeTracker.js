/**
 * Change Tracking Service
 * Monitors NOME (name) and TIPOLOGIA (category) changes in the product catalog
 * Using manual sync checkpoints with localStorage-based snapshots
 */

const STORAGE_KEY = 'elabel_catalog_baseline'
const CHANGES_LOG_KEY = 'elabel_changes_log'

/**
 * Capture current product catalog state as a baseline snapshot
 * Called manually when user clicks "Sincronizza catalogo"
 * @param {Array} products - Current products from Airtable
 * @returns {Object} Baseline snapshot with timestamp and product map
 */
export const captureSnapshot = (products) => {
  if (!products || !Array.isArray(products)) {
    console.warn('Invalid products array for snapshot')
    return null
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    productMap: {}
  }

  products.forEach(product => {
    const key = product.id || product.code
    if (key) {
      snapshot.productMap[key] = {
        id: product.id,
        code: product.code,
        name: product.name || '',
        tipologia: product.category || ''
      }
    }
  })

  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  return snapshot
}

/**
 * Detect changes between live catalog and baseline snapshot
 * Compares NOME and TIPOLOGIA fields only
 * @param {Array} liveProducts - Current products from Airtable
 * @returns {Object} {changes: [], hasChanges: boolean, baselineTimestamp: ISO string}
 */
export const detectChanges = (liveProducts) => {
  const storedBaseline = localStorage.getItem(STORAGE_KEY)

  if (!storedBaseline) {
    return {
      changes: [],
      hasChanges: false,
      baselineTimestamp: null,
      message: 'No baseline snapshot found. Click "Sincronizza catalogo" to create one.'
    }
  }

  let baseline
  try {
    baseline = JSON.parse(storedBaseline)
  } catch (err) {
    console.error('Failed to parse baseline snapshot:', err)
    return {
      changes: [],
      hasChanges: false,
      baselineTimestamp: null,
      message: 'Corrupted baseline. Create a new snapshot.'
    }
  }

  const changes = []
  const liveMap = {}

  // Build live product map
  if (liveProducts && Array.isArray(liveProducts)) {
    liveProducts.forEach(product => {
      const key = product.id || product.code
      if (key) {
        liveMap[key] = {
          id: product.id,
          code: product.code,
          name: product.name || '',
          tipologia: product.category || ''
        }
      }
    })
  }

  // Detect name and tipologia changes
  Object.entries(baseline.productMap).forEach(([key, baselineProduct]) => {
    const liveProduct = liveMap[key]

    if (!liveProduct) {
      // Product was removed - skip (not tracking removals)
      return
    }

    const nameChanged = baselineProduct.name !== liveProduct.name
    const tipologiaChanged = baselineProduct.tipologia !== liveProduct.tipologia

    if (nameChanged || tipologiaChanged) {
      changes.push({
        productId: key,
        code: liveProduct.code,
        name: {
          baseline: baselineProduct.name,
          current: liveProduct.name,
          changed: nameChanged
        },
        tipologia: {
          baseline: baselineProduct.tipologia,
          current: liveProduct.tipologia,
          changed: tipologiaChanged
        },
        detectedAt: new Date().toISOString(),
        status: 'detected' // Can be: detected, approved, rejected
      })
    }
  })

  // Check for new products (not in baseline)
  Object.entries(liveMap).forEach(([key, liveProduct]) => {
    if (!baseline.productMap[key]) {
      // New product - not tracking as "change" since no baseline
      return
    }
  })

  return {
    changes: changes.sort((a, b) => a.code.localeCompare(b.code)),
    hasChanges: changes.length > 0,
    baselineTimestamp: baseline.timestamp,
    message: changes.length === 0 ? 'No changes detected.' : `${changes.length} change(s) detected.`
  }
}

/**
 * Sync catalog: Capture new baseline snapshot
 * Clears change log and saves current state
 * @param {Array} products - Current products from Airtable
 * @returns {Object} New baseline snapshot
 */
export const syncCatalog = (products) => {
  // Clear change log
  localStorage.removeItem(CHANGES_LOG_KEY)

  // Capture new baseline
  const snapshot = captureSnapshot(products)

  if (snapshot) {
    console.log('Catalog synced. New baseline:', snapshot.timestamp)
  }

  return snapshot
}

/**
 * Approve a specific change (mark it as acknowledged)
 * @param {string} productId - Product ID with change
 */
export const approveChange = (productId) => {
  const storedLog = localStorage.getItem(CHANGES_LOG_KEY) || '[]'
  let log = []

  try {
    log = JSON.parse(storedLog)
  } catch (err) {
    log = []
  }

  const existingEntry = log.find(entry => entry.productId === productId)
  if (existingEntry) {
    existingEntry.status = 'approved'
    existingEntry.approvedAt = new Date().toISOString()
  } else {
    log.push({
      productId,
      status: 'approved',
      approvedAt: new Date().toISOString()
    })
  }

  localStorage.setItem(CHANGES_LOG_KEY, JSON.stringify(log))
}

/**
 * Reject a specific change (revert baseline for that product)
 * @param {string} productId - Product ID with change
 */
export const rejectChange = (productId) => {
  const storedLog = localStorage.getItem(CHANGES_LOG_KEY) || '[]'
  let log = []

  try {
    log = JSON.parse(storedLog)
  } catch (err) {
    log = []
  }

  const existingEntry = log.find(entry => entry.productId === productId)
  if (existingEntry) {
    existingEntry.status = 'rejected'
    existingEntry.rejectedAt = new Date().toISOString()
  } else {
    log.push({
      productId,
      status: 'rejected',
      rejectedAt: new Date().toISOString()
    })
  }

  localStorage.setItem(CHANGES_LOG_KEY, JSON.stringify(log))
}

/**
 * Get change history/log
 * @returns {Array} Array of all recorded approvals/rejections
 */
export const getChangeLog = () => {
  const storedLog = localStorage.getItem(CHANGES_LOG_KEY) || '[]'
  try {
    return JSON.parse(storedLog)
  } catch (err) {
    return []
  }
}

/**
 * Clear all stored baseline and change data
 * Use with caution - this resets the entire tracking system
 */
export const clearTracking = () => {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(CHANGES_LOG_KEY)
  console.log('Change tracking data cleared')
}

/**
 * Get current baseline info without needing full product list
 * @returns {Object} Baseline metadata
 */
export const getBaselineInfo = () => {
  const storedBaseline = localStorage.getItem(STORAGE_KEY)

  if (!storedBaseline) {
    return {
      exists: false,
      timestamp: null,
      productCount: 0
    }
  }

  try {
    const baseline = JSON.parse(storedBaseline)
    return {
      exists: true,
      timestamp: baseline.timestamp,
      productCount: Object.keys(baseline.productMap).length
    }
  } catch (err) {
    return {
      exists: false,
      timestamp: null,
      productCount: 0
    }
  }
}
