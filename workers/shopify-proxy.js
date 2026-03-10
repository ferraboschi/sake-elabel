/**
 * Cloudflare Worker: Shopify Admin API CORS Proxy
 *
 * This worker proxies requests to the Shopify Admin API,
 * adding the access token server-side and handling CORS headers.
 *
 * Environment variables (set in Cloudflare dashboard):
 *   SHOPIFY_STORE    - e.g. "sake-company.myshopify.com"
 *   SHOPIFY_TOKEN    - e.g. "shpat_xxxxx"
 *   ALLOWED_ORIGINS  - comma-separated allowed origins, e.g. "https://label.sakecompany.com,http://localhost:3000"
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env)
    }

    // Validate origin
    const origin = request.headers.get('Origin') || ''
    const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim())

    if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
      return new Response('Forbidden', { status: 403 })
    }

    // Extract the Shopify API path from the request URL
    const url = new URL(request.url)
    const shopifyPath = url.pathname // e.g. /admin/api/2025-01/products.json

    if (!shopifyPath.startsWith('/admin/api/')) {
      return new Response('Invalid path. Use /admin/api/...', { status: 400 })
    }

    // Forward to Shopify
    const shopifyUrl = `https://${env.SHOPIFY_STORE}${shopifyPath}${url.search}`

    const shopifyResponse = await fetch(shopifyUrl, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_TOKEN,
      },
      body: request.method !== 'GET' ? request.body : undefined,
    })

    // Return response with CORS headers
    const responseHeaders = new Headers(shopifyResponse.headers)
    responseHeaders.set('Access-Control-Allow-Origin', origin)
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type')
    // Remove Shopify's restrictive headers
    responseHeaders.delete('X-Frame-Options')

    return new Response(shopifyResponse.body, {
      status: shopifyResponse.status,
      headers: responseHeaders,
    })
  },
}

function handleCORS(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim())

  if (!allowedOrigins.includes(origin) && !allowedOrigins.includes('*')) {
    return new Response('Forbidden', { status: 403 })
  }

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
