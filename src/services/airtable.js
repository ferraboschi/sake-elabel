/**
 * Airtable API Service
 * Reads products from Master Product List and manages e-label data
 *
 * NOTE: Airtable REST API returns fields by NAME in the response,
 * but accepts field IDs in the `fields[]` query parameter.
 * We use field IDs for filtering/updates, field names for reading.
 *
 * IMPORTANT: For MVP, we use a personal access token.
 * In production, this should go through a serverless function to protect the token.
 */

const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'appwCWGRd0jXOCxMA'
const AIRTABLE_API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || ''
const AIRTABLE_PROXY_URL = import.meta.env.VITE_AIRTABLE_PROXY_URL || ''
const USE_PROXY = !!AIRTABLE_PROXY_URL
const PRODUCT_TABLE_ID = 'tblilRsJLHIVJ1xju'

/**
 * Field definitions: { internalKey: { id, name } }
 * - id: used for field filtering in API requests and for PATCH updates
 * - name: used to read values from API responses
 */
const FIELDS = {
  // === Existing product fields ===
  code:           { id: 'fldSjulSgX82540Si', name: 'CODE' },
  productName:    { id: 'fldSfN0GrzcUY832j', name: 'Product Name' },
  sakagura:       { id: 'fld9282IApGNnZETw', name: 'Sakagura' },
  sakaguraJp:     { id: 'fldVHMGJOP1StM8br', name: 'Sakagura in Japanese' },
  productNameJp:  { id: 'fldq1pvfukVwNuDIR', name: 'Product in Japanese' },
  productType:    { id: 'fld4POKwJbvDOtRx8', name: 'Product Type' },
  size:           { id: 'fldaI1TFqZV11YDG0', name: 'Size' },
  alcoholPct:     { id: 'fldDiAiLpFA3hDB47', name: 'Alcohol %' },
  barcode:        { id: 'fldrfLFNtDm2X3jr7', name: 'Barcode' },
  ean:            { id: 'fld876oau4wUHNttm', name: 'codice EAN' },
  eanBox:         { id: 'fldisS1FwBanCDzyB', name: 'EAN_Box' },
  status:         { id: 'fldRZZ7iE8itpkWwE', name: 'Status' },
  bottlesPerBox:  { id: 'fldJ3LcJlF2NsSS1J', name: 'Bottles per box' },

  // === Nutrition fields (per 100ml) ===
  energyKj:       { id: 'fldTwHLgNMlMRx9jf', name: 'Energy_kJ' },
  energyKcal:     { id: 'fld5mj54cHFoMNotF', name: 'Energy_kcal' },
  fatG:           { id: 'fld0h5n2AwuWvHRSO', name: 'Fat_g' },
  saturatedFatG:  { id: 'fldqPuKBOJP1ga8si', name: 'Saturates_g' },
  carbsG:         { id: 'fld8bxHStwk4RZHTG', name: 'Carbohydrates_g' },
  sugarsG:        { id: 'fldkQYN0sGtLhr8PQ', name: 'Sugars_g' },
  proteinG:       { id: 'fldwpv3taEr68SrOU', name: 'Protein_g' },
  saltG:          { id: 'fld4BaxVMUPcdlbNk', name: 'Salt_g' },

  // === Ingredients (multi-language) ===
  ingredientsIt:  { id: 'fldkmaBw6GIDE1G7h', name: 'Ingredients_IT' },
  ingredientsEn:  { id: 'fldBeHyGE5t447QCS', name: 'Ingredients_EN' },
  ingredientsFr:  { id: 'fldc49TbuveAMAoHG', name: 'Ingredients_FR' },
  ingredientsDe:  { id: 'fldRZfKheHcj6LTW5', name: 'Ingredients_DE' },
  ingredientsEs:  { id: 'fldpzFDHjYPRvFmUu', name: 'Ingredients_ES' },

  // === Allergens (multi-language) ===
  allergensIt:    { id: 'fldmXUbLiyLWW4B92', name: 'Allergens_IT' },
  allergensEn:    { id: 'fld2PLKYkds9thzDl', name: 'Allergens_EN' },
  allergensFr:    { id: 'fldJMoJ75SOyggjZR', name: 'Allergens_FR' },
  allergensDe:    { id: 'fldEOMFWxbQSf2CkK', name: 'Allergens_DE' },
  allergensEs:    { id: 'fldInUdH7hm7dgYlW', name: 'Allergens_ES' },

  // === Sales regions (export authorization) ===
  salesRegion:        { id: 'fldRmnpjK6KQSVwTZ', name: 'SC sales region' },

  // === Sake-specific fields ===
  seimaibuai:         { id: 'fldCcsaPU02WicBz6', name: 'Seimaibuai' },

  // === Packaging & Operator ===
  packagingMaterials: { id: 'fldz7XcoWe5x3yfYw', name: 'Packaging_Materials' },
  operatorName:       { id: 'fldE2830YVz8gJebH', name: 'Operator_Name' },
  operatorAddress:    { id: 'fldDUVlq6pTbqSyQd', name: 'Operator_Address' },
  countryOfOrigin:    { id: 'fldJ2RyG8K0Xm6d3F', name: 'Country_of_Origin' },

  // === Legal description (custom denomination for label) ===
  legalDescription:   { id: 'fldwiR0TCKQJWH3x1', name: 'Legal_Description' },

  // === E-Label status ===
  elabelStatus:       { id: 'fld8JHbfh7z3awZ2x', name: 'ELabel_Status' },
  elabelUrl:          { id: 'fldbumiHE3Ii2mfiL', name: 'ELabel_URL' },
  elabelQrGenerated:  { id: 'fldethB3N479ekbAf', name: 'ELabel_QR_Generated' },
  elabelLastUpdated:  { id: 'fld5NGZ7Y4TbmxsrQ', name: 'ELabel_Last_Updated' },
}

