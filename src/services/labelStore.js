/**
 * Label Store Service
 * Manages generated labels with localStorage (MVP) + Airtable (future)
 *
 * Each label record:
 * {
 *   id: string (unique),
 *   productSlug: string,
 *   productCode: string,
 *   productName: string,
 *   winery: string,
 *   language: string,
 *   country: string,
 *   importerName: string,
 *   qrDataUrl: string (base64 PNG),
 *   labelUrl: string,
 *   generatedAt: ISO string,
 *   generatedBy: string (username),
 *   volumeMl: number,
 *   alcoholPct: number,
 * }
 */

const STORAGE_KEY = 'elabel_generated_labels'

/**
 * Get all stored labels (auto-deduplicates on load)
 * If duplicates exist (same code+lang+country), keeps only the most recent.
 */
export const getLabels = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const labels = JSON.parse(raw)

    // Deduplicate: keep only the most recent label per key
    const seen = new Map()
    for (const label of labels) {
      const key = getLabelKey(label)
      const existing = seen.get(key)
      if (!existing || new Date(label.generatedAt) > new Date(existing.generatedAt)) {
        seen.set(key, label)
      }
    }

    const deduped = [...seen.values()]

    // If we removed duplicates, persist the cleaned list
    if (deduped.length < labels.length) {
      console.log(`[LabelStore] Cleaned ${labels.length - deduped.length} duplicate(s)`)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped))
    }

    return deduped
  } catch {
    return []
  }
}

/**
 * Create a unique key for deduplication (product + language + country)
 * Uses productCode as primary identifier (stable), with slug as fallback.
 */
const getLabelKey = (label) => {
  // productCode is the stable Airtable identifier (e.g. S093-1800)
  const id = label.productCode || label.productSlug || label.slug || ''
  const lang = label.language || ''
  const country = label.country || ''
  return `${id}__${lang}__${country}`
}

/**
 * Save a batch of generated labels.
 * Replaces any existing label with same product+language+country (deduplication).
 */
export const saveLabels = (labels) => {
  const existing = getLabels()
  const newLabels = labels.map(label => ({
    id: `lbl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    productSlug: label.slug,
    productCode: label.code || '',
    productName: label.name,
    nameJp: label.nameJp || '',
    winery: label.winery || '',
    wineryJp: label.wineryJp || '',
    category: label.category || '',
    language: label.language,
    country: label.country,
    importerName: label.importer?.name || '',
    importerAddress: label.importer?.address || '',
    qrDataUrl: label.qr,
    labelUrl: `https://label.sakecompany.com/${label.slug}?lang=${label.language}&country=${label.country}`,
    generatedAt: label.generatedAt || new Date().toISOString(),
    generatedBy: label.generatedBy || 'unknown',
    volumeMl: label.volumeMl,
    alcoholPct: label.alcoholPct,
    nutrition: label.nutrition || null,
    ingredients: label.ingredients || null,
    bottleMaterialCode: label.bottleMaterialCode || '',
    capMaterialCode: label.capMaterialCode || '',
    seimaibuai: label.seimaibuai || null,
    barcode: label.barcode || '',
  }))

  // Build set of new label keys for deduplication
  const newKeys = new Set(newLabels.map(l => getLabelKey(l)))

  // Remove existing labels that match new ones (replace them)
  const filtered = existing.filter(l => !newKeys.has(getLabelKey(l)))

  const all = [...newLabels, ...filtered]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  return newLabels
}

/**
 * Search labels
 */
export const searchLabels = (query = '', filters = {}) => {
  let labels = getLabels()

  if (query) {
    const q = query.toLowerCase()
    labels = labels.filter(l =>
      (l.productName || '').toLowerCase().includes(q) ||
      (l.productCode || '').toLowerCase().includes(q) ||
      (l.winery || '').toLowerCase().includes(q) ||
      (l.nameJp || '').includes(q)
    )
  }

  if (filters.language) {
    labels = labels.filter(l => l.language === filters.language)
  }
  if (filters.country) {
    labels = labels.filter(l => l.country === filters.country)
  }

  return labels
}

/**
 * Delete a label by id
 */
export const deleteLabel = (id) => {
  const labels = getLabels().filter(l => l.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(labels))
  return labels
}

/**
 * Get stats
 */
export const getLabelStats = () => {
  const labels = getLabels()
  const byLanguage = {}
  const byCountry = {}
  labels.forEach(l => {
    byLanguage[l.language] = (byLanguage[l.language] || 0) + 1
    byCountry[l.country] = (byCountry[l.country] || 0) + 1
  })
  return { total: labels.length, byLanguage, byCountry }
}

/**
 * Regenerate (replace) a label in the store
 */
export const regenerateLabel = (id, newData) => {
  const labels = getLabels()
  const updated = labels.map(l => {
    if (l.id !== id) return l
    return {
      ...l,
      ...newData,
      generatedAt: new Date().toISOString(),
    }
  })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  return updated
}

export default { getLabels, saveLabels, searchLabels, deleteLabel, getLabelStats, regenerateLabel }
