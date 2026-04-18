/**
 * Product Change Tracker Service
 * Active registration of product changes (NOME, CATEGORIA, FINITURE) in localStorage
 * Called immediately after a product is saved in PortalProduct.jsx
 */

const CHANGES_STORAGE_KEY = 'elabel_product_changes'

/**
 * Record a product change when it's saved
 * Called from PortalProduct.jsx after doSave() or saveTitleEdit() completes
 * @param {string} productCode - Product code (unique identifier)
 * @param {string} productName - Current product name
 * @param {string} category - Current product category (tipologia)
 * @param {Array} finishes - Current product finishes array
 */
export const recordProductChange = (productCode, productName, category, finishes) => {
  if (!productCode) {
    console.warn('[ProductChangeTracker] No product code provided')
    return
  }

  try {
    // Get current changes from localStorage
    const stored = localStorage.getItem(CHANGES_STORAGE_KEY)
    const changes = stored ? JSON.parse(stored) : {}

    // Record/update this product's change
    changes[productCode] = {
      code: productCode,
      name: productName || '',
      category: category || '',
      finishes: Array.isArray(finishes) ? finishes : [],
      changedAt: new Date().toISOString()
    }

    // Save back to localStorage
    localStorage.setItem(CHANGES_STORAGE_KEY, JSON.stringify(changes))
  } catch (err) {
    console.error('[ProductChangeTracker] Failed to record change:', err)
    // Fail silently - don't interrupt the save flow
  }
}

/**
 * Get all recorded product changes
 * @returns {Object} Map of productCode -> change object
 */
export const getProductChanges = () => {
  try {
    const stored = localStorage.getItem(CHANGES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch (err) {
    console.error('[ProductChangeTracker] Failed to read changes:', err)
    return {}
  }
}

/**
 * Clear all recorded changes
 */
export const clearProductChanges = () => {
  try {
    localStorage.removeItem(CHANGES_STORAGE_KEY)
  } catch (err) {
    console.error('[ProductChangeTracker] Failed to clear changes:', err)
  }
}
