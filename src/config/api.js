/**
 * Centralized API configuration
 * All API keys and service endpoints in one place.
 */

// Airtable
export const AIRTABLE = {
  apiKey: import.meta.env.VITE_AIRTABLE_API_KEY || '',
  baseId: import.meta.env.VITE_AIRTABLE_BASE_ID || '',
  get isConfigured() {
    return !!(this.apiKey && this.baseId)
  },
}

// Shopify
export const SHOPIFY = {
  store: import.meta.env.VITE_SHOPIFY_STORE || '',
  token: import.meta.env.VITE_SHOPIFY_TOKEN || '',
  proxy: import.meta.env.VITE_SHOPIFY_PROXY || '',
  get isConfigured() {
    return !!(this.store && this.token)
  },
}

// Dropbox
export const DROPBOX = {
  refreshToken: import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || '',
  appKey: import.meta.env.VITE_DROPBOX_APP_KEY || '',
  appSecret: import.meta.env.VITE_DROPBOX_APP_SECRET || '',
  folder: import.meta.env.VITE_DROPBOX_FOLDER || '',
  rootNamespace: import.meta.env.VITE_DROPBOX_ROOT_NAMESPACE || '',
  legacyToken: import.meta.env.VITE_DROPBOX_TOKEN || '',
  get isConfigured() {
    return !!((this.refreshToken && this.appKey && this.appSecret) || this.legacyToken)
  },
}

// Authentication
export const AUTH = {
  adminPassword: import.meta.env.VITE_ADMIN_PASSWORD || '',
  partnerPassword: import.meta.env.VITE_PARTNER_PASSWORD || '',
}

// App
export const APP = {
  baseUrl: 'https://label.sakecompany.com',
}
