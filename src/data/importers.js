const STORAGE_KEY = 'sake-elabel-importers'

export const ACTIVE_REGIONS = ['ITA']

export const defaultImporters = {
  Italia: {
    id: 'default-it',
    code: "IT",
    name: "Sake Company srl",
    address: "Via Bianca di Savoia 17, Milano - Italia",
    lang: "it",
    country: "Italia"
  },
  Deutschland: {
    id: 'default-de',
    code: "DE",
    name: "Sake Company GmbH",
    address: "Deutschland",
    lang: "de",
    country: "Deutschland"
  },
  France: {
    id: 'default-fr',
    code: "FR",
    name: "Sake Company SARL",
    address: "France",
    lang: "fr",
    country: "France"
  },
  España: {
    id: 'default-es',
    code: "ES",
    name: "Sake Company SL",
    address: "España",
    lang: "es",
    country: "España"
  },
  Japan: {
    id: 'default-jp',
    code: "JP",
    name: null,
    address: null,
    lang: "ja",
    country: "Japan"
  }
}

// All known sales region codes → display name + default language
export const REGION_CODE_LABELS = {
  ITA: { label: 'Italia',       lang: 'it' },
  DEU: { label: 'Deutschland',  lang: 'de' },
  FRA: { label: 'France',       lang: 'fr' },
  ESP: { label: 'España',       lang: 'es' },
  CHE: { label: 'Svizzera',     lang: 'it' },
  LUX: { label: 'Lussemburgo',  lang: 'fr' },
  NLD: { label: 'Paesi Bassi',  lang: 'it' },
  AUT: { label: 'Austria',      lang: 'de' },
  GBR: { label: 'Regno Unito',  lang: 'it' },
  BEL: { label: 'Belgio',       lang: 'fr' },
  ALB: { label: 'Albania',      lang: 'it' },
}

// Map region code → importer country key (which default importer to suggest)
export const REGION_CODE_TO_IMPORTER_COUNTRY = {
  ITA: 'Italia',
  DEU: 'Deutschland',
  FRA: 'France',
  ESP: 'España',
  CHE: 'Italia',
  LUX: 'Italia',
  NLD: 'Italia',
  AUT: 'Deutschland',
  GBR: 'Italia',
  BEL: 'Italia',
  ALB: 'Italia',
}

// Primary region codes: these are the "home" regions for each default importer.
// Only primary regions auto-fill with the default importer.
// Secondary regions (CHE, LUX, NLD, AUT, GBR, BEL, ALB) must be configured explicitly.
export const PRIMARY_REGIONS = {
  ITA: 'Italia',
  DEU: 'Deutschland',
  FRA: 'France',
  ESP: 'España',
}

export const isPrimaryRegion = (regionCode) => regionCode in PRIMARY_REGIONS

// Legacy aliases
export const importers = defaultImporters

/**
 * Get custom importers from localStorage
 */
export const getCustomImporters = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

/**
 * Save a new custom importer
 */
export const addCustomImporter = (importer) => {
  const custom = getCustomImporters()
  const newImporter = {
    ...importer,
    id: `custom-${Date.now()}`,
  }
  custom.push(newImporter)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
  return newImporter
}

/**
 * Update a custom importer by ID
 */
export const updateCustomImporter = (id, updates) => {
  const custom = getCustomImporters().map(i =>
    i.id === id ? { ...i, ...updates } : i
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
}

/**
 * Update a default (built-in) importer override in localStorage.
 * Stores overrides separately so defaults can be edited without losing originals.
 */
const DEFAULT_OVERRIDES_KEY = 'sake-elabel-importer-defaults'

export const getDefaultOverrides = () => {
  try {
    return JSON.parse(localStorage.getItem(DEFAULT_OVERRIDES_KEY) || '{}')
  } catch { return {} }
}

export const updateDefaultImporter = (countryKey, updates) => {
  const overrides = getDefaultOverrides()
  overrides[countryKey] = { ...(overrides[countryKey] || {}), ...updates }
  localStorage.setItem(DEFAULT_OVERRIDES_KEY, JSON.stringify(overrides))
}

/**
 * Get an effective default importer (original merged with overrides)
 */
export const getEffectiveDefault = (countryKey) => {
  const base = defaultImporters[countryKey]
  if (!base) return null
  const overrides = getDefaultOverrides()
  return { ...base, ...(overrides[countryKey] || {}) }
}

/**
 * Delete a custom importer by ID
 */
export const removeCustomImporter = (id) => {
  const custom = getCustomImporters().filter(i => i.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
}

/**
 * Get all importers for a given region code (built-in from mapped country + custom for this region)
 * @param {string} regionCode
 * @param {object} options - { onlyComplete: false } — if true, only return importers with name AND address
 */
export const getImportersForRegion = (regionCode, options = {}) => {
  const result = []
  // Get default importer from mapped country (with overrides applied)
  const importerCountry = REGION_CODE_TO_IMPORTER_COUNTRY[regionCode]
  if (importerCountry) {
    const builtIn = getEffectiveDefault(importerCountry)
    if (builtIn && builtIn.name) {
      result.push({ ...builtIn, _default: true, _country: importerCountry })
    }
  }
  // Get custom importers saved for this specific region
  const regionLabel = REGION_CODE_LABELS[regionCode]?.label || regionCode
  const custom = getCustomImporters().filter(i =>
    i.regionCode === regionCode || i.country === regionLabel || i.country === (REGION_CODE_TO_IMPORTER_COUNTRY[regionCode] || '')
  )
  result.push(...custom)

  // Filter to only complete importers (name + address) if requested
  if (options.onlyComplete) {
    return result.filter(i => i.name && i.name.trim() && i.address && i.address.trim())
  }
  return result
}

/**
 * Get all importers for a given country name (built-in + custom) — legacy
 */
export const getImportersForCountry = (country) => {
  const result = []
  const builtIn = defaultImporters[country]
  if (builtIn && builtIn.name) {
    result.push(builtIn)
  }
  const custom = getCustomImporters().filter(i => i.country === country)
  result.push(...custom)
  return result
}

/**
 * Get all importers across all countries
 */
export const getAllImporters = () => {
  const result = []
  for (const [country] of Object.entries(defaultImporters)) {
    const eff = getEffectiveDefault(country)
    if (eff && eff.name) result.push({ ...eff, _default: true, _country: country })
  }
  result.push(...getCustomImporters())
  return result
}

// Legacy functions
export const getImporterByCountry = (country) => {
  return defaultImporters[country] || defaultImporters['Italia']
}

export const getImporterByLanguage = (lang) => {
  const langToCountry = {
    'it': 'Italia',
    'de': 'Deutschland',
    'fr': 'France',
    'es': 'España',
    'ja': 'Japan'
  }
  const country = langToCountry[lang] || 'Italia'
  return defaultImporters[country]
}

export const getCountriesForLanguage = (lang) => {
  const langMap = {
    'it': ['Italia'],
    'de': ['Deutschland'],
    'fr': ['France'],
    'es': ['España'],
    'ja': ['Japan']
  }
  return langMap[lang] || ['Italia']
}

export const getAvailableCountries = () => {
  return Object.keys(defaultImporters)
}
