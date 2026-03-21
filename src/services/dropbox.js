/**
 * Dropbox API Service
 * Reads container folders and XLSX product lists from Dropbox
 *
 * NOTE: For Dropbox Business/Team accounts, we need the Dropbox-API-Path-Root header
 * to access team folders. The root_namespace_id is obtained from get_current_account.
 */

const DROPBOX_TOKEN = import.meta.env.VITE_DROPBOX_TOKEN || ''
const DROPBOX_FOLDER = import.meta.env.VITE_DROPBOX_FOLDER || '/lorenzo ferraboschi/SC importazioni'
const DROPBOX_ROOT_NS = import.meta.env.VITE_DROPBOX_ROOT_NAMESPACE || ''

export const isDropboxConfigured = () => !!DROPBOX_TOKEN && DROPBOX_TOKEN.length > 10

/**
 * Common headers for all Dropbox API calls
 */
const apiHeaders = () => {
  const h = {
    'Authorization': `Bearer ${DROPBOX_TOKEN}`,
    'Content-Type': 'application/json',
  }
  // Add root namespace header for team Dropbox accounts
  if (DROPBOX_ROOT_NS) {
    h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', root: DROPBOX_ROOT_NS })
  }
  return h
}

/**
 * Headers for content download (no Content-Type, needs Dropbox-API-Arg)
 */
const downloadHeaders = (filePath) => {
  const h = {
    'Authorization': `Bearer ${DROPBOX_TOKEN}`,
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
    headers: apiHeaders(),
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
    headers: apiHeaders(),
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
      headers: apiHeaders(),
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
    headers: downloadHeaders(filePath),
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
