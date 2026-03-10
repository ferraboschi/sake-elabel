const STORAGE_KEY = 'sake-elabel-importers'

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
 * Delete a custom importer by ID
 */
export const removeCustomImporter = (id) => {
  const custom = getCustomImporters().filter(i => i.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
}

/**
 * Get all importers for a given country (built-in + custom)
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
  for (const [country, imp] of Object.entries(defaultImporters)) {
    if (imp.name) result.push(imp)
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
