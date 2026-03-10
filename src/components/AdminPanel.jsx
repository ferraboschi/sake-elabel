import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { products as localProducts } from '../data/products'
import { getImportersForCountry, getAvailableCountries, addCustomImporter } from '../data/importers'
import { fetchProducts, updateProduct, isAirtableConfigured } from '../services/airtable'
import { useAuth } from '../contexts/AuthContext'
import { saveLabels } from '../services/labelStore'
import { downloadLabelPDF } from '../services/labelPrinter'
import { fetchShopifyProducts, isShopifyConfigured, matchProducts } from '../services/shopify'
import { analyzeBottleImage } from '../services/bottleAnalyzer'
import { useTranslation } from 'react-i18next'

const LANG_OPTIONS = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
]

const AdminPanel = () => {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState('local')
  const [refreshing, setRefreshing] = useState(false)

  // Step 1
  const [selectedSlugs, setSelectedSlugs] = useState(new Set())
  const [filterCategory, setFilterCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Step 2
  const [selectedLanguage, setSelectedLanguage] = useState('it')
  const [selectedCountry, setSelectedCountry] = useState('Italia')
  const [selectedImporterId, setSelectedImporterId] = useState('default-it')
  const [showAddImporter, setShowAddImporter] = useState(false)
  const [newImporterName, setNewImporterName] = useState('')
  const [newImporterAddress, setNewImporterAddress] = useState('')

  // Step 2.5 - Editing
  const [editingProduct, setEditingProduct] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  // Step 3
  const [qrCodes, setQrCodes] = useState({})
  const [generatedLabels, setGeneratedLabels] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Load products
  useEffect(() => {
    loadProducts()
  }, [])

  // When country changes, auto-select first importer for that country
  useEffect(() => {
    const importersForCountry = getImportersForCountry(selectedCountry)
    if (importersForCountry.length > 0) {
      setSelectedImporterId(importersForCountry[0].id)
    } else {
      setSelectedImporterId('')
    }
    setShowAddImporter(false)
  }, [selectedCountry])

  const loadProducts = async () => {
    setLoading(true)
    let products = []

    // 1. Load from Airtable (primary source)
    try {
      if (isAirtableConfigured()) {
        const airtableProducts = await fetchProducts()
        if (airtableProducts && airtableProducts.length > 0) {
          products = airtableProducts
          setDataSource('airtable')
        }
      }
    } catch (err) {
      console.warn('Airtable fetch failed:', err.message)
    }

    // 2. Fallback to local data
    if (products.length === 0) {
      products = Object.entries(localProducts).map(([slug, p]) => ({
        ...p, slug, _recordId: null
      }))
      setDataSource('local')
    }

    // 3. Enrich with Shopify data (photos, descriptions)
    try {
      if (isShopifyConfigured()) {
        const shopifyProducts = await fetchShopifyProducts()
        if (shopifyProducts.length > 0) {
          const matches = matchProducts(products, shopifyProducts)
          products = products.map(p => {
            const sp = matches[p.slug]
            if (!sp) return p
            return {
              ...p,
              photo: sp.photo || p.photo || null,
              shopifyImages: sp.images || [],
              shopifyDescription: sp.description || '',
              barcode: p.barcode || sp.barcode || '',
            }
          })
          console.log(`Shopify: matched ${Object.keys(matches).length}/${products.length} products`)
        }
      }
    } catch (err) {
      console.warn('Shopify enrichment failed:', err.message)
    }

    setAllProducts(products)
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadProducts()
    setRefreshing(false)
  }

  // Derived
  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort()

  const filteredProducts = allProducts.filter(p => {
    if (p.status === 'CANCELED') return false
    if (filterCategory && p.category !== filterCategory) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (p.name || '').toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.winery || '').toLowerCase().includes(q)
        || (p.nameJp || '').includes(q)
    }
    return true
  })

  const selectedProducts = allProducts.filter(p => selectedSlugs.has(p.slug))

  // Get currently selected importer object
  const importersForCountry = getImportersForCountry(selectedCountry)
  const importer = importersForCountry.find(i => i.id === selectedImporterId) || importersForCountry[0] || null
  const hasValidImporter = importer && importer.name

  // Readiness check — nutrition and ingredients required for e-label
  const getProductReadiness = (product, lang) => {
    const missing = []
    if (!product.nutrition?.energy_kj && product.nutrition?.energy_kj !== 0) missing.push('nutrition')
    if (!product.ingredients?.[lang]) missing.push(`ingredients_${lang}`)
    return { ready: missing.length === 0, missing }
  }

  const allSelectedReady = selectedProducts.length > 0
    && selectedProducts.every(p => getProductReadiness(p, selectedLanguage).ready)

  // Selection handlers
  const toggleProduct = (slug) => {
    const next = new Set(selectedSlugs)
    next.has(slug) ? next.delete(slug) : next.add(slug)
    setSelectedSlugs(next)
  }

  const toggleSelectAll = () => {
    if (selectedSlugs.size === filteredProducts.length) {
      setSelectedSlugs(new Set())
    } else {
      setSelectedSlugs(new Set(filteredProducts.map(p => p.slug)))
    }
  }

  // Add new importer
  const handleAddImporter = () => {
    if (!newImporterName.trim()) return
    const langMap = { Italia: 'it', Deutschland: 'de', France: 'fr', 'España': 'es', Japan: 'ja' }
    const codeMap = { Italia: 'IT', Deutschland: 'DE', France: 'FR', 'España': 'ES', Japan: 'JP' }
    const newImp = addCustomImporter({
      name: newImporterName.trim(),
      address: newImporterAddress.trim(),
      country: selectedCountry,
      lang: langMap[selectedCountry] || 'it',
      code: codeMap[selectedCountry] || 'IT',
    })
    setSelectedImporterId(newImp.id)
    setShowAddImporter(false)
    setNewImporterName('')
    setNewImporterAddress('')
  }

  // Inline editing
  const openEditor = (product) => {
    setEditingProduct(product)
    setEditForm({
      energyKj: product.nutrition?.energy_kj ?? '',
      energyKcal: product.nutrition?.energy_kcal ?? '',
      fatG: product.nutrition?.fat ?? '',
      saturatedFatG: product.nutrition?.saturated_fat ?? '',
      carbsG: product.nutrition?.carbs ?? '',
      sugarsG: product.nutrition?.sugars ?? '',
      proteinG: product.nutrition?.protein ?? '',
      saltG: product.nutrition?.salt ?? '',
      [`ingredients_${selectedLanguage}`]: product.ingredients?.[selectedLanguage] || '',
      [`allergens_${selectedLanguage}`]: product.allergens?.[selectedLanguage] || '',
      bottleMaterialCode: product.bottleMaterialCode || 'GL 72',
      capMaterialCode: product.capMaterialCode || 'C/ALU 90',
      bottleColor: product.bottleColor || 'Trasparente',
      capType: product.capType || 'Alluminio',
    })
  }

  const updateEditField = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  const saveProductData = async () => {
    if (!editingProduct) return
    setSaving(true)

    // Update local state
    const updatedProducts = allProducts.map(p => {
      if (p.slug !== editingProduct.slug) return p
      return {
        ...p,
        nutrition: {
          energy_kj: parseFloat(editForm.energyKj) || 0,
          energy_kcal: parseFloat(editForm.energyKcal) || 0,
          fat: parseFloat(editForm.fatG) || 0,
          saturated_fat: parseFloat(editForm.saturatedFatG) || 0,
          carbs: parseFloat(editForm.carbsG) || 0,
          sugars: parseFloat(editForm.sugarsG) || 0,
          protein: parseFloat(editForm.proteinG) || 0,
          salt: parseFloat(editForm.saltG) || 0,
        },
        ingredients: {
          ...p.ingredients,
          [selectedLanguage]: editForm[`ingredients_${selectedLanguage}`] || '',
        },
        allergens: {
          ...p.allergens,
          [selectedLanguage]: editForm[`allergens_${selectedLanguage}`] || '',
        },
        bottleMaterialCode: editForm.bottleMaterialCode,
        capMaterialCode: editForm.capMaterialCode,
        bottleColor: editForm.bottleColor,
        capType: editForm.capType,
      }
    })
    setAllProducts(updatedProducts)

    // Save to Airtable if connected
    if (isAirtableConfigured() && editingProduct._recordId) {
      try {
        const langMap = { it: 'It', de: 'De', fr: 'Fr', es: 'Es', ja: 'Jp' }
        const langSuffix = langMap[selectedLanguage] || 'It'
        await updateProduct(editingProduct._recordId, {
          energyKj: parseFloat(editForm.energyKj) || 0,
          energyKcal: parseFloat(editForm.energyKcal) || 0,
          fatG: parseFloat(editForm.fatG) || 0,
          saturatedFatG: parseFloat(editForm.saturatedFatG) || 0,
          carbsG: parseFloat(editForm.carbsG) || 0,
          sugarsG: parseFloat(editForm.sugarsG) || 0,
          proteinG: parseFloat(editForm.proteinG) || 0,
          saltG: parseFloat(editForm.saltG) || 0,
          [`ingredients${langSuffix}`]: editForm[`ingredients_${selectedLanguage}`] || '',
          [`allergens${langSuffix}`]: editForm[`allergens_${selectedLanguage}`] || '',
          bottleMaterialCode: editForm.bottleMaterialCode,
          capMaterialCode: editForm.capMaterialCode,
          bottleColor: editForm.bottleColor,
          capType: editForm.capType,
        })
      } catch (err) {
        console.error('Airtable save error:', err)
      }
    }

    setSaving(false)
    setEditingProduct(null)
  }

  // QR generation
  const generateQR = async (slug) => {
    const url = `https://label.sakecompany.com/${slug}?lang=${selectedLanguage}&country=${selectedCountry}`
    const canvas = await QRCode.toCanvas(document.createElement('canvas'), url, {
      width: 400, errorCorrectionLevel: 'H', margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
    return canvas.toDataURL('image/png')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const labels = []

    for (const product of selectedProducts) {
      try {
        const qr = await generateQR(product.slug)
        labels.push({
          ...product,
          qr,
          language: selectedLanguage,
          country: selectedCountry,
          importer,
          generatedAt: new Date().toISOString(),
        })
      } catch (err) {
        console.error(`QR failed for ${product.name}:`, err)
      }
    }

    // Save to archive
    const savedLabels = saveLabels(labels.map(l => ({ ...l, generatedBy: user?.username || 'unknown' })))
    console.log(`Saved ${savedLabels.length} labels to archive`)

    setGeneratedLabels(labels)
    setShowPreview(true)
    setGenerating(false)
  }

  const downloadQR = (label) => {
    const link = document.createElement('a')
    link.href = label.qr
    link.download = `qr-${label.code || label.slug}-${label.language}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAllQRs = async () => {
    for (const label of generatedLabels) {
      downloadQR(label)
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // =================== RENDER ===================

  if (loading) {
    return (
      <div className="admin-container">
        <div className="admin-header"><h1>Caricamento prodotti...</h1></div>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
          {isAirtableConfigured() ? 'Connessione ad Airtable...' : 'Caricamento dati locali...'}
        </div>
      </div>
    )
  }

  // Preview mode
  if (showPreview) {
    return (
      <div className="admin-container">
        <div className="admin-header">
          <button className="button button-secondary" onClick={() => setShowPreview(false)}>{t('back')}</button>
          <h1>{t('previewGeneratedLabels')}</h1>
        </div>

        <div className="preview-info">
          <p><strong>{t('language')}:</strong> {LANG_OPTIONS.find(l => l.code === selectedLanguage)?.label}</p>
          <p><strong>{t('country')}:</strong> {selectedCountry}</p>
          <p><strong>Etichette generate:</strong> {generatedLabels.length}</p>
        </div>

        <div className="preview-controls">
          <button className="button" onClick={downloadAllQRs}>
            {t('downloadAllQRCodes')} ({generatedLabels.length})
          </button>
          <button className="button button-secondary" onClick={() => navigate('/archive')}>
            Vai all'Archivio
          </button>
        </div>

        <div className="preview-grid">
          {generatedLabels.map(label => (
            <div key={label.slug} className="preview-card">
              <h3>{label.name}</h3>
              <p className="preview-subtitle">
                {label.winery}{label.wineryJp ? ` — ${label.wineryJp}` : ''}
              </p>
              <p style={{ fontSize: '12px', color: '#888' }}>
                {label.code} · {label.volumeMl}ml · {label.alcoholPct}%
              </p>
              <img src={label.qr} alt={`QR ${label.name}`} className="qr-preview-large" />
              <div className="preview-url">
                <code style={{ fontSize: '10px', wordBreak: 'break-all' }}>
                  label.sakecompany.com/{label.slug}
                </code>
              </div>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="button button-small" onClick={() => downloadQR(label)}>{t('download')} QR</button>
                <button className="button button-small button-secondary" onClick={() => downloadLabelPDF(label)}>PDF Etichetta</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Editor modal
  if (editingProduct) {
    const langLabel = LANG_OPTIONS.find(l => l.code === selectedLanguage)?.label || selectedLanguage
    return (
      <div className="admin-container">
        <div className="admin-header">
          <button className="button button-secondary" onClick={() => setEditingProduct(null)}>{'← '}{t('back')}</button>
          <h1>Completa dati: {editingProduct.name}</h1>
        </div>

        <div className="edit-form">
          <p style={{ color: '#666', marginBottom: '20px' }}>
            Compila i campi mancanti. I dati verranno salvati {dataSource === 'airtable' ? 'su Airtable' : 'nella sessione corrente'}.
          </p>

          <h3 className="edit-section-title">Valori nutrizionali (per 100ml)</h3>
          <div className="edit-grid">
            {[
              ['energyKj', 'Energia (kJ)', '280'],
              ['energyKcal', 'Energia (kcal)', '67'],
              ['fatG', 'Grassi (g)', '0'],
              ['saturatedFatG', 'Acidi grassi saturi (g)', '0'],
              ['carbsG', 'Carboidrati (g)', '2.5'],
              ['sugarsG', 'Zuccheri (g)', '1.0'],
              ['proteinG', 'Proteine (g)', '0.1'],
              ['saltG', 'Sale (g)', '0'],
            ].map(([key, label, placeholder]) => (
              <div key={key} className="edit-field">
                <label>{label}</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm[key] ?? ''}
                  onChange={e => updateEditField(key, e.target.value)}
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>

          <h3 className="edit-section-title">Ingredienti ({langLabel})</h3>
          <textarea
            className="edit-textarea"
            value={editForm[`ingredients_${selectedLanguage}`] || ''}
            onChange={e => updateEditField(`ingredients_${selectedLanguage}`, e.target.value)}
            placeholder="Es: Uva (Merlot, Yama Sauvignon), antiossidante: anidride solforosa"
            rows={3}
          />

          <h3 className="edit-section-title">Allergeni ({langLabel})</h3>
          <input
            type="text"
            className="edit-input-full"
            value={editForm[`allergens_${selectedLanguage}`] || ''}
            onChange={e => updateEditField(`allergens_${selectedLanguage}`, e.target.value)}
            placeholder="Es: solfiti (lasciare vuoto se nessuno)"
          />

          <h3 className="edit-section-title">
            Materiali bottiglia
            {editingProduct?.photo && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await analyzeBottleImage(editingProduct.photo)
                    if (result.bottleColor && result.confidence > 40) {
                      updateEditField('bottleColor', result.bottleColor)
                      updateEditField('bottleMaterialCode', result.materialCode)
                      alert(`Rilevato: ${result.bottleColor} (${result.materialCode}) — Confidenza: ${result.confidence}%`)
                    } else {
                      alert('Analisi inconclusiva. Seleziona manualmente.')
                    }
                  } catch { alert('Analisi immagine fallita.') }
                }}
                style={{
                  marginLeft: '12px', padding: '3px 10px', fontSize: '11px',
                  background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 'normal'
                }}
              >
                Auto-detect da foto
              </button>
            )}
          </h3>
          {editingProduct?.photo && (
            <div style={{ marginBottom: '12px' }}>
              <img src={editingProduct.photo} alt="Prodotto" style={{ maxHeight: '100px', borderRadius: '6px', border: '1px solid #eee' }} />
            </div>
          )}
          <div className="edit-grid">
            <div className="edit-field">
              <label>Colore bottiglia</label>
              <select value={editForm.bottleColor || ''} onChange={e => updateEditField('bottleColor', e.target.value)}>
                <option value="">-- Seleziona --</option>
                <option value="Trasparente">Trasparente</option>
                <option value="Verde">Verde</option>
                <option value="Marrone">Marrone</option>
                <option value="Nera">Nera</option>
                <option value="Blu">Blu</option>
              </select>
            </div>
            <div className="edit-field">
              <label>Codice materiale bottiglia</label>
              <select value={editForm.bottleMaterialCode || ''} onChange={e => updateEditField('bottleMaterialCode', e.target.value)}>
                <option value="">-- Seleziona --</option>
                <option value="GL 70">GL 70 — Vetro incolore</option>
                <option value="GL 71">GL 71 — Vetro verde</option>
                <option value="GL 72">GL 72 — Vetro marrone</option>
              </select>
            </div>
            <div className="edit-field">
              <label>Tipo tappo</label>
              <select value={editForm.capType || ''} onChange={e => updateEditField('capType', e.target.value)}>
                <option value="">-- Seleziona --</option>
                <option value="Alluminio">Alluminio</option>
                <option value="Sughero">Sughero</option>
                <option value="Plastica">Plastica</option>
                <option value="Twist-off">Twist-off</option>
              </select>
            </div>
            <div className="edit-field">
              <label>Codice materiale tappo</label>
              <select value={editForm.capMaterialCode || ''} onChange={e => updateEditField('capMaterialCode', e.target.value)}>
                <option value="">-- Seleziona --</option>
                <option value="C/ALU 90">C/ALU 90 — Alluminio</option>
                <option value="FOR 51">FOR 51 — Sughero</option>
                <option value="PVC 03">PVC 03 — Plastica PVC</option>
                <option value="FE 40">FE 40 — Acciaio</option>
              </select>
            </div>
          </div>

          <div className="edit-actions">
            <button className="button button-secondary" onClick={() => setEditingProduct(null)}>Annulla</button>
            <button className="button button-primary" onClick={saveProductData} disabled={saving}>
              {saving ? 'Salvataggio...' : 'Salva e chiudi'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main admin flow
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>{t('labelGenerationAdmin')}</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="button button-secondary button-small" onClick={() => navigate('/')}>
            Home
          </button>
          <button className="button button-secondary button-small" onClick={() => navigate('/archive')}>
            Archivio
          </button>
          <span style={{ fontSize: '12px', color: '#888' }}>{user?.name}</span>
          <button className="button button-secondary button-small" onClick={logout}>Esci</button>
        </div>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="data-source-badge" style={{
            padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
            background: dataSource === 'airtable' ? '#e8f5e9' : '#fff3e0',
            color: dataSource === 'airtable' ? '#2e7d32' : '#e65100'
          }}>
            {dataSource === 'airtable' ? '☁️ Airtable' : '📁 Dati locali'}
            {dataSource === 'airtable' && ` · ${allProducts.length} prodotti`}
          </div>
          <button
            className="button button-secondary button-small"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            {refreshing ? '⏳ Aggiornamento...' : '🔄 Aggiorna da Airtable'}
          </button>
        </div>
      </div>

      <div className="steps-container">

        {/* ========== STEP 1: Select Products ========== */}
        <div className={`step-section ${currentStep === 1 ? 'active' : ''}`}>
          <div className="step-header" onClick={() => setCurrentStep(1)} style={{ cursor: 'pointer' }}>
            <div className="step-number">1</div>
            <h2 className="step-title">{t('selectProducts')}</h2>
            {currentStep !== 1 && selectedSlugs.size > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '14px', color: '#666' }}>
                {selectedSlugs.size} selezionati
              </span>
            )}
          </div>

          {currentStep === 1 && (
            <div className="step-content">
              <div className="product-filter" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Cerca per nome, codice, cantina..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minWidth: '160px' }}>
                  <option value="">Tutte le categorie</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div className="product-controls" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="button button-secondary" onClick={toggleSelectAll} style={{ fontSize: '13px' }}>
                  {selectedSlugs.size === filteredProducts.length ? 'Deseleziona tutti' : `Seleziona tutti (${filteredProducts.length})`}
                </button>
                <span style={{ fontSize: '13px', color: '#888' }}>
                  {filteredProducts.length} prodotti{filterCategory ? ` in "${filterCategory}"` : ''}{searchQuery ? ` per "${searchQuery}"` : ''}
                </span>
              </div>

              <div className="products-list" style={{ maxHeight: '500px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                {filteredProducts.map(product => (
                  <div key={product.slug} className="product-list-item" style={{
                    display: 'flex', alignItems: 'center', padding: '10px 14px',
                    borderBottom: '1px solid #f0f0f0', gap: '12px',
                    cursor: 'pointer', background: selectedSlugs.has(product.slug) ? '#f0f7ff' : 'transparent'
                  }} onClick={() => toggleProduct(product.slug)}>
                    <input
                      type="checkbox"
                      checked={selectedSlugs.has(product.slug)}
                      onChange={() => toggleProduct(product.slug)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{product.name}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>
                        {product.code} · {product.winery} · {product.volumeMl}ml
                        {product.alcoholPct ? ` · ${product.alcoholPct}%` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: '#aaa', whiteSpace: 'nowrap' }}>{product.category}</span>
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                    Nessun prodotto trovato
                  </div>
                )}
              </div>

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  {selectedSlugs.size > 0 ? `${selectedSlugs.size} prodotti selezionati` : 'Seleziona almeno un prodotto'}
                </span>
                <button className="button button-primary" onClick={() => setCurrentStep(2)} disabled={selectedSlugs.size === 0}>
                  Continua →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========== STEP 2: Language, Country & Data Check ========== */}
        <div className={`step-section ${currentStep === 2 ? 'active' : ''}`}>
          <div className="step-header" onClick={() => currentStep > 2 && setCurrentStep(2)} style={{ cursor: currentStep > 2 ? 'pointer' : 'default' }}>
            <div className="step-number">2</div>
            <h2 className="step-title">Lingua, Importatore e Verifica Dati</h2>
          </div>

          {currentStep === 2 && (
            <div className="step-content">
              <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Lingua etichetta</label>
                  <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                    {LANG_OPTIONS.map(l => (
                      <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Paese destinazione</label>
                  <select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                    {getAvailableCountries().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Importer selection */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Importatore</label>
                {importersForCountry.length > 0 ? (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <select
                      value={selectedImporterId}
                      onChange={e => {
                        if (e.target.value === '__add_new__') {
                          setShowAddImporter(true)
                        } else {
                          setSelectedImporterId(e.target.value)
                          setShowAddImporter(false)
                        }
                      }}
                      style={{ flex: 1, minWidth: '250px', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                    >
                      {importersForCountry.map(imp => (
                        <option key={imp.id} value={imp.id}>
                          {imp.name}{imp.address ? ` — ${imp.address}` : ''}
                        </option>
                      ))}
                      <option value="__add_new__">+ Aggiungi nuovo importatore...</option>
                    </select>
                  </div>
                ) : (
                  <div style={{
                    padding: '14px 18px', borderRadius: '8px', marginBottom: '8px',
                    background: '#fff3e0', border: '1px solid #ffe0b2'
                  }}>
                    <div style={{ fontWeight: 600, color: '#e65100', marginBottom: '4px' }}>
                      ⚠️ Nessun importatore per {selectedCountry}
                    </div>
                    <button className="button button-small" onClick={() => setShowAddImporter(true)}
                      style={{ marginTop: '6px', fontSize: '13px' }}>
                      + Aggiungi importatore
                    </button>
                  </div>
                )}

                {/* Importer details card */}
                {hasValidImporter && !showAddImporter && (
                  <div style={{
                    padding: '10px 14px', borderRadius: '6px', marginTop: '8px',
                    background: '#e8f5e9', border: '1px solid #c8e6c9', fontSize: '13px'
                  }}>
                    <strong>✅ {importer.name}</strong>
                    {importer.address && <span style={{ color: '#555' }}> — {importer.address}</span>}
                  </div>
                )}

                {/* Add new importer form */}
                {showAddImporter && (
                  <div style={{
                    padding: '16px', borderRadius: '8px', marginTop: '10px',
                    background: '#f5f5f5', border: '1px solid #e0e0e0'
                  }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>Nuovo importatore per {selectedCountry}</h4>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Nome azienda *</label>
                        <input
                          type="text"
                          value={newImporterName}
                          onChange={e => setNewImporterName(e.target.value)}
                          placeholder="Es: Sake Company srl"
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Indirizzo</label>
                        <input
                          type="text"
                          value={newImporterAddress}
                          onChange={e => setNewImporterAddress(e.target.value)}
                          placeholder="Es: Via Bianca di Savoia 17, Milano"
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="button button-primary button-small" onClick={handleAddImporter}
                        disabled={!newImporterName.trim()}>
                        Salva importatore
                      </button>
                      <button className="button button-secondary button-small" onClick={() => setShowAddImporter(false)}>
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Product readiness table */}
              <h3 style={{ marginBottom: '12px' }}>Verifica completezza dati</h3>
              <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Prodotto</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', width: '70px' }}>Nutrizione</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', width: '80px' }}>Ingredienti</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', width: '60px' }}>Stato</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', width: '70px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map(product => {
                      const { ready, missing } = getProductReadiness(product, selectedLanguage)
                      const hasNutrition = !missing.includes('nutrition')
                      const hasIngredients = !missing.includes(`ingredients_${selectedLanguage}`)
                      return (
                        <tr key={product.slug} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 500 }}>{product.name}</div>
                            <div style={{ fontSize: '11px', color: '#999' }}>{product.code}</div>
                          </td>
                          <td style={{ textAlign: 'center' }}>{hasNutrition ? '✅' : '❌'}</td>
                          <td style={{ textAlign: 'center' }}>{hasIngredients ? '✅' : '❌'}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                              background: ready ? '#e8f5e9' : '#fff3e0', color: ready ? '#2e7d32' : '#e65100'
                            }}>
                              {ready ? 'OK' : 'Incompleto'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!ready && (
                              <button onClick={() => openEditor(product)}
                                style={{
                                  padding: '4px 10px', fontSize: '12px', border: '1px solid #1976d2',
                                  background: '#e3f2fd', color: '#1976d2', borderRadius: '4px', cursor: 'pointer'
                                }}>
                                Compila
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                <button className="button button-secondary" onClick={() => setCurrentStep(1)}>← Indietro</button>
                <button className="button button-primary" onClick={() => setCurrentStep(3)}
                  disabled={!hasValidImporter}>
                  Continua →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========== STEP 3: Generate ========== */}
        <div className={`step-section ${currentStep === 3 ? 'active' : ''}`}>
          <div className="step-header">
            <div className="step-number">3</div>
            <h2 className="step-title">{t('generateLabels')}</h2>
          </div>

          {currentStep === 3 && (
            <div className="step-content">
              <div style={{
                background: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px'
              }}>
                <h3 style={{ marginBottom: '12px' }}>Riepilogo generazione</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
                  <div><strong>Prodotti:</strong> {selectedProducts.length}</div>
                  <div><strong>Lingua:</strong> {LANG_OPTIONS.find(l => l.code === selectedLanguage)?.label}</div>
                  <div><strong>Paese:</strong> {selectedCountry}</div>
                  <div><strong>Importatore:</strong> {importer?.name || 'N/D'}</div>
                </div>
              </div>

              {!allSelectedReady && (
                <div style={{
                  background: '#fff3e0', border: '1px solid #ffe0b2', padding: '14px 18px',
                  borderRadius: '8px', marginBottom: '20px'
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '8px', color: '#e65100' }}>
                    ⚠️ Alcuni prodotti hanno dati mancanti
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                    {selectedProducts
                      .filter(p => !getProductReadiness(p, selectedLanguage).ready)
                      .map(p => (
                        <li key={p.slug}>
                          <strong>{p.name}</strong>: mancano {getProductReadiness(p, selectedLanguage).missing.join(', ')}
                          {' '}<a href="#" onClick={e => { e.preventDefault(); openEditor(p) }}
                            style={{ color: '#1976d2' }}>Compila</a>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="button button-secondary" onClick={() => setCurrentStep(2)}>← Indietro</button>
                <button className="button button-primary" onClick={handleGenerate}
                  disabled={!allSelectedReady || !hasValidImporter || generating}
                  style={{ minWidth: '200px' }}>
                  {generating ? 'Generazione in corso...' : `Genera ${selectedProducts.length} etichette`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
