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
  status:         { id: 'fldRZZ7iE8itpkWwE', name: 'Status' },
  bottlesPerBox:  { id: 'fldJ3LcJlF2NsSS1J', name: 'Bottles per box' },

  // === Nutrition fields (per 100ml) ===
  energyKj:       { id: 'fldTwHLgNMlMRx9jf', name: 'Energy_kJ' },
  energyKcal:     { id: 'fld5mj54cHFoMNotF', name: 'Energy_kcal' },
  fatG:           { id: 'fld0h5n2AwuWvHRSO', name: 'Fat_g' },
  saturatesG:     { id: 'fldqPuKBOJP1ga8si', name: 'Saturates_g' },
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

  // === Sake-specific fields ===
  seimaibuai:         { id: 'fldCcsaPU02WicBz6', name: 'Seimaibuai' },

  // === Packaging & Operator ===
  packagingMaterials: { id: 'fldz7XcoWe5x3yfYw', name: 'Packaging_Materials' },
  operatorName:       { id: 'fldE2830YVz8gJebH', name: 'Operator_Name' },
  operatorAddress:    { id: 'fldDUVlq6pTbqSyQd', name: 'Operator_Address' },
  countryOfOrigin:    { id: 'fldJ2RyG8K0Xm6d3F', name: 'Country_of_Origin' },

  // === E-Label status ===
  elabelStatus:       { id: 'fld8JHbfh7z3awZ2x', name: 'ELabel_Status' },
  elabelUrl:          { id: 'fldbumiHE3Ii2mfiL', name: 'ELabel_URL' },
  elabelQrGenerated:  { id: 'fldethB3N479ekbAf', name: 'ELabel_QR_Generated' },
  elabelLastUpdated:  { id: 'fld5NGZ7Y4TbmxsrQ', name: 'ELabel_Last_Updated' },
}

const API_BASE = 'https://api.airtable.com/v0'

const headers = () => ({
  'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
  'Content-Type': 'application/json'
})

/**
 * Check if Airtable API is configured
 */
export const isAirtableConfigured = () => {
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

    const response = await fetch(url, { headers: headers() })

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
  const response = await fetch(url, { headers: headers() })

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
  const response = await fetch(url, {
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
    const response = await fetch(url, {
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
    bottlesPerBox: get('bottlesPerBox') || null,
    status: getSelect('status') || '',

    // Nutrition (per 100ml)
    nutrition: {
      energy_kj: get('energyKj'),
      energy_kcal: get('energyKcal'),
      fat: get('fatG'),
      saturated_fat: get('saturatesG'),
      carbs: get('carbsG'),
      sugars: get('sugarsG'),
      protein: get('proteinG'),
      salt: get('saltG'),
    },

    // Ingredients (multi-language)
    ingredients: {
      it: get('ingredientsIt') || '',
      en: get('ingredientsEn') || '',
      fr: get('ingredientsFr') || '',
      de: get('ingredientsDe') || '',
      es: get('ingredientsEs') || '',
    },

    // Allergens (multi-language)
    allergens: {
      it: get('allergensIt') || '',
      en: get('allergensEn') || '',
      fr: get('allergensFr') || '',
      de: get('allergensDe') || '',
      es: get('allergensEs') || '',
    },

    // Sake-specific
    seimaibuai: get('seimaibuai') || null,

    // Packaging & Operator
    packagingMaterials: get('packagingMaterials') || '',
    operatorName: get('operatorName') || '',
    operatorAddress: get('operatorAddress') || '',
    countryOfOrigin: get('countryOfOrigin') || '',

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
}