// When VITE_AIRTABLE_PROXY_URL is set (production), go through the Cloudflare Worker
// which adds the Authorization header server-side. Otherwise (local dev), call
// Airtable directly using the client-side API key.
const API_BASE = USE_PROXY
  ? `${AIRTABLE_PROXY_URL.replace(/\/$/, '')}/api/airtable/v0`
  : 'https://api.airtable.com/v0'

const headers = () => {
  const h = { 'Content-Type': 'application/json' }
  // Only send Authorization when calling Airtable directly (dev).
  // The Worker injects its own token server-side.
  if (!USE_PROXY) {
    h['Authorization'] = `Bearer ${AIRTABLE_API_KEY}`
  }
  return h
}

/**
 * Fetch with automatic retry on Airtable rate-limit (429).
 * Airtable allows 5 requests/sec per base; concurrent users may hit this.
 */
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options)
    if (res.status === 429 && i < retries) {
      const wait = Math.pow(2, i) * 1000 + Math.random() * 500
      console.warn(`[Airtable] Rate limited (429), retrying in ${Math.round(wait)}ms...`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    return res
  }
}

/**
 * Check if Airtable API is configured
 */
export const isAirtableConfigured = () => {
  // In production we use the proxy (no API key on client).
  // In dev we use the direct API key.
  if (USE_PROXY) return true
  return !!AIRTABLE_API_KEY && AIRTABLE_API_KEY.length > 10
}

/**
 * Fetch all products from Master Product List
 * Returns normalized product objects
 */
export const fetchProducts = async () => {
  if (!isAirtableConfigured()) {
    console.warn('Airtable API key not configured. Using local data.')
    return null
  }

  const allRecords = []
  let offset = null

  // Build field filter using field IDs
  const fieldIds = Object.values(FIELDS).map(f => f.id)
  const fieldParams = fieldIds.map(id => `fields%5B%5D=${id}`).join('&')

  do {
    const url = `${API_BASE}/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}?${fieldParams}${offset ? `&offset=${offset}` : ''}`

    const response = await fetchWithRetry(url, { headers: headers() })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(`Airtable error: ${err.error?.message || response.statusText}`)
    }

    const data = await response.json()
    allRecords.push(...data.records)
    offset = data.offset
  } while (offset)

  console.log(`[Airtable] Fetched ${allRecords.length} products`)
  return allRecords.map(normalizeRecord)
}

/**
 * Fetch a single product by record ID
 */
export const fetchProduct = async (recordId) => {
  if (!isAirtableConfigured()) return null

  const url = `${API_BASE}/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}/${recordId}`
  const response = await fetchWithRetry(url, { headers: headers() })

  if (!response.ok) throw new Error('Failed to fetch product')

  const data = await response.json()
  return normalizeRecord(data)
}

/**
 * Update a product record with e-label data
 * Accepts an object with keys matching FIELDS keys
 */
