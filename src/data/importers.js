export const importers = {
  Italia: { 
    code: "IT",
    name: "Sake Company srl", 
    address: "Via Bianca di Savoia 17, Milano - Italia", 
    lang: "it" 
  },
  Deutschland: { 
    code: "DE",
    name: "Sake Company GmbH", 
    address: "Deutschland", 
    lang: "de" 
  },
  France: { 
    code: "FR",
    name: "Sake Company SARL", 
    address: "France", 
    lang: "fr" 
  },
  España: { 
    code: "ES",
    name: "Sake Company SL", 
    address: "España", 
    lang: "es" 
  },
  Japan: { 
    code: "JP",
    name: null, 
    address: null, 
    lang: "ja" 
  }
}

export const getImporterByCountry = (country) => {
  return importers[country] || importers['Italia']
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
  return importers[country]
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
  return Object.keys(importers)
}
