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
 * Uses aggressive two-key dedup: checks both productCode and productSlug
 * so old labels (without code) and new labels (with code) are correctly merged.
 */
export const getLabels = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const labels = JSON.parse(raw)

    // Sort newest first so we always keep the most recent
    labels.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))

    // Dedup: a label is duplicate if ANY of its keys (code-based or slug-based) was already seen
    const seenKeys = new Set()
    const deduped = []
    for (const label of labels) {
      const keys = getLabelKeys(label)
      const isDuplicate = keys.some(k => seenKeys.has(k))
      if (!isDuplicate) {
        deduped.push(label)
        keys.forEach(k => seenKeys.add(k))
      }
    }

    // Persist cleaned list if duplicates were removed
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
 * Generate ALL possible dedup keys for a label.
 * Returns code-based, slug-based, AND name+volume-based keys so that
 * any matching dimension is enough to recognize duplicates.
 */
const getLabelKeys = (label) => {
  const lang = label.language || ''
  const country = label.country || ''
  const keys = []
  if (label.productCode)  keys.push(`code:${label.productCode}__${lang}__${country}`)
  if (label.productSlug)  keys.push(`slug:${label.productSlug}__${lang}__${country}`)
  if (label.slug)         keys.push(`slug:${label.slug}__${lang}__${country}`)
  // Name+volume key: catches duplicates where code/slug differ but it's the same product
  if (label.productName && label.volumeMl) {
    keys.push(`nv:${label.productName.trim().toLowerCase()}__${label.volumeMl}__${lang}__${country}`)
  }
  // Fallback: at least one key must exist
  if (keys.length === 0) keys.push(`id:${label.id}__${lang}__${country}`)
  return keys
}

/** Single primary key for saveLabels dedup (backward compat) */
const getLabelKey = (label) => {
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

  // Build set of ALL keys from new labels for aggressive dedup
  const newKeys = new Set()
  newLabels.forEach(l => getLabelKeys(l).forEach(k => newKeys.add(k)))

  // Remove existing labels that match any key of the new ones (replace them)
  const filtered = existing.filter(l => {
    const existingKeys = getLabelKeys(l)
    return !existingKeys.some(k => newKeys.has(k))
  })

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