export const updateProduct = async (recordId, fields) => {
  if (!isAirtableConfigured()) {
    console.warn('Airtable not configured. Changes not saved.')
    return false
  }

  // Map internal keys to Airtable field names (PATCH uses field names)
  const airtableFields = {}
  for (const [key, value] of Object.entries(fields)) {
    const fieldDef = FIELDS[key]
    if (fieldDef && value !== undefined) {
      airtableFields[fieldDef.name] = value
    }
  }

  const url = `${API_BASE}/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}/${recordId}`
  const response = await fetchWithRetry(url, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields: airtableFields, typecast: true })
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Update failed: ${err.error?.message || response.statusText}`)
  }

  return true
}

/**
 * Batch update multiple products
 * records: array of { id, fields } objects where fields use internal keys
 */
export const batchUpdateProducts = async (records) => {
  if (!isAirtableConfigured()) return false

  // Airtable allows max 10 records per batch
  const batches = []
  for (let i = 0; i < records.length; i += 10) {
    batches.push(records.slice(i, i + 10))
  }

  for (const batch of batches) {
    const airtableRecords = batch.map(rec => {
      const airtableFields = {}
      for (const [key, value] of Object.entries(rec.fields)) {
        const fieldDef = FIELDS[key]
        if (fieldDef && value !== undefined) {
          airtableFields[fieldDef.name] = value
        }
      }
      return { id: rec.id, fields: airtableFields }
    })

    const url = `${API_BASE}/${AIRTABLE_BASE_ID}/${PRODUCT_TABLE_ID}`
    const response = await fetchWithRetry(url, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ records: airtableRecords, typecast: true })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(`Batch update failed: ${err.error?.message || response.statusText}`)
    }
  }

  return true
}

/**
 * Parse packagingMaterials string into bottleColor, bottleMaterialCode, capType, capMaterialCode
 * Expected format: "Bottiglia: Nero GL 72; Tappo: Alluminio C/ALU 90"
 * Also handles legacy format: "Vetro marrone GL 72, Tappo alluminio C/ALU 90"
 */
function parsePackagingToFields(materialsStr) {
  const result = {
    bottleColor: null,
    bottleMaterialCode: null,
    capType: null,
    capMaterialCode: null,
  }
  if (!materialsStr) return result

  // Color mapping (Italian → internal)
  const colorMap = {
    'trasparente': 'Trasparente', 'chiaro': 'Trasparente', 'clear': 'Trasparente', 'bianco': 'Trasparente',
    'verde': 'Verde', 'green': 'Verde',
    'marrone': 'Marrone', 'brown': 'Marrone', 'ambra': 'Marrone', 'amber': 'Marrone',
    'nero': 'Nera', 'nera': 'Nera', 'black': 'Nera', 'scuro': 'Nera', 'dark': 'Nera',
  }

  // New structured format: "Bottiglia: Color GLxx; Tappo: Type C/ALU xx"
  const bottleMatch = materialsStr.match(/Bottiglia:\s*([^;]+)/i)
  const capMatch = materialsStr.match(/Tappo:\s*(.+)/i)

  if (bottleMatch) {
    const bottlePart = bottleMatch[1].trim()
    const glCode = bottlePart.match(/GL\s*\d+/i)
    if (glCode) result.bottleMaterialCode = glCode[0].toUpperCase().replace(/GL(\d)/, 'GL $1')
    // Extract color (everything before GL code)
    const colorPart = glCode ? bottlePart.slice(0, bottlePart.indexOf(glCode[0])).trim() : bottlePart
    if (colorPart) {
      const lower = colorPart.toLowerCase()
      result.bottleColor = colorMap[lower] || colorPart
    }
  }

  if (capMatch) {
    const capPart = capMatch[1].trim()
    const aluCode = capPart.match(/C\/ALU\s*\d+/i)
    if (aluCode) result.capMaterialCode = aluCode[0].toUpperCase().replace(/C\/ALU(\d)/, 'C/ALU $1')
    else result.capMaterialCode = 'C/ALU 90'
    // Extract cap type (everything before code)
    const typePart = aluCode ? capPart.slice(0, capPart.indexOf(aluCode[0])).trim() : capPart
    if (typePart) result.capType = typePart
  }

  // Legacy format fallback: "Vetro [color] GL xx, Tappo [type] C/ALU xx"
  if (!bottleMatch && !capMatch) {
    const parts = materialsStr.split(',').map(s => s.trim())
    for (const part of parts) {
      const lower = part.toLowerCase()
      if (lower.includes('vetro') || lower.includes('glass') || lower.includes('gl ')) {
        const glCode = part.match(/GL\s*\d+/i)
        if (glCode) result.bottleMaterialCode = glCode[0].toUpperCase().replace(/GL(\d)/, 'GL $1')
        // Try to extract color from text
        for (const [keyword, color] of Object.entries(colorMap)) {
          if (lower.includes(keyword)) { result.bottleColor = color; break }
        }
      }
      if (lower.includes('tappo') || lower.includes('cap') || lower.includes('alu')) {
        const aluCode = part.match(/C\/ALU\s*\d+/i)
        result.capMaterialCode = aluCode ? aluCode[0].toUpperCase() : 'C/ALU 90'
        if (lower.includes('alluminio') || lower.includes('aluminum')) result.capType = 'Alluminio'
        else if (lower.includes('sughero') || lower.includes('cork')) result.capType = 'Sughero'
      }
    }
  }

  return result
}

/**
 * Compose a packagingMaterials string from individual fields
 * Format: "Bottiglia: Color GLxx; Tappo: Type C/ALU xx"
 */
export const composePackagingMaterials = (bottleColor, bottleMaterialCode, capType, capMaterialCode) => {
  const parts = []
  if (bottleMaterialCode) {
    parts.push(`Bottiglia: ${bottleColor || 'Trasparente'} ${bottleMaterialCode}`)
  }
  if (capMaterialCode) {
    parts.push(`Tappo: ${capType || 'Alluminio'} ${capMaterialCode}`)
  }
  return parts.join('; ')
}

/**
 * Normalize an Airtable record into our app's product format
 * Airtable REST API returns fields by name, not by ID
 */
function normalizeRecord(record) {
  const f = record.fields || {}

  // Get value by internal key (uses field name to read from response)
  const get = (key) => {
    const fieldDef = FIELDS[key]
    return fieldDef ? (f[fieldDef.name] ?? null) : null
  }

  // Get single select value (returns name string)
  const getSelect = (key) => {
    const val = get(key)
    if (!val) return null
    return typeof val === 'object' ? val.name : val
  }

  const code = get('code') || ''
  const name = get('productName') || ''
  // Slug MUST be unique — append product code to avoid duplicates
  // (e.g. two "Sakurabijin Daiginjo" with different sizes)
  const nameSlug = name.toLowerCase()
    .replace(/[/]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = code ? `${nameSlug}-${code.toLowerCase()}` : nameSlug

  // Alcohol is stored as decimal (0.15 = 15%)
  const rawAlcohol = get('alcoholPct')
  const alcoholPct = rawAlcohol ? (rawAlcohol <= 1 ? rawAlcohol * 100 : rawAlcohol) : null

  // EAN barcode: prefer text barcode, fallback to numeric EAN
  const barcodeText = get('barcode') || ''
  const barcodeEan = get('ean')
  const barcode = barcodeText || (barcodeEan ? String(barcodeEan) : '')

  // EAN Box barcode
  const eanBoxRaw = get('eanBox')
  const barcodeBox = eanBoxRaw ? String(eanBoxRaw) : ''

  return {
    _recordId: record.id,
    code,
    slug,
    name,
    nameJp: get('productNameJp') || '',
    winery: get('sakagura') || '',
    wineryJp: get('sakaguraJp') || '',
    category: getSelect('productType') || '',
    volumeMl: get('size') || null,
    alcoholPct: alcoholPct ? parseFloat(alcoholPct.toFixed(1)) : null,
    barcode,
    barcodeBox,
    bottlesPerBox: get('bottlesPerBox') || null,
    status: getSelect('status') || '',

    // Nutrition (per 100ml)
    nutrition: {
      energy_kj: get('energyKj'),
      energy_kcal: get('energyKcal'),
      fat: get('fatG'),
      saturated_fat: get('saturatedFatG'),
      carbs: get('carbsG'),
      sugars: get('sugarsG'),
      protein: get('proteinG'),
      salt: get('saltG'),
    },

    // Ingredients (multi-language, ja populated by autoFillIngredients)
    ingredients: {
      it: get('ingredientsIt') || '',
      en: get('ingredientsEn') || '',
      fr: get('ingredientsFr') || '',
      de: get('ingredientsDe') || '',
      es: get('ingredientsEs') || '',
      ja: '',
    },

    // Allergens (multi-language, ja populated by autoFillIngredients)
    allergens: {
      it: get('allergensIt') || '',
      en: get('allergensEn') || '',
      fr: get('allergensFr') || '',
      de: get('allergensDe') || '',
      es: get('allergensEs') || '',
      ja: '',
    },

    // Sake-specific
    seimaibuai: get('seimaibuai') || null,

    // Sales regions — array of country codes where product can be sold (e.g. ['ITA', 'ESP', 'DEU'])
    salesRegion: get('salesRegion') || [],

    // Packaging & Operator
    packagingMaterials: get('packagingMaterials') || '',
    ...parsePackagingToFields(get('packagingMaterials') || ''),
    operatorName: get('operatorName') || '',
    operatorAddress: get('operatorAddress') || '',
    countryOfOrigin: get('countryOfOrigin') || '',
    legalDescription: get('legalDescription') || '',

    // E-Label status
    elabelStatus: getSelect('elabelStatus') || '',
    elabelUrl: get('elabelUrl') || '',
    elabelQrGenerated: get('elabelQrGenerated') || false,
    elabelLastUpdated: get('elabelLastUpdated') || null,
  }
}

export default {
  isAirtableConfigured,
  fetchProducts,
  fetchProduct,
  updateProduct,
  batchUpdateProducts,
  composePackagingMaterials,
}
