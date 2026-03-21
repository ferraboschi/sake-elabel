/**
 * Dropbox API Service
 * Reads container folders and XLSX product lists from Dropbox
 *
 * Uses OAuth2 refresh token for auto-renewing access.
 * The refresh token never expires; access tokens are refreshed automatically.
 */

const DROPBOX_REFRESH_TOKEN = import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || ''
const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || ''
const DROPBOX_APP_SECRET = import.meta.env.VITE_DROPBOX_APP_SECRET || ''
const DROPBOX_FOLDER = import.meta.env.VITE_DROPBOX_FOLDER || '/lorenzo ferraboschi/SC importazioni'
const DROPBOX_ROOT_NS = import.meta.env.VITE_DROPBOX_ROOT_NAMESPACE || ''

// Legacy: support direct token for backward compatibility
const DROPBOX_TOKEN_LEGACY = import.meta.env.VITE_DROPBOX_TOKEN || ''

// In-memory token cache
let _cachedToken = null
let _tokenExpiry = 0

export const isDropboxConfigured = () => {
  // Configured if we have refresh token + app credentials, OR a legacy direct token
  return (!!DROPBOX_REFRESH_TOKEN && !!DROPBOX_APP_KEY && !!DROPBOX_APP_SECRET) ||
         (!!DROPBOX_TOKEN_LEGACY && DROPBOX_TOKEN_LEGACY.length > 10)
}

/**
 * Get a valid access token, refreshing if needed.
 * Caches the token in memory and auto-refreshes before expiry.
 */
const getAccessToken = async () => {
  // If we have refresh token setup, use it
  if (DROPBOX_REFRESH_TOKEN && DROPBOX_APP_KEY && DROPBOX_APP_SECRET) {
    const now = Date.now()
    // Refresh if expired or within 5 min of expiry
    if (_cachedToken && _tokenExpiry > now + 5 * 60 * 1000) {
      return _cachedToken
    }

    // Refresh the token
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: DROPBOX_REFRESH_TOKEN,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
    })

    const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`Dropbox token refresh failed: ${err}`)
    }

    const data = await resp.json()
    _cachedToken = data.access_token
    _tokenExpiry = now + (data.expires_in * 1000)
    console.log('[Dropbox] Token refreshed, expires in', data.expires_in, 'seconds')
    return _cachedToken
  }

  // Fallback to legacy direct token
  if (DROPBOX_TOKEN_LEGACY) {
    return DROPBOX_TOKEN_LEGACY
  }

  throw new Error('Dropbox non configurato')
}

/**
 * Common headers for all Dropbox API calls
 */
const apiHeaders = async () => {
  const token = await getAccessToken()
  const h = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  if (DROPBOX_ROOT_NS) {
    h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', root: DROPBOX_ROOT_NS })
  }
  return h
}

/**
 * Headers for content download (no Content-Type, needs Dropbox-API-Arg)
 */
const downloadHeaders = async (filePath) => {
  const token = await getAccessToken()
  const h = {
    'Authorization': `Bearer ${token}`,
    'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
  }
  if (DROPBOX_ROOT_NS) {
    h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', root: DROPBOX_ROOT_NS })
  }
  return h
}

/**
 * List folders inside SC importazioni (each folder = one container shipment)
 */
export const listContainerFolders = async () => {
  if (!isDropboxConfigured()) throw new Error('Dropbox non configurato')

  const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify({
      path: DROPBOX_FOLDER,
      recursive: false,
      include_non_downloadable_files: false,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Dropbox error: ${err.error_summary || response.statusText}`)
  }

  const data = await response.json()

  // Filter only folders, sort by name descending (newest first)
  const folders = data.entries
    .filter(e => e['.tag'] === 'folder')
    .map(e => ({
      name: e.name,
      path: e.path_lower,
      pathDisplay: e.path_display,
      id: e.id,
    }))
    .sort((a, b) => b.name.localeCompare(a.name))

  return folders
}

/**
 * List files inside a specific container folder
 */
export const listFolderContents = async (folderPath) => {
  if (!isDropboxConfigured()) throw new Error('Dropbox non configurato')

  const allEntries = []
  let cursor = null
  let hasMore = true

  // First call
  let response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify({
      path: folderPath,
      recursive: true,
      include_non_downloadable_files: false,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw new Error(`Dropbox error: ${err.error_summary || response.statusText}`)
  }

  let data = await response.json()
  allEntries.push(...data.entries)
  hasMore = data.has_more
  cursor = data.cursor

  // Continue if paginated
  while (hasMore) {
    response = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: await apiHeaders(),
      body: JSON.stringify({ cursor }),
    })
    data = await response.json()
    allEntries.push(...data.entries)
    hasMore = data.has_more
    cursor = data.cursor
  }

  return allEntries.map(e => ({
    tag: e['.tag'],
    name: e.name,
    path: e.path_lower,
    pathDisplay: e.path_display,
    id: e.id,
    size: e.size || 0,
  }))
}

/**
 * Download a file from Dropbox as ArrayBuffer
 */
export const downloadFile = async (filePath) => {
  if (!isDropboxConfigured()) throw new Error('Dropbox non configurato')

  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: await downloadHeaders(filePath),
  })

  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`)
  }

  return await response.arrayBuffer()
}

/**
 * Find XLSX files in a container folder (product lists)
 */
export const findXlsxFiles = (entries) => {
  return entries.filter(e =>
    e.tag === 'file' &&
    e.name.toLowerCase().endsWith('.xlsx') &&
    !e.name.startsWith('~$') // skip temp files
  )
}

/**
 * Find subfolders (country folders) in a container
 */
export const findSubfolders = (entries, parentPath) => {
  return entries.filter(e =>
    e.tag === 'folder' &&
    // Only direct children of parent
    e.path.replace(parentPath + '/', '').indexOf('/') === -1
  )
}

export default {
  isDropboxConfigured,
  listContainerFolders,
  listFolderContents,
  downloadFile,
  findXlsxFiles,
  findSubfolders,
}
