/**
 * Print Snapshot Service
 *
 * Tracks label-relevant field changes to detect when reprints are needed.
 *
 * Snapshots live in the Airtable field `ELabel_Snapshot` (long text, one JSON
 * object per record): { hash, printedAt, language, productName }.
 * If the field doesn't exist yet in Airtable the feature degrades gracefully
 * (no banner, saves are skipped with a console warning).
 *
 * The repo file snapshots/label-snapshots.json is the read-only legacy archive
 * from the old GitHub-based storage; it seeds products that were printed
 * before the migration and is never written again.
 *
 * Flow:
 * 1. When a label PDF is generated/downloaded, saveSnapshot() is called
 * 2. It creates a hash of all label-relevant fields and stores it with timestamp
 * 3. When viewing a product, checkReprint() compares current data to snapshot
 * 4. If data changed → show "reprint needed" banner
 */

import { fetchLabelSnapshots, updateLabelSnapshot } from './airtable'
import legacySnapshots from '../../snapshots/label-snapshots.json'

// Fields that appear on printed labels (changes to these require reprint)
// NOTE: 'category' is excluded because it's auto-detected by detectDetailedCategory()
// during generation and may differ from the raw Airtable value, causing false positives.
const LABEL_FIELDS = [
  'name', 'alcoholPct', 'volumeMl', 'barcode', 'barcodeBox',
  'countryOfOrigin', 'operatorName', 'operatorAddress',
  'seimaibuai', 'code',
]
const LABEL_NESTED_FIELDS = ['ingredients', 'allergens']

/**
 * Create a deterministic hash string from label-relevant product data
 * Normalizes values to avoid false positives when opening/saving without changes
 */
function computeLabelHash(product) {
  const parts = []

  // Normalize function: handles numbers, strings, and null/undefined consistently
  const normalize = (val) => {
    if (val === null || val === undefined) return ''
    if (typeof val === 'number') {
      // For decimals: fixed precision, for integers: parseInt
      const str = val.toString()
      if (str.includes('.')) {
        return parseFloat(val).toFixed(4)
      } else {
        return parseInt(val).toString()
      }
    }
    if (typeof val === 'string') return val.trim()
    return String(val)
  }

  // Flat fields
  for (const key of LABEL_FIELDS) {
    const val = product[key]
    parts.push(`${key}:${normalize(val)}`)
  }

  // Nested multi-language fields (ingredients, allergens)
  for (const key of LABEL_NESTED_FIELDS) {
    const obj = product[key] || {}
    const sorted = Object.keys(obj).sort().map(k => `${k}=${normalize(obj[k])}`).join('|')
    parts.push(`${key}:{${sorted}}`)
  }

  // Nutrition - normalize each value with fixed precision
  const n = product.nutrition || {}
  const nutritionStr = Object.keys(n).sort().map(k => {
    const val = n[k]
    if (val === null || val === undefined) return `${k}=`
    if (typeof val === 'number') {
      const str = val.toString()
      if (str.includes('.')) {
        return `${k}=${parseFloat(val).toFixed(4)}`
      } else {
        return `${k}=${parseInt(val)}`
      }
    }
    return `${k}=${String(val).trim()}`
  }).join('|')
  parts.push(`nutrition:{${nutritionStr}}`)

  // Simple string hash (djb2)
  const str = parts.join('\n')
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

// In-memory cache to avoid repeated Airtable calls
let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60000 // 1 minute

/**
 * Load all snapshots, keyed by product code AND record id.
 * Airtable is the source of truth; the committed legacy JSON fills in
 * products printed before the migration (keyed by code only).
 */
async function getSnapshots() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache
  }
  const data = { ...legacySnapshots }
  const live = await fetchLabelSnapshots() // null when field missing / fetch failed
  if (live) {
    for (const [key, snap] of Object.entries(live)) {
      data[key] = snap // live snapshots win over legacy
    }
  }
  _cache = data
  _cacheTime = Date.now()
  return data
}

function snapshotKeys(product) {
  return [product.code, product._recordId].filter(Boolean)
}

function findSnapshot(data, product) {
  for (const key of snapshotKeys(product)) {
    if (data[key]) return data[key]
  }
  return null
}

/**
 * Save a snapshot when a label is printed/generated
 * @param {Object} product - The full product data object
 * @param {string} language - Language used for the print
 */
export async function saveSnapshot(product, language = 'it') {
  if (!product._recordId) return false

  const snapshot = {
    hash: computeLabelHash(product),
    printedAt: new Date().toISOString(),
    language,
    productName: product.name || '',
  }

  const success = await updateLabelSnapshot(product._recordId, snapshot)
  if (success && _cache) {
    for (const key of snapshotKeys(product)) {
      _cache[key] = snapshot
    }
  }
  return success
}

/**
 * Check if a product needs reprinting
 * @param {Object} product - Current product data
 * @returns {{ needsReprint: boolean, printedAt: string|null, changedFields: string[] }}
 */
export async function checkReprint(product) {
  const data = await getSnapshots()
  const snapshot = findSnapshot(data, product)

  if (!snapshot) {
    // Never printed — no reprint needed (first print)
    return { needsReprint: false, printedAt: null, changedFields: [] }
  }

  const currentHash = computeLabelHash(product)
  if (currentHash === snapshot.hash) {
    return { needsReprint: false, printedAt: snapshot.printedAt, changedFields: [] }
  }

  // We can't compare field-by-field without storing the original values,
  // but the hash mismatch is enough to flag reprint needed
  return {
    needsReprint: true,
    printedAt: snapshot.printedAt,
    changedFields: ['Dati etichetta modificati dopo la stampa'],
  }
}

/**
 * Batch check multiple products
 * @param {Object[]} products - Array of product data objects
 * @returns {Object} - Map of product code → reprint status
 */
export async function batchCheckReprint(products) {
  const data = await getSnapshots()
  const results = {}

  for (const product of products) {
    const key = product.code || product._recordId
    if (!key) continue

    const snapshot = findSnapshot(data, product)
    if (!snapshot) {
      results[key] = { needsReprint: false, printedAt: null }
      continue
    }

    const currentHash = computeLabelHash(product)
    results[key] = {
      needsReprint: currentHash !== snapshot.hash,
      printedAt: snapshot.printedAt,
    }
  }

  return results
}

/**
 * Clear snapshot for a product (after reprint)
 * @param {Object|string} product - Product object (legacy callers may pass the code,
 *   which only clears the in-memory cache — Airtable needs the record id)
 */
export async function clearSnapshot(product) {
  if (typeof product === 'string') {
    if (_cache) delete _cache[product]
    return
  }
  if (product._recordId) {
    await updateLabelSnapshot(product._recordId, null)
  }
  if (_cache) {
    for (const key of snapshotKeys(product)) {
      delete _cache[key]
    }
  }
}

export default {
  saveSnapshot,
  checkReprint,
  batchCheckReprint,
  clearSnapshot,
  computeLabelHash,
}
