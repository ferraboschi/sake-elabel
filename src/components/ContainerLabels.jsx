import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { read, utils } from 'xlsx'
import QRCode from 'qrcode'
import { listContainerFolders, listFolderContents, downloadFile, findXlsxFiles, findSubfolders, isDropboxConfigured } from '../services/dropbox'
import { fetchProducts, isAirtableConfigured } from '../services/airtable'
import { useAuth } from '../contexts/AuthContext'
import { saveLabels, getLabels } from '../services/labelStore'
import { generateLabelPDF } from '../services/labelPrinter'
import { detectDetailedCategory, getDefaultLegalDescription } from '../services/categoryDetector'
import shopifyPhotos from '../data/shopifyPhotos.json'

// Standard sake types that do NOT need ingredient verification
const STANDARD_SAKE_TYPES = [
  'junmai daiginjo', 'junmai ginjo', 'junmai', 'daiginjo', 'ginjo',
  'honjozo', 'tokubetsu junmai', 'tokubetsu honjozo', 'futsu-shu', 'futsushu',
  'nigori', 'nama', 'namazake', 'genshu', 'koshu', 'sparkling sake',
  'junmai-shu', 'ginjo-shu', 'daiginjo-shu', 'honjozo-shu',
  'sake', 'nihonshu', 'japanese sake', 'shochu', 'awamori',
]

function isNonStandardType(type) {
  if (!type) return false
  const lower = type.toLowerCase().trim()
  for (const std of STANDARD_SAKE_TYPES) {
    if (lower.includes(std)) return false
  }
  const nonStandard = ['yuzu', 'umeshu', 'spirit', 'fruit', 'liqueur', 'liquore', 'plum', 'citrus', 'amazake']
  for (const ns of nonStandard) {
    if (lower.includes(ns)) return true
  }
  return true
}

/**
 * Parse XLSX product list into structured data
 */
function parseProductList(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  const rows = utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length < 2) return []

  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i].map(c => String(c).toUpperCase().trim())
    if (row.includes('CODE') || row.includes('CODICE')) {
      headerIdx = i
      break
    }
  }

  const headers = rows[headerIdx].map(h => String(h).toUpperCase().trim())

  const colIdx = {
    code: headers.findIndex(h => h === 'CODE' || h === 'CODICE'),
    productName: headers.findIndex(h => h.includes('PRODUCT NAME') || h.includes('NOME PRODOTTO')),
    sakagura: headers.findIndex(h => h === 'SAKAGURA' || h.includes('CANTINA')),
    productNameJp: headers.findIndex(h => h.includes('JP') && h.includes('PRODUCT')),
    sakaguraJp: headers.findIndex(h => h.includes('JP') && h.includes('SAKAGURA')),
    type: headers.findIndex(h => h === 'TYPE' || h === 'TIPO'),
    size: headers.findIndex(h => h === 'SIZE' || h.includes('ML') || h.includes('FORMATO')),
    alcohol: headers.findIndex(h => h.includes('ALCOL') || h.includes('ALC') || h.includes('ABV')),
    bottPerBox: headers.findIndex(h => h.includes('BOTT') || h.includes('BOX') || h.includes('CARTONE')),
  }

  const products = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const code = colIdx.code >= 0 ? String(row[colIdx.code] || '').trim() : ''
    if (!code) continue

    const name = colIdx.productName >= 0 ? String(row[colIdx.productName] || '').trim() : ''
    if (!name) continue

    let sizeRaw = colIdx.size >= 0 ? String(row[colIdx.size] || '').trim() : ''
    let sizeMl = parseInt(sizeRaw.replace(/[^0-9]/g, ''), 10) || null

    let alcRaw = colIdx.alcohol >= 0 ? row[colIdx.alcohol] : null
    let alcPct = null
    if (alcRaw !== null && alcRaw !== '') {
      alcPct = parseFloat(String(alcRaw).replace(/[^0-9.]/g, ''))
      if (alcPct && alcPct < 1) alcPct = alcPct * 100
    }

    products.push({
      code,
      name,
      sakagura: colIdx.sakagura >= 0 ? String(row[colIdx.sakagura] || '').trim() : '',
      nameJp: colIdx.productNameJp >= 0 ? String(row[colIdx.productNameJp] || '').trim() : '',
      sakaguraJp: colIdx.sakaguraJp >= 0 ? String(row[colIdx.sakaguraJp] || '').trim() : '',
      type: colIdx.type >= 0 ? String(row[colIdx.type] || '').trim() : '',
      sizeMl,
      alcoholPct: alcPct,
      bottPerBox: colIdx.bottPerBox >= 0 ? parseInt(row[colIdx.bottPerBox]) || null : null,
      isNonStandard: false,
    })
  }

  products.forEach(p => { p.isNonStandard = isNonStandardType(p.type) })
  return products
}

