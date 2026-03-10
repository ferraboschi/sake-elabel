/**
 * Shopify API Service
 * Fetches product data, images, descriptions and variants from Shopify store
 *
 * Uses Shopify Admin API (REST) via server-side proxy to avoid CORS issues
 * In development: Vite proxy forwards /shopify-api/* to Shopify
 * In production: Cloudflare Worker or similar proxy handles forwarding
 *
 * Store URL and Access Token configured via environment variables
 */

const SHOPIFY_STORE = import.meta.env.VITE_SHOPIFY_STORE || '' // e.g. 'sake-company.myshopify.com'
const SHOPIFY_TOKEN = import.meta.env.VITE_SHOPIFY_TOKEN || '' // Admin API access token

const API_VERSION = '2025-01'

/**
 * Check if Shopify API is configured
 */
export const isShopifyConfigured = () => {
  return !!SHOPIFY_STORE && !!SHOPIFY_TOKEN && SHOPIFY_TOKEN.length > 10
}

/**
 * Make authenticated request to Shopify Admin API
 * Uses Vite dev proxy in development, direct URL otherwise
 * Note: In production (GitHub Pages), a CORS proxy/worker is needed
 */
const shopifyFetch = async (endpoint, options = {}) => {
  // In development, use Vite proxy to avoid CORS
  const isDev = import.meta.env.DEV
  let url

  if (isDev) {
    // Vite proxy will forward to Shopify (configured in vite.config.js)
    url = `/shopify-api/admin/api/${API_VERSION}${endpoint}`
  } else {
    // In production, try direct (will work if CORS proxy like Cloudflare Worker is set up)
    // Or use the configured proxy URL
    const proxyBase = import.meta.env.VITE_SHOPIFY_PROXY || ''
    if (proxyBase) {
      url = `${proxyBase}/admin/api/${API_VERSION}${endpoint}`
    } else {
      url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}${endpoint}`
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // Add auth token — in dev it goes through proxy, in prod through worker
  if (isDev || !import.meta.env.VITE_SHOPIFY_PROXY) {
    headers['X-Shopify-Access-Token'] = SHOPIFY_TOKEN
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Shopify API error (${response.status}): ${err}`)
  }

  return response.json()
}

/**
 * Fetch all products with images
 * Uses since_id pagination to handle stores with many products
 * Returns normalized product data
 */
export const fetchShopifyProducts = async () => {
  if (!isShopifyConfigured()) return []

  const allProducts = []
  let sinceId = 0
  const fields = 'id,title,body_html,variants,images,product_type,tags,handle,status'

  // Paginate through all products (250 at a time, max 2000 total)
  for (let page = 0; page < 8; page++) {
    const params = new URLSearchParams({ limit: '250', fields })
    if (sinceId > 0) params.set('since_id', String(sinceId))

    try {
      const data = await shopifyFetch(`/products.json?${params}`)
      const products = data.products || []
      allProducts.push(...products)

      if (products.length === 0) break // No more products
      sinceId = products[products.length - 1].id
      if (products.length < 250) break // Last page
    } catch (err) {
      console.error(`Shopify fetch page ${page} failed:`, err)
      break
    }
  }

  console.log(`📦 Shopify: ${allProducts.length} prodotti caricati`)
  return allProducts.map(normalizeShopifyProduct)
}

/**
 * Fetch a single product by Shopify ID
 */
export const fetchShopifyProduct = async (productId) => {
  if (!isShopifyConfigured()) return null
  const data = await shopifyFetch(`/products/${productId}.json`)
  return normalizeShopifyProduct(data.product)
}

/**
 * Normalize Shopify product to our app format
 */
function normalizeShopifyProduct(product) {
  const images = (product.images || []).map(img => ({
    id: img.id,
    src: img.src,
    alt: img.alt || '',
    width: img.width,
    height: img.height,
  }))

  const mainImage = images[0]?.src || null

  // Extract barcode/SKU from variants
  const variants = (product.variants || []).map(v => ({
    id: v.id,
    sku: v.sku || '',
    barcode: v.barcode || '',
    price: v.price,
    title: v.title,
    weight: v.weight,
    weightUnit: v.weight_unit,
  }))

  const primaryVariant = variants[0] || {}

  // Clean HTML from body
  const description = (product.body_html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Extract tags as array
  const tags = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean)

  return {
    shopifyId: product.id,
    handle: product.handle,
    name: product.title,
    description,
    photo: mainImage,
    images,
    category: product.product_type || '',
    tags,
    status: product.status,
    sku: primaryVariant.sku || '',
    barcode: primaryVariant.barcode || '',
    price: primaryVariant.price || '',
    variants,
  }
}

/**
 * Match Shopify products to Airtable products by CODE, barcode, or name
 * Returns a map: airtableSlug → shopifyProduct
 */
export const matchProducts = (airtableProducts, shopifyProducts) => {
  const matches = {}
  let matchCount = 0

  for (const atProduct of airtableProducts) {
    let match = null

    // 1. Match by barcode (most reliable)
    if (atProduct.barcode) {
      match = shopifyProducts.find(sp =>
        sp.barcode === atProduct.barcode ||
        sp.variants.some(v => v.barcode === atProduct.barcode)
      )
    }

    // 2. Match by SKU ↔ CODE
    if (!match && atProduct.code) {
      match = shopifyProducts.find(sp =>
        sp.sku === atProduct.code ||
        sp.variants.some(v => v.sku === atProduct.code)
      )
    }

    // 3. Fuzzy match by name (last resort)
    if (!match && atProduct.name) {
      const atName = atProduct.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (atName.length > 3) {
        match = shopifyProducts.find(sp => {
          const spName = sp.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          return spName === atName || spName.includes(atName) || atName.includes(spName)
        })
      }
    }

    if (match) {
      matches[atProduct.slug] = match
      matchCount++
    }
  }

  console.log(`🔗 Shopify matching: ${matchCount}/${airtableProducts.length} prodotti abbinati`)
  return matches
}

export default {
  isShopifyConfigured,
  fetchShopifyProducts,
  fetchShopifyProduct,
  matchProducts,
}
