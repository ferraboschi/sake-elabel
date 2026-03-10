import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import itTranslations from './locales/it.json'
import deTranslations from './locales/de.json'
import frTranslations from './locales/fr.json'
import esTranslations from './locales/es.json'
import jaTranslations from './locales/ja.json'

const resources = {
  it: { translation: itTranslations },
  de: { translation: deTranslations },
  fr: { translation: frTranslations },
  es: { translation: esTranslations },
  ja: { translation: jaTranslations }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false
    }
  })

export default i18n