const ContainerLabels = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // State
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [containerFilter, setContainerFilter] = useState('')

  // Selected container
  const [selectedContainer, setSelectedContainer] = useState(null)
  const [containerContents, setContainerContents] = useState(null)
  const [loadingContents, setLoadingContents] = useState(false)

  // XLSX data
  const [xlsxProducts, setXlsxProducts] = useState([])
  const [xlsxFileName, setXlsxFileName] = useState('')
  const [loadingXlsx, setLoadingXlsx] = useState(false)

  // Airtable products for matching
  const [airtableProducts, setAirtableProducts] = useState([])
  const [matchResults, setMatchResults] = useState([])

  // QR generation
  const [generating, setGenerating] = useState(false)
  const [generatedLabels, setGeneratedLabels] = useState([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [savedToArchive, setSavedToArchive] = useState(false)
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0, active: false })

  // Filtered containers
  const filteredContainers = useMemo(() => {
    if (!containerFilter.trim()) return containers
    const q = containerFilter.toLowerCase().trim()
    return containers.filter(c => c.name.toLowerCase().includes(q))
  }, [containers, containerFilter])

  // Labels that will be generated (matched on Airtable, not_found excluded)
  const labelsToGenerate = useMemo(() => {
    return matchResults.filter(m => m.airtable && m.status !== 'not_found')
  }, [matchResults])

  // Load container list + Airtable products on mount
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        const [folders, products] = await Promise.all([
          listContainerFolders(),
          isAirtableConfigured() ? fetchProducts() : Promise.resolve([]),
        ])
        setContainers(folders)
        setAirtableProducts(products || [])
      } catch (err) {
        console.error('Init error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Select a container → load its contents
  const handleSelectContainer = async (container) => {
    setSelectedContainer(container)
    setContainerContents(null)
    setXlsxProducts([])
    setXlsxFileName('')
    setMatchResults([])
    setGeneratedLabels([])
    setSavedToArchive(false)
    setLoadingContents(true)
    try {
      const contents = await listFolderContents(container.path)
      setContainerContents(contents)

      const xlsxFiles = findXlsxFiles(contents)
      if (xlsxFiles.length > 0) {
        const mainXlsx = xlsxFiles.reduce((a, b) => a.size > b.size ? a : b)
        await loadXlsx(mainXlsx)
      }
    } catch (err) {
      console.error('Load container error:', err)
      setError(err.message)
    } finally {
      setLoadingContents(false)
    }
  }

  // Load and parse an XLSX file
  const loadXlsx = async (xlsxEntry) => {
    setLoadingXlsx(true)
    try {
      const buffer = await downloadFile(xlsxEntry.path)
      const workbook = read(buffer, { type: 'array' })
      const products = parseProductList(workbook)
      setXlsxProducts(products)
      setXlsxFileName(xlsxEntry.name)
      matchWithAirtable(products)
    } catch (err) {
      console.error('XLSX parse error:', err)
      setError(`Errore lettura XLSX: ${err.message}`)
    } finally {
      setLoadingXlsx(false)
    }
  }

  // Match XLSX products with Airtable products by CODE
  const matchWithAirtable = (xlsxProds) => {
    const codeMap = {}
    airtableProducts.forEach(p => {
      if (p.code) codeMap[p.code.toUpperCase().trim()] = p
    })

    const results = xlsxProds.map(xp => {
      const key = xp.code.toUpperCase().trim()
      const airtable = codeMap[key] || null
      let status = 'not_found'
      if (airtable) {
        if (airtable.elabelUrl || airtable.elabelQrGenerated) {
          status = 'has_label'
        } else if (airtable.nutrition?.energy_kj) {
          status = 'has_nutrition'
        } else {
          status = 'found'
        }
      }
      return { xlsx: xp, airtable, status }
    })

    setMatchResults(results)
  }

  // Generate QR codes for all matched products + save to archive
  const handleGenerateAll = async () => {
    if (labelsToGenerate.length === 0) return

    setGenerating(true)
    setSavedToArchive(false)
    setProgress({ current: 0, total: labelsToGenerate.length })
    const labels = []

    for (let i = 0; i < labelsToGenerate.length; i++) {
      const match = labelsToGenerate[i]
      const product = match.airtable
      const slug = product.slug
      const url = `https://label.sakecompany.com/label/${slug}`

      try {
        const qrDataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        })

        labels.push({
          slug,
          code: product.code,
          name: product.name,
          nameJp: product.nameJp || '',
          winery: product.winery || '',
          wineryJp: product.wineryJp || '',
          category: product.category || '',
          sizeMl: product.volumeMl,
          alcoholPct: product.alcoholPct,
          url,
          qrDataUrl,
          generated: new Date().toISOString(),
          containerName: selectedContainer?.name || '',
          // Full Airtable data for archive
          nutrition: product.nutrition || null,
          ingredients: product.ingredients || null,
          bottleMaterialCode: product.bottleMaterialCode || '',
          capMaterialCode: product.capMaterialCode || '',
          seimaibuai: product.seimaibuai || null,
          operatorName: product.operatorName || '',
          operatorAddress: product.operatorAddress || '',
        })
      } catch (err) {
        console.error(`QR error for ${slug}:`, err)
      }

      setProgress({ current: i + 1, total: labelsToGenerate.length })
    }

    setGeneratedLabels(labels)

    // Save to archive — format compatible with labelStore.saveLabels
    if (labels.length > 0) {
      try {
        const archiveLabels = labels.map(label => ({
          slug: label.slug,
          code: label.code,
          name: label.name,
          nameJp: label.nameJp,
          winery: label.winery,
          wineryJp: label.wineryJp,
          category: label.category,
          language: 'it',
          country: 'IT',
          importer: {
            name: label.operatorName || 'Sake Company srl',
            address: label.operatorAddress || '',
          },
          qr: label.qrDataUrl,
          volumeMl: label.sizeMl,
          alcoholPct: label.alcoholPct,
          generatedAt: label.generated,
          generatedBy: user?.username || 'container',
          nutrition: label.nutrition,
          ingredients: label.ingredients,
          bottleMaterialCode: label.bottleMaterialCode,
          capMaterialCode: label.capMaterialCode,
          seimaibuai: label.seimaibuai,
          containerName: label.containerName,
        }))
        saveLabels(archiveLabels)
        setSavedToArchive(true)
      } catch (e) {
        console.error('Error saving to archive:', e)
      }
    }
    setGenerating(false)
  }

  // Download all labels as individual PDFs (55mm back-label format) in a ZIP
  const handleDownloadZip = async () => {
    if (generatedLabels.length === 0) return

    setZipProgress({ current: 0, total: generatedLabels.length, active: true })

    const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')
    const zip = new JSZip()
    const folderName = selectedContainer?.name || 'etichette'
    const folder = zip.folder(folderName)

    for (let i = 0; i < generatedLabels.length; i++) {
      const label = generatedLabels[i]
      const safeName = label.name.replace(/[^a-zA-Z0-9\u3000-\u9FFF\u4E00-\u9FFF]/g, '_').substring(0, 50)
      const fileName = `${label.code}_${safeName}_${label.sizeMl || ''}ml`

      try {
        // Find full Airtable product data for this label
        const airtableProd = airtableProducts.find(p => p.code?.toUpperCase().trim() === label.code?.toUpperCase().trim())

        // Detect detailed category (e.g. "Fruit Sake" → "Yuzushu")
        const codeKey = (label.code || '').toUpperCase()
        const barcodeKey = airtableProd?.barcode || label.barcode || ''
        const spMatch = (codeKey && shopifyPhotos[codeKey]) || (barcodeKey && shopifyPhotos[barcodeKey])
        const shopifyType = spMatch?.product_type || ''
        const rawCategory = airtableProd?.category || label.category || ''
        const detailedCategory = detectDetailedCategory(label.name, rawCategory, shopifyType)

        // Build label data compatible with generateLabelPDF
        const pdfLabel = {
          name: label.name,
          labelTitle: label.name,
          code: label.code,
          category: detailedCategory || rawCategory,
          legalDescription: airtableProd?.legalDescription || getDefaultLegalDescription(detailedCategory || rawCategory, 'it'),
          alcoholPct: airtableProd?.alcoholPct || label.alcoholPct,
          volumeMl: airtableProd?.volumeMl || label.sizeMl,
          seimaibuai: airtableProd?.seimaibuai || null,
          countryOfOrigin: airtableProd?.countryOfOrigin || 'Giappone',
          importer: {
            name: airtableProd?.operatorName || 'Sake Company srl',
            address: airtableProd?.operatorAddress || 'Via Solferino 7, 25122 Brescia (BS) Italia',
          },
          ingredients: airtableProd?.ingredients || label.ingredients || { it: 'Acqua, riso, koji' },
          allergens: airtableProd?.allergens || {},
          nutrition: airtableProd?.nutrition || label.nutrition || null,
          barcode: airtableProd?.barcode || label.barcode || '',
          barcodeBox: airtableProd?.barcodeBox || '',
          qr: label.qrDataUrl,
          language: 'it',
          country: 'IT',
        }

        // Generate bottle label PDF
        const doc = await generateLabelPDF(pdfLabel)
        const pdfBlob = doc.output('arraybuffer')
        folder.file(`${fileName}_BOTTIGLIA.pdf`, pdfBlob)

        // Generate box label PDF if box EAN is available
        if (pdfLabel.barcodeBox) {
          const boxIconCanvas = document.createElement('canvas')
          boxIconCanvas.width = 200; boxIconCanvas.height = 200
          const bctx = boxIconCanvas.getContext('2d')
          const bp = 20, bw = 160, bh = 160, bcx = 100, btopH = 40
          bctx.strokeStyle = '#444'; bctx.lineWidth = 5; bctx.fillStyle = '#f5f5f5'
          bctx.fillRect(bp, bp + btopH, bw, bh - btopH); bctx.strokeRect(bp, bp + btopH, bw, bh - btopH)
          bctx.beginPath(); bctx.moveTo(bp, bp + btopH); bctx.lineTo(bp + 24, bp); bctx.lineTo(bp + 136, bp); bctx.lineTo(bp + bw, bp + btopH); bctx.closePath()
          bctx.fillStyle = '#e8e8e8'; bctx.fill(); bctx.stroke()
          bctx.beginPath(); bctx.moveTo(bcx, bp); bctx.lineTo(bcx, bp + btopH); bctx.stroke()
          bctx.fillStyle = '#333'; bctx.font = 'bold 30px Helvetica, Arial, sans-serif'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'
          bctx.fillText('BOX', bcx, bp + btopH + (bh - btopH) * 0.55)
          const boxIconUrl = boxIconCanvas.toDataURL('image/png')

          const boxLabel = {
            ...pdfLabel,
            barcode: pdfLabel.barcodeBox,
            _isBoxLabel: true,
            _boxIconDataUrl: boxIconUrl,
          }
          const boxDoc = await generateLabelPDF(boxLabel)
          const boxBlob = boxDoc.output('arraybuffer')
          folder.file(`${fileName}_BOX.pdf`, boxBlob)
        }
      } catch (err) {
        console.error(`PDF error for ${label.code}:`, err)
        // Fallback: add QR PNG if PDF fails
        const base64 = label.qrDataUrl.split(',')[1]
        folder.file(`${fileName}_QR.png`, base64, { base64: true })
      }

      setZipProgress({ current: i + 1, total: generatedLabels.length, active: true })
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Etichette_${folderName.replace(/[^a-zA-Z0-9_\-]/g, '_')}.zip`
    a.click()
    URL.revokeObjectURL(url)
    setZipProgress({ current: 0, total: 0, active: false })
  }

  // Status badge
  const StatusBadge = ({ status, isNonStandard }) => {
    const configs = {
      has_label: { bg: '#e8f5e9', color: '#2e7d32', text: '✅ Etichetta' },
      has_nutrition: { bg: '#e3f2fd', color: '#1565c0', text: '📊 Dati nutriz.' },
      found: { bg: '#fff3e0', color: '#e65100', text: '⚠️ Solo anagrafica' },
      not_found: { bg: '#ffebee', color: '#c62828', text: '❌ Non trovato' },
    }
    const c = configs[status] || configs.not_found
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
          fontSize: '11px', fontWeight: 600, background: c.bg, color: c.color,
        }}>
          {c.text}
        </span>
        {isNonStandard && (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
            fontSize: '11px', fontWeight: 600, background: '#fff9c4', color: '#f57f17',
          }}>
            🧪 Verifica ingredienti
          </span>
        )}
      </span>
    )
  }

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#888' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
        Caricamento container da Dropbox...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            📦 Etichette per Container
          </h1>
          <p style={{ fontSize: '13px', color: '#888', margin: '4px 0 0' }}>
            Leggi la lista prodotti dal Dropbox, genera QR code e etichette per ogni spedizione
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/')}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid #ddd',
              background: '#fff', cursor: 'pointer', fontSize: '13px',
            }}>
            ← Dashboard
          </button>
          <button onClick={logout}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid #ddd',
              background: '#fff', cursor: 'pointer', fontSize: '13px', color: '#999',
            }}>
            Esci
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          background: '#ffebee', color: '#c62828', fontSize: '14px',
        }}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={{
            float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828',
          }}>✕</button>
        </div>
      )}

      {/* STEP 1: Container list with filter */}
      {!selectedContainer && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              Seleziona un container
            </h2>
            <span style={{ fontSize: '13px', color: '#888' }}>
              {filteredContainers.length} di {containers.length} container
            </span>
          </div>

          {/* Search filter */}
          <div style={{ marginBottom: '16px' }}>
            <input
              type="text"
              placeholder="Filtra per nome, anno, tipo (es. 2026, OCEAN, air)..."
              value={containerFilter}
              onChange={e => setContainerFilter(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px',
                border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#1565c0'}
              onBlur={e => e.target.style.borderColor = '#ddd'}
            />
          </div>

          {filteredContainers.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', padding: '24px' }}>
              {containers.length === 0 ? 'Nessun container trovato in Dropbox.' : 'Nessun container corrisponde al filtro.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {filteredContainers.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectContainer(c)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    padding: '16px 20px', borderRadius: '10px', cursor: 'pointer',
                    border: '1px solid #e0e0e0', background: '#fff', textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>📦</div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>{c.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Container contents + product list */}
      {selectedContainer && (
        <div>
          {/* Back button + container name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <button onClick={() => { setSelectedContainer(null); setContainerContents(null); setXlsxProducts([]); setMatchResults([]); setGeneratedLabels([]); setSavedToArchive(false) }}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd',
                background: '#fff', cursor: 'pointer', fontSize: '13px',
              }}>
              ← Indietro
            </button>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
              📦 {selectedContainer.name}
            </h2>
          </div>

          {loadingContents || loadingXlsx ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              {loadingContents ? 'Lettura cartella Dropbox...' : 'Analisi file Excel...'}
            </div>
          ) : (
            <>
              {/* Container info bar */}
              {containerContents && (
                <div style={{
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                  padding: '12px 16px', borderRadius: '8px', background: '#f5f5f5',
                  marginBottom: '16px', fontSize: '13px', color: '#555',
                }}>
                  <span>📁 {containerContents.filter(e => e.tag === 'folder').length} cartelle</span>
                  <span>📄 {containerContents.filter(e => e.tag === 'file').length} file</span>
                  {xlsxFileName && <span>📊 <strong>{xlsxFileName}</strong></span>}
                  <span>🍶 {xlsxProducts.length} prodotti nel file</span>
                  <span>✅ {matchResults.filter(m => m.airtable).length} trovati su Airtable</span>
                  <span>❌ {matchResults.filter(m => !m.airtable).length} non trovati</span>
                </div>
              )}

              {/* XLSX selector if multiple files */}
              {containerContents && findXlsxFiles(containerContents).length > 1 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, marginRight: '8px' }}>File XLSX:</label>
                  <select
                    value={xlsxFileName}
                    onChange={e => {
                      const file = findXlsxFiles(containerContents).find(f => f.name === e.target.value)
                      if (file) loadXlsx(file)
                    }}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px' }}
                  >
                    {findXlsxFiles(containerContents).map(f => (
                      <option key={f.path} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Non-standard warning */}
              {matchResults.some(m => m.xlsx.isNonStandard) && (
                <div style={{
                  padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
                  background: '#fff9c4', border: '1px solid #f9a825', fontSize: '13px',
                }}>
                  <strong>🧪 Attenzione:</strong> Alcuni prodotti in questo container non sono sake standard
                  (Yuzu, Umeshu, Spirit, Fruit Sake, ecc.). <strong>Verifica che gli ingredienti siano corretti</strong> prima
                  di generare le etichette, perché potrebbero contenere ingredienti diversi dal sake (zucchero, succo di frutta, ecc.).
                </div>
              )}

              {/* Product table */}
              {matchResults.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Codice</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Prodotto</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Sakagura</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Tipo</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>ML</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Alc%</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchResults.map((m, i) => (
                        <tr key={i} style={{
                          borderBottom: '1px solid #eee',
                          background: m.xlsx.isNonStandard ? '#fffde7' : (i % 2 === 0 ? '#fff' : '#fafafa'),
                        }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '12px' }}>{m.xlsx.code}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 500 }}>{m.xlsx.name}</div>
                            {m.xlsx.nameJp && <div style={{ fontSize: '11px', color: '#888' }}>{m.xlsx.nameJp}</div>}
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#666' }}>{m.xlsx.sakagura}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '12px' }}>{m.xlsx.type}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{m.xlsx.sizeMl}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{m.xlsx.alcoholPct ? `${m.xlsx.alcoholPct}%` : ''}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <StatusBadge status={m.status} isNonStandard={m.xlsx.isNonStandard} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary + Generate button */}
              {matchResults.length > 0 && !generating && generatedLabels.length === 0 && (
                <div style={{
                  padding: '16px 20px', borderRadius: '10px', background: '#e3f2fd',
                  border: '1px solid #90caf9',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>
                        {labelsToGenerate.length} etichette da generare
                      </div>
                      <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                        {matchResults.filter(m => m.status === 'has_label').length} hanno già un'etichetta (verranno sovrascritte) ·
                        {' '}{matchResults.filter(m => m.status === 'has_nutrition').length} con dati nutrizionali ·
                        {' '}{matchResults.filter(m => m.status === 'found').length} solo anagrafica ·
                        {' '}{matchResults.filter(m => m.status === 'not_found').length} non trovati (esclusi)
                        {matchResults.some(m => m.xlsx.isNonStandard) &&
                          ` · ${matchResults.filter(m => m.xlsx.isNonStandard).length} da verificare (non-standard)`
                        }
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateAll}
                      disabled={labelsToGenerate.length === 0}
                      style={{
                        padding: '10px 24px', borderRadius: '8px', border: 'none',
                        background: '#1565c0', color: '#fff', cursor: 'pointer',
                        fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >
                      Genera {labelsToGenerate.length} Etichette
                    </button>
                  </div>

                  {/* Detailed breakdown */}
                  <div style={{
                    display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap',
                  }}>
                    {[
                      { label: 'Già con etichetta', count: matchResults.filter(m => m.status === 'has_label').length, bg: '#e8f5e9', color: '#2e7d32' },
                      { label: 'Con dati nutrizionali', count: matchResults.filter(m => m.status === 'has_nutrition').length, bg: '#e3f2fd', color: '#1565c0' },
                      { label: 'Solo anagrafica', count: matchResults.filter(m => m.status === 'found').length, bg: '#fff3e0', color: '#e65100' },
                      { label: 'Non trovati', count: matchResults.filter(m => m.status === 'not_found').length, bg: '#ffebee', color: '#c62828' },
                    ].filter(s => s.count > 0).map(s => (
                      <div key={s.label} style={{
                        padding: '6px 12px', borderRadius: '6px', background: s.bg,
                        fontSize: '12px', fontWeight: 600, color: s.color,
                      }}>
                        {s.count} {s.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generating progress */}
              {generating && (
                <div style={{
                  padding: '20px', borderRadius: '10px', background: '#fff3e0',
                  border: '1px solid #ffcc02', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                    Generazione QR code in corso...
                  </div>
                  <div style={{
                    width: '100%', height: '8px', borderRadius: '4px', background: '#ffe0b2',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(progress.current / progress.total) * 100}%`,
                      height: '100%', background: '#f57c00', borderRadius: '4px',
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                    {progress.current} / {progress.total}
                  </div>
                </div>
              )}

              {/* Generated labels result */}
              {generatedLabels.length > 0 && (
                <div>
                  {/* Success banner */}
                  <div style={{
                    padding: '16px 20px', borderRadius: '10px', background: '#e8f5e9',
                    border: '1px solid #a5d6a7', marginBottom: '16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: '#2e7d32' }}>
                          ✅ {generatedLabels.length} QR code generati
                        </div>
                        {savedToArchive && (
                          <div style={{ fontSize: '12px', color: '#388e3c', marginTop: '4px' }}>
                            Salvate nell'archivio etichette (le etichette esistenti sono state sovrascritte).{' '}
                            <button
                              onClick={() => navigate('/archive')}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#1565c0', textDecoration: 'underline', padding: 0, fontSize: '12px',
                              }}
                            >
                              Vai all'archivio →
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleDownloadZip}
                        disabled={zipProgress.active}
                        style={{
                          padding: '10px 24px', borderRadius: '8px', border: '2px solid #2e7d32',
                          background: '#fff', cursor: zipProgress.active ? 'wait' : 'pointer',
                          fontSize: '14px', fontWeight: 600,
                          color: '#2e7d32', whiteSpace: 'nowrap',
                          opacity: zipProgress.active ? 0.7 : 1,
                        }}
                      >
                        {zipProgress.active
                          ? `⏳ Generazione PDF... ${zipProgress.current}/${zipProgress.total}`
                          : `📥 Scarica ZIP (${generatedLabels.length} etichette PDF)`
                        }
                      </button>
                    </div>
                  </div>

                  {/* QR grid preview */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '12px',
                  }}>
                    {generatedLabels.map(label => (
                      <div key={label.slug} style={{
                        border: '1px solid #e0e0e0', borderRadius: '8px', padding: '12px',
                        textAlign: 'center', background: '#fff',
                      }}>
                        <img src={label.qrDataUrl} alt={label.name}
                          style={{ width: '100px', height: '100px', marginBottom: '6px' }} />
                        <div style={{ fontSize: '11px', fontWeight: 600, lineHeight: '1.3' }}>
                          {label.name}
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', fontFamily: 'monospace' }}>
                          {label.code} · {label.sizeMl || '?'}ml
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ContainerLabels
