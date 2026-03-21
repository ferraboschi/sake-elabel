import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { products as localProducts } from '../data/products'
import { getImportersForRegion, addCustomImporter, updateCustomImporter, removeCustomImporter, REGION_CODE_LABELS, REGION_CODE_TO_IMPORTER_COUNTRY } from '../data/importers'
import { fetchProducts, updateProduct, isAirtableConfigured, composePackagingMaterials } from '../services/airtable'
import { useAuth } from '../contexts/AuthContext'
import { saveLabels, getLabels } from '../services/labelStore'
import { downloadLabelPDF, downloadBoxLabelPDF, downloadBothLabelsPDF } from '../services/labelPrinter'
import { fetchShopifyProducts, isShopifyConfigured, matchProducts } from '../services/shopify'
import { analyzeBottleImage } from '../services/bottleAnalyzer'
import { translateIngredients } from '../services/ingredientTranslator'
import { saveSnapshot, batchCheckReprint } from '../services/printSnapshot'
import { detectDetailedCategory, getDefaultLegalDescription, getDefaultIngredients } from '../services/categoryDetector'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import shopifyPhotos from '../data/shopifyPhotos.json'

/**
 * Estimate how many lines a title would need on the PDF label.
 * Label: 55mm wide, 2.5mm margins, 6.1mm pittogramma → max ~41.9mm for title.
 * 8pt Helvetica Bold: average char width ≈ 1.85mm for uppercase.
 * This is an approximation — actual jsPDF rendering may differ slightly.
 */
function estimateTitleLines(title) {
  if (!title) return 0
  const upper = title.toUpperCase()
  const maxWidthMm = 41.9  // CW (50mm) - pittoSize (6.1mm) - gap (2mm)
  // Approximate character widths for 8pt Helvetica Bold uppercase (mm)
  // Narrow chars: I, J, 1 ≈ 1.0mm; Wide chars: M, W ≈ 3.0mm; Average ≈ 1.85mm; Space ≈ 1.1mm
  let totalWidth = 0
  let lines = 1
  let lineStart = 0
  const words = upper.split(/\s+/)
  let currentLineWidth = 0

  for (let i = 0; i < words.length; i++) {
    let wordWidth = 0
    for (const ch of words[i]) {
      if ('MWmw'.includes(ch)) wordWidth += 2.9
      else if ('IIJL1l|!'.includes(ch)) wordWidth += 1.1
      else if ('ABCDEFGHKNOPQRSTUVXYZ'.includes(ch)) wordWidth += 2.0
      else wordWidth += 1.85
    }
    const spaceWidth = i > 0 ? 1.1 : 0
    if (currentLineWidth + spaceWidth + wordWidth > maxWidthMm && currentLineWidth > 0) {
      lines++
      currentLineWidth = wordWidth
    } else {
      currentLineWidth += spaceWidth + wordWidth
    }
  }
  return lines
}

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
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState('local')
  const [refreshing, setRefreshing] = useState(false)

  // 2-Mode UX: null = list mode, string (slug) = edit mode for that product
  const [editingSlug, setEditingSlug] = useState(null)

  // List mode filters
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLabelStatus, setFilterLabelStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [reprintSlugs, setReprintSlugs] = useState(new Set())  // For batch reprint selection

  // Top bar selectors (always visible)
  const [selectedLanguage, setSelectedLanguage] = useState('it')
  const [selectedRegion, setSelectedRegion] = useState('ITA')   // region code from Airtable
  const [selectedImporterId, setSelectedImporterId] = useState('default-it')
  const [showAddImporter, setShowAddImporter] = useState(false)
  const [editingImporterId, setEditingImporterId] = useState(null)
  const [importerVersion, setImporterVersion] = useState(0)  // bump to force re-read from localStorage
  const [newImporterName, setNewImporterName] = useState('')
  const [newImporterAddress, setNewImporterAddress] = useState('')

  // Product editor modal (for detailed editing)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [savingMaterials, setSavingMaterials] = useState(false)
  const [materialsSaved, setMaterialsSaved] = useState(false)
  const [savingNutrition, setSavingNutrition] = useState(false)
  const [nutritionSaved, setNutritionSaved] = useState(false)
  const [savingIngredients, setSavingIngredients] = useState(false)
  const [ingredientsSaved, setIngredientsSaved] = useState(false)

  // Track confirmations per product slug: { slug: { nutrition: true, ingredients: true, materials: true } }
  const [confirmedFlags, setConfirmedFlags] = useState({})

  // EAN inline editing in step 1
  const [eanEdits, setEanEdits] = useState({})       // { recordId: 'value' }
  const [eanSaving, setEanSaving] = useState({})      // { recordId: true }
  const [eanSaved, setEanSaved] = useState({})         // { recordId: true }

  // Step 3 — Review & Generate
  const [qrCodes, setQrCodes] = useState({})
  const [generatedLabels, setGeneratedLabels] = useState([])
  const [showPreview, setShowPreview] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Pre-print review edits: { slug: { legalDescription, ingredients, allergens, ... } }
  const [reviewEdits, setReviewEdits] = useState({})

  // Sibling products prompt (same name, different sizes)
  const [siblingPrompt, setSiblingPrompt] = useState({ groups: [], show: false })

  // Reprint tracking: { productCode: { needsReprint, printedAt } }
  const [reprintStatus, setReprintStatus] = useState({})

  // Force Italian UI in admin panel (label language is separate)
  useEffect(() => {
    if (i18n.language !== 'it') {
      i18n.changeLanguage('it')
    }
  }, [])

  // Load products
  useEffect(() => {
    loadProducts()
  }, [])

  // When region changes, auto-select first importer AND matching language
  useEffect(() => {
    const regionInfo = REGION_CODE_LABELS[selectedRegion]
    if (regionInfo?.lang && LANG_OPTIONS.some(l => l.code === regionInfo.lang)) {
      setSelectedLanguage(regionInfo.lang)
    }
    const importersForRegion = getImportersForRegion(selectedRegion)
    if (importersForRegion.length > 0) {
      setSelectedImporterId(importersForRegion[0].id)
    } else {
      setSelectedImporterId('')
    }
    setShowAddImporter(false)
    setEditingImporterId(null)
  }, [selectedRegion])

  // When editing mode changes, auto-select first allowed region if current is not allowed
  useEffect(() => {
    if (editingSlug) {
      const product = allProducts.find(p => p.slug === editingSlug)
      if (product && product.salesRegion && product.salesRegion.length > 0) {
        if (!product.salesRegion.includes(selectedRegion)) {
          setSelectedRegion(product.salesRegion[0])
        }
      }
    }
  }, [editingSlug, allProducts])

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
    let shopifyMatched = 0
    try {
      if (isShopifyConfigured()) {
        const shopifyProducts = await fetchShopifyProducts()
        if (shopifyProducts.length > 0) {
          const matches = matchProducts(products, shopifyProducts)
          shopifyMatched = Object.keys(matches).length
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
          console.log(`Shopify API: matched ${shopifyMatched}/${products.length} products`)
        }
      }
    } catch (err) {
      console.warn('Shopify API enrichment failed:', err.message)
    }

    // 4. Fallback: use static Shopify photo mapping for products without photos
    //    Also enrich ALL products with shopifyType from the static mapping
    let staticMatched = 0
    products = products.map(p => {
      const codeKey = (p.code || '').toUpperCase()
      const barcodeKey = p.barcode || ''
      const match = (codeKey && shopifyPhotos[codeKey]) || (barcodeKey && shopifyPhotos[barcodeKey])
      if (match) {
        const enriched = { ...p, shopifyType: match.product_type || p.shopifyType || '' }
        if (!p.photo && match.photo) {
          staticMatched++
          enriched.photo = match.photo
        }
        return enriched
      }
      return p
    })
    if (staticMatched > 0) {
      console.log(`Static photo map: matched ${staticMatched} additional products`)
    }

    setAllProducts(products)
    setLoading(false)

    // Check reprint status in background
    batchCheckReprint(products).then(status => {
      setReprintStatus(status)
      const needsReprint = Object.values(status).filter(s => s.needsReprint).length
      if (needsReprint > 0) console.log(`[Reprint] ${needsReprint} products need reprinting`)
    }).catch(err => console.warn('[Reprint] Check failed:', err.message))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadProducts()
    setRefreshing(false)
  }

  // Derived: existing labels from localStorage
  const existingLabels = getLabels()
  const labelsMap = {} // slug -> array of labels
  existingLabels.forEach(l => {
    const key = l.productSlug || ''
    if (!labelsMap[key]) labelsMap[key] = []
    labelsMap[key].push(l)
  })
  const hasExistingLabel = (slug) => !!(labelsMap[slug] && labelsMap[slug].length > 0)

  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort()

  const filteredProducts = allProducts.filter(p => {
    // Hide empty/incomplete products (no name = not a real product)
    if (!p.name || !p.name.trim()) return false
    if (p.status === 'CANCELED') return false
    if (filterCategory && p.category !== filterCategory) return false
    // Label status filter
    if (filterLabelStatus === 'with-label' && !hasExistingLabel(p.slug)) return false
    if (filterLabelStatus === 'without-label' && hasExistingLabel(p.slug)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (p.name || '').toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.winery || '').toLowerCase().includes(q)
        || (p.nameJp || '').includes(q)
    }
    return true
  })

  // When in edit mode, get the product being edited
  const editingProduct_Current = editingSlug ? allProducts.find(p => p.slug === editingSlug) : null

  // Compute allowed region codes based on editing context
  const allowedRegionCodes = (() => {
    if (editingProduct_Current) {
      // Edit mode: use the product's sales regions
      return (editingProduct_Current.salesRegion && editingProduct_Current.salesRegion.length > 0)
        ? editingProduct_Current.salesRegion
        : []
    }
    // List mode: all regions available
    return Object.keys(REGION_CODE_LABELS)
  })()

  // Get importers for currently selected region (importerVersion triggers re-read)
  const importersForRegion = (() => { void importerVersion; return getImportersForRegion(selectedRegion) })()
  const importer = importersForRegion.find(i => i.id === selectedImporterId) || importersForRegion[0] || null
  const hasValidImporter = importer && importer.name
  const selectedCountry = REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion

  // Readiness check — ingredients required for physical label; nutrition is optional (e-label only)
  const getProductReadiness = (product, lang) => {
    const missing = []
    if (!product.ingredients?.[lang]) missing.push('Ingredienti')
    return { ready: missing.length === 0, missing }
  }

  // Check readiness for single product being edited or reprintable products
  const getEditingReadiness = (product) => {
    const missing = []
    if (!product.ingredients?.[selectedLanguage]) missing.push('Ingredienti')
    return { ready: missing.length === 0, missing }
  }

  const reprintableProducts = filteredProducts.filter(p => labelsMap[p.slug]?.length > 0)

  // Find sibling products (same name, different sizes)
  const findSiblingProducts = (product) => {
    return allProducts.filter(p =>
      p.name === product.name &&
      p.slug !== product.slug &&
      p.volumeMl
    )
  }

  // EAN inline save to Airtable
  const saveEan = async (product) => {
    const recordId = product._recordId
    const eanVal = eanEdits[recordId]
    if (eanVal === undefined || !recordId) return
    if (eanVal && eanVal.length !== 13) return // only save valid 13-digit EAN

    setEanSaving(prev => ({ ...prev, [recordId]: true }))
    try {
      await updateProduct(recordId, { ean: eanVal ? parseInt(eanVal, 10) : 0 })
      // Update local state
      setAllProducts(prev => prev.map(p =>
        p._recordId === recordId ? { ...p, barcode: eanVal } : p
      ))
      setEanSaved(prev => ({ ...prev, [recordId]: true }))
      setTimeout(() => setEanSaved(prev => ({ ...prev, [recordId]: false })), 3000)
    } catch (err) {
      console.error('EAN save error:', err)
      alert(`Errore salvataggio EAN: ${err.message}`)
    } finally {
      setEanSaving(prev => ({ ...prev, [recordId]: false }))
    }
  }

  // Selection handlers
  const toggleReprintCheckbox = (slug) => {
    const next = new Set(reprintSlugs)
    next.has(slug) ? next.delete(slug) : next.add(slug)
    setReprintSlugs(next)
  }

  const toggleSelectAllReprints = () => {
    const reprintableProducts = filteredProducts.filter(p => labelsMap[p.slug]?.length > 0)
    if (reprintSlugs.size === reprintableProducts.length) {
      setReprintSlugs(new Set())
    } else {
      setReprintSlugs(new Set(reprintableProducts.map(p => p.slug)))
    }
  }

  // Add new importer
  const handleAddImporter = () => {
    if (!newImporterName.trim()) return
    const regionInfo = REGION_CODE_LABELS[selectedRegion] || { label: selectedRegion, lang: 'it' }
    const importerCountry = REGION_CODE_TO_IMPORTER_COUNTRY[selectedRegion] || selectedCountry
    const codeMap = { Italia: 'IT', Deutschland: 'DE', France: 'FR', 'España': 'ES', Japan: 'JP' }
    const newImp = addCustomImporter({
      name: newImporterName.trim(),
      address: newImporterAddress.trim(),
      country: importerCountry,
      regionCode: selectedRegion,
      lang: regionInfo.lang || 'it',
      code: codeMap[importerCountry] || 'IT',
    })
    setSelectedImporterId(newImp.id)
    setShowAddImporter(false)
    setNewImporterName('')
    setNewImporterAddress('')
    setImporterVersion(v => v + 1)
  }

  // Inline editing
  // Pre-set ingredients based on sake category
  const getDefaultIngredients = (category, lang) => {
    const junmaiTypes = ['Junmai', 'Junmai Ginjo', 'Junmai Daiginjo', 'Tokubetsu Junmai']
    const isJunmai = junmaiTypes.some(t => (category || '').toLowerCase().includes(t.toLowerCase()))
    const ingredientsByLang = {
      it: isJunmai ? 'Riso, riso maltato (koji), acqua' : 'Riso, riso maltato (koji), alcol, acqua',
      de: isJunmai ? 'Reis, Malzreis (Koji), Wasser' : 'Reis, Malzreis (Koji), Alkohol, Wasser',
      fr: isJunmai ? 'Riz, riz malté (koji), eau' : 'Riz, riz malté (koji), alcool, eau',
      es: isJunmai ? 'Arroz, arroz malteado (koji), agua' : 'Arroz, arroz malteado (koji), alcohol, agua',
      ja: isJunmai ? '米、米麹、水' : '米、米麹、醸造アルコール、水',
    }
    return ingredientsByLang[lang] || ingredientsByLang['it']
  }

  const openEditor = (product) => {
    setEditingProduct(product)
    setNutritionSaved(false)
    setIngredientsSaved(false)
    setMaterialsSaved(false)

    // Pre-fill ingredients if empty, using detected category for accuracy
    const detCat = detectDetailedCategory(product.name, product.category || '', product.shopifyType || '')
    const currentIngredients = product.ingredients?.[selectedLanguage] || ''
    const presetIngredients = currentIngredients || getDefaultIngredients(detCat, selectedLanguage)

    const initialForm = {
      labelTitle: product.labelTitle || product.name || '',
      alcoholPct: product.alcoholPct ?? '',
      energyKj: product.nutrition?.energy_kj ?? '',
      energyKcal: product.nutrition?.energy_kcal ?? '',
      fatG: product.nutrition?.fat ?? '',
      saturatedFatG: product.nutrition?.saturated_fat ?? '',
      carbsG: product.nutrition?.carbs ?? '',
      sugarsG: product.nutrition?.sugars ?? '',
      proteinG: product.nutrition?.protein ?? '',
      saltG: product.nutrition?.salt ?? '',
      [`ingredients_${selectedLanguage}`]: presetIngredients,
      [`allergens_${selectedLanguage}`]: product.allergens?.[selectedLanguage] || '',
      bottleMaterialCode: product.bottleMaterialCode || 'GL 72',
      capMaterialCode: product.capMaterialCode || 'C/ALU 90',
      bottleColor: product.bottleColor || 'Trasparente',
      capType: product.capType || 'Alluminio',
    }
    setEditForm(initialForm)

    // Auto-detect bottle color from photo
    if (product.photo && !product.bottleColor) {
      analyzeBottleImage(product.photo).then(result => {
        if (result.bottleColor && result.confidence > 40) {
          setEditForm(prev => ({
            ...prev,
            bottleColor: result.bottleColor,
            bottleMaterialCode: result.materialCode,
          }))
        }
      }).catch(() => {})
    }
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
        labelTitle: editForm.labelTitle || p.name,
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
          packagingMaterials: composePackagingMaterials(
            editForm.bottleColor,
            editForm.bottleMaterialCode,
            editForm.capType,
            editForm.capMaterialCode
          ),
        })
      } catch (err) {
        console.error('Airtable save error:', err)
      }
    }

    setSaving(false)
    setEditingProduct(null)
  }

  const saveMaterialsOnly = async () => {
    if (!editingProduct) return
    setSavingMaterials(true)
    setMaterialsSaved(false)

    // Update local state (materials only)
    const updatedProducts = allProducts.map(p => {
      if (p.slug !== editingProduct.slug) return p
      return {
        ...p,
        bottleMaterialCode: editForm.bottleMaterialCode,
        capMaterialCode: editForm.capMaterialCode,
        bottleColor: editForm.bottleColor,
        capType: editForm.capType,
      }
    })
    setAllProducts(updatedProducts)

    // Update editingProduct too
    setEditingProduct(prev => ({
      ...prev,
      bottleMaterialCode: editForm.bottleMaterialCode,
      capMaterialCode: editForm.capMaterialCode,
      bottleColor: editForm.bottleColor,
      capType: editForm.capType,
    }))

    // Save to Airtable if connected — compose packagingMaterials string
    if (isAirtableConfigured() && editingProduct._recordId) {
      try {
        const packagingStr = composePackagingMaterials(
          editForm.bottleColor,
          editForm.bottleMaterialCode,
          editForm.capType,
          editForm.capMaterialCode
        )
        await updateProduct(editingProduct._recordId, {
          packagingMaterials: packagingStr,
        })
      } catch (err) {
        console.error('Airtable save materials error:', err)
      }
    }

    setSavingMaterials(false)
    setMaterialsSaved(true)
    setConfirmedFlags(prev => ({ ...prev, [editingProduct.slug]: { ...prev[editingProduct.slug], materials: true } }))
    setTimeout(() => setMaterialsSaved(false), 3000)
  }

  const saveNutritionOnly = async () => {
    if (!editingProduct) return
    setSavingNutrition(true)
    setNutritionSaved(false)

    const nutritionData = {
      energy_kj: parseFloat(editForm.energyKj) || 0,
      energy_kcal: parseFloat(editForm.energyKcal) || 0,
      fat: parseFloat(editForm.fatG) || 0,
      saturated_fat: parseFloat(editForm.saturatedFatG) || 0,
      carbs: parseFloat(editForm.carbsG) || 0,
      sugars: parseFloat(editForm.sugarsG) || 0,
      protein: parseFloat(editForm.proteinG) || 0,
      salt: parseFloat(editForm.saltG) || 0,
    }

    const updatedProducts = allProducts.map(p => {
      if (p.slug !== editingProduct.slug) return p
      return { ...p, nutrition: nutritionData }
    })
    setAllProducts(updatedProducts)
    setEditingProduct(prev => ({ ...prev, nutrition: nutritionData }))

    if (isAirtableConfigured() && editingProduct._recordId) {
      try {
        await updateProduct(editingProduct._recordId, {
          energyKj: nutritionData.energy_kj,
          energyKcal: nutritionData.energy_kcal,
          fatG: nutritionData.fat,
          saturatedFatG: nutritionData.saturated_fat,
          carbsG: nutritionData.carbs,
          sugarsG: nutritionData.sugars,
          proteinG: nutritionData.protein,
          saltG: nutritionData.salt,
        })
      } catch (err) {
        console.error('Airtable save nutrition error:', err)
      }
    }

    setSavingNutrition(false)
    setNutritionSaved(true)
    setConfirmedFlags(prev => ({ ...prev, [editingProduct.slug]: { ...prev[editingProduct.slug], nutrition: true } }))
    setTimeout(() => setNutritionSaved(false), 3000)
  }

  const saveIngredientsOnly = async () => {
    if (!editingProduct) return
    setSavingIngredients(true)
    setIngredientsSaved(false)

    const ingredientsValue = editForm[`ingredients_${selectedLanguage}`] || ''
    const allergensValue = editForm[`allergens_${selectedLanguage}`] || ''
    const alcoholValue = editForm.alcoholPct !== '' ? parseFloat(editForm.alcoholPct) : null

    // Auto-translate ingredients and allergens to all other languages
    const allLangs = ['it', 'en', 'de', 'fr', 'es', 'ja']
    const translatedIngredients = { ...editingProduct.ingredients, [selectedLanguage]: ingredientsValue }
    const translatedAllergens = { ...editingProduct.allergens, [selectedLanguage]: allergensValue }
    if (ingredientsValue) {
      for (const lang of allLangs) {
        if (lang === selectedLanguage) continue
        if (translatedIngredients[lang]?.trim()) continue // don't overwrite existing
        const { text } = translateIngredients(ingredientsValue, lang)
        if (text) translatedIngredients[lang] = text
      }
    }
    if (allergensValue) {
      for (const lang of allLangs) {
        if (lang === selectedLanguage) continue
        if (translatedAllergens[lang]?.trim()) continue
        const { text } = translateIngredients(allergensValue, lang)
        if (text) translatedAllergens[lang] = text
      }
    }

    const updatedProducts = allProducts.map(p => {
      if (p.slug !== editingProduct.slug) return p
      return {
        ...p,
        ingredients: translatedIngredients,
        allergens: translatedAllergens,
        alcoholPct: alcoholValue !== null ? alcoholValue : p.alcoholPct,
      }
    })
    setAllProducts(updatedProducts)
    setEditingProduct(prev => ({
      ...prev,
      ingredients: translatedIngredients,
      allergens: translatedAllergens,
      alcoholPct: alcoholValue !== null ? alcoholValue : prev.alcoholPct,
    }))

    if (isAirtableConfigured() && editingProduct._recordId) {
      try {
        // Save all translated languages to Airtable
        const langMap = { it: 'It', en: 'En', de: 'De', fr: 'Fr', es: 'Es' }
        const payload = {}
        for (const [lang, suffix] of Object.entries(langMap)) {
          if (translatedIngredients[lang]) payload[`ingredients${suffix}`] = translatedIngredients[lang]
          if (translatedAllergens[lang]) payload[`allergens${suffix}`] = translatedAllergens[lang]
        }
        // Save alcohol as decimal for Airtable (15.5% → 0.155)
        if (alcoholValue !== null && !isNaN(alcoholValue)) {
          payload.alcoholPct = alcoholValue <= 1 ? alcoholValue : alcoholValue / 100
        }
        await updateProduct(editingProduct._recordId, payload)
        console.log(`[Ingredients] Auto-translated and saved to ${Object.keys(langMap).length} languages`)
      } catch (err) {
        console.error('Airtable save ingredients error:', err)
      }
    }

    setSavingIngredients(false)
    setIngredientsSaved(true)
    setConfirmedFlags(prev => ({ ...prev, [editingProduct.slug]: { ...prev[editingProduct.slug], ingredients: true } }))
    setTimeout(() => setIngredientsSaved(false), 3000)
  }

  // QR generation
  // Initialize review data for single product in edit mode
  const initReviewDataForProduct = (product) => {
    if (!product) return
    const detCat = detectDetailedCategory(product.name, product.category || '', product.shopifyType || '')
    const existingIngredients = product.ingredients?.[selectedLanguage] || product.ingredients?.it || ''
    setReviewEdits({
      [product.slug]: {
        category: detCat || product.category || '',
        labelTitle: product.labelTitle || product.name || '',
        legalDescription: product.legalDescription || getDefaultLegalDescription(detCat, selectedLanguage),
        ingredients: existingIngredients || getDefaultIngredients(detCat, selectedLanguage),
        allergens: product.allergens?.[selectedLanguage] || product.allergens?.it || '',
        alcoholPct: product.alcoholPct || '',
        volumeMl: product.volumeMl || '',
        countryOfOrigin: product.countryOfOrigin || 'Giappone',
        eanBox: product.barcodeBox || '',
      }
    })
  }

  // Initialize review data when entering edit mode
  useEffect(() => {
    if (editingSlug && editingProduct_Current) {
      initReviewDataForProduct(editingProduct_Current)
    } else {
      setReviewEdits({})
    }
  }, [editingSlug, editingProduct_Current, selectedLanguage])

  // Update a single review field
  const updateReviewField = (slug, field, value) => {
    setReviewEdits(prev => ({
      ...prev,
      [slug]: { ...prev[slug], [field]: value }
    }))
  }

  const generateQR = async (slug) => {
    const url = `https://label.sakecompany.com/${slug}?lang=${selectedLanguage}&country=${selectedCountry}`
    const canvas = await QRCode.toCanvas(document.createElement('canvas'), url, {
      width: 400, errorCorrectionLevel: 'H', margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
    return canvas.toDataURL('image/png')
  }

  // Generate for single product in edit mode (no confirmation needed)
  const handleGenerateEditMode = async () => {
    if (!editingProduct_Current) return
    handleGenerate([editingProduct_Current])
  }

  // Generate for batch reprint
  const handleGenerateReprint = async () => {
    if (reprintSlugs.size === 0) return
    const selectedProducts = allProducts.filter(p => reprintSlugs.has(p.slug))
    const n = selectedProducts.length
    handleGenerate(selectedProducts)
  }

  const handleGenerate = async (productsToGenerate) => {
    setGenerating(true)
    const labels = []

    for (const product of productsToGenerate) {
      try {
        const qr = await generateQR(product.slug)
        // Use review edits if available (from Step 3 pre-print review)
        const re = reviewEdits[product.slug] || {}
        const detailedCategory = re.category || detectDetailedCategory(
          product.name, product.category || '', product.shopifyType || ''
        )
        const legalDesc = re.legalDescription
          || product.legalDescription
          || getDefaultLegalDescription(detailedCategory, selectedLanguage)
        // Override ingredients/allergens/origin from review edits
        const ingOverride = re.ingredients ? { ...product.ingredients, [selectedLanguage]: re.ingredients } : product.ingredients
        const algOverride = re.allergens !== undefined ? { ...product.allergens, [selectedLanguage]: re.allergens } : product.allergens
        const label = {
          ...product,
          category: detailedCategory || product.category,
          legalDescription: legalDesc,
          alcoholPct: re.alcoholPct ? parseFloat(re.alcoholPct) : product.alcoholPct,
          volumeMl: re.volumeMl ? parseInt(re.volumeMl) : product.volumeMl,
          countryOfOrigin: re.countryOfOrigin || product.countryOfOrigin,
          barcodeBox: re.eanBox || product.barcodeBox || '',
          ingredients: ingOverride,
          allergens: algOverride,
          qr,
          language: selectedLanguage,
          country: selectedCountry,
          importer,
          generatedAt: new Date().toISOString(),
        }
        labels.push(label)
      } catch (err) {
        console.error(`QR failed for ${product.name}:`, err)
      }
    }

    // Save to archive
    const savedLabels = saveLabels(labels.map(l => ({ ...l, generatedBy: user?.username || 'unknown' })))
    console.log(`Saved ${savedLabels.length} labels to archive`)

    // Download PDFs directly
    for (const label of labels) {
      try {
        await downloadLabelPDF(label)
        await new Promise(r => setTimeout(r, 200)) // Small delay between downloads
        // Save snapshot for reprint detection
        saveSnapshot(label, selectedLanguage).catch(err => console.warn('[Snapshot] Save error:', err.message))
        if (label.barcodeBox) {
          await downloadBoxLabelPDF(label)
          await new Promise(r => setTimeout(r, 200))
        }
      } catch (err) {
        console.error(`PDF download failed for ${label.name}:`, err)
      }
    }

    setGenerating(false)

    // Show success message
    alert(`Generazione completata! ${labels.length} etichette scaricate.`)

    // Return to list mode after generation
    if (editingSlug) {
      setEditingSlug(null)
    }
    setReprintSlugs(new Set())
  }

  // Handle accepting sibling product generation
  const handleAcceptSiblings = async () => {
    setGenerating(true)
    const newLabels = []

    for (const group of siblingPrompt.groups) {
      const source = group.source
      for (const sibling of group.siblings) {
        // 1. Copy data from source to sibling (including photo if missing)
        const updatedSibling = {
          ...sibling,
          nutrition: { ...source.nutrition },
          ingredients: { ...source.ingredients },
          allergens: { ...source.allergens },
          bottleColor: source.bottleColor,
          bottleMaterialCode: source.bottleMaterialCode,
          capType: source.capType,
          capMaterialCode: source.capMaterialCode,
          photo: sibling.photo || source.photo,
        }

        // 2. Update in allProducts state
        setAllProducts(prev => prev.map(p =>
          p.slug === sibling.slug ? { ...p, ...updatedSibling } : p
        ))

        // 3. Save to Airtable if connected
        if (isAirtableConfigured() && sibling._recordId) {
          try {
            const langMap = { it: 'It', de: 'De', fr: 'Fr', es: 'Es', ja: 'Jp' }
            const airtableFields = {
              energyKj: source.nutrition?.energy_kj || 0,
              energyKcal: source.nutrition?.energy_kcal || 0,
              fatG: source.nutrition?.fat || 0,
              saturatedFatG: source.nutrition?.saturated_fat || 0,
              carbsG: source.nutrition?.carbs || 0,
              sugarsG: source.nutrition?.sugars || 0,
              proteinG: source.nutrition?.protein || 0,
              saltG: source.nutrition?.salt || 0,
              packagingMaterials: composePackagingMaterials(
                source.bottleColor,
                source.bottleMaterialCode,
                source.capType,
                source.capMaterialCode
              ),
            }
            // Copy ingredients and allergens for all available languages
            for (const [lang, suffix] of Object.entries(langMap)) {
              if (source.ingredients?.[lang]) {
                airtableFields[`ingredients${suffix}`] = source.ingredients[lang]
              }
              if (source.allergens?.[lang]) {
                airtableFields[`allergens${suffix}`] = source.allergens[lang]
              }
            }
            await updateProduct(sibling._recordId, airtableFields)
            console.log(`[Siblings] Saved data for ${sibling.name} ${sibling.volumeMl}ml`)
          } catch (err) {
            console.error(`[Siblings] Airtable save error for ${sibling.name}:`, err)
          }
        }

        // 4. Generate QR and label
        try {
          const qr = await generateQR(updatedSibling.slug)
          newLabels.push({
            ...updatedSibling,
            qr,
            language: selectedLanguage,
            country: selectedCountry,
            importer,
            generatedAt: new Date().toISOString(),
          })
        } catch (err) {
          console.error(`[Siblings] QR failed for ${sibling.name}:`, err)
        }
      }
    }

    // Save to archive and add to preview
    if (newLabels.length > 0) {
      saveLabels(newLabels.map(l => ({ ...l, generatedBy: user?.username || 'unknown' })))
      setGeneratedLabels(prev => [...prev, ...newLabels])
      console.log(`[Siblings] Generated ${newLabels.length} sibling labels`)
    }

    setSiblingPrompt({ groups: [], show: false })
    setGenerating(false)
  }

  const handleDismissSiblings = () => {
    setSiblingPrompt({ groups: [], show: false })
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

  // Preview mode removed — PDFs are downloaded directly in handleGenerate

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
          <div style={{ color: '#666', marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px' }}>{editingProduct.code}</div>
            Compila i campi mancanti. I dati verranno salvati {dataSource === 'airtable' ? 'su Airtable' : 'nella sessione corrente'}.
          </div>

          {/* Titolo etichetta */}
          <h3 className="edit-section-title">Titolo etichetta</h3>
          <div style={{ marginBottom: '24px' }}>
            {editForm._editingTitle ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={editForm.labelTitle}
                  onChange={e => updateEditField('labelTitle', e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '15px', fontWeight: 600, border: '1px solid #ccc', borderRadius: '6px' }}
                  autoFocus
                />
                <button
                  className="button button-small"
                  onClick={() => updateEditField('_editingTitle', false)}
                  style={{ whiteSpace: 'nowrap' }}
                >✓ OK</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>{editForm.labelTitle || '(nessun titolo)'}</span>
                <button
                  onClick={() => updateEditField('_editingTitle', true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 6px', borderRadius: '4px', color: '#555' }}
                  title="Modifica titolo"
                >✏️</button>
              </div>
            )}
            {(() => {
              const lines = estimateTitleLines(editForm.labelTitle)
              if (lines > 1) {
                return (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: lines > 2 ? '#c0392b' : '#e67e22', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{lines > 2 ? '⚠️' : 'ℹ️'}</span>
                    <span>Il titolo occupa <strong>{lines} righe</strong> a 8pt. {lines > 2 ? 'Il font verrà ridotto automaticamente nel PDF. Accorcialo per un risultato migliore.' : 'Puoi accorciarlo se preferisci una riga singola.'}</span>
                  </div>
                )
              }
              return null
            })()}
          </div>

          {/* ====== SEZIONE 1: DATI ETICHETTA FISICA (obbligatori) ====== */}
          <div style={{
            background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px',
            padding: '16px 18px', marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>🏷️</span>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Dati etichetta fisica (obbligatori)</h3>
            </div>
            <p style={{ fontSize: '12px', color: '#8d6e00', margin: '0 0 16px' }}>
              Questi dati compaiono sull'etichetta stampata. Senza di essi non è possibile generare il PDF.
            </p>

            <h3 className="edit-section-title">Grado alcolico</h3>
            <div className="edit-grid" style={{ marginBottom: '16px' }}>
              <div className="edit-field">
                <label>Alcol (% vol)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.alcoholPct ?? ''}
                  onChange={e => updateEditField('alcoholPct', e.target.value)}
                  placeholder="Es: 15.5"
                  style={{ maxWidth: '150px' }}
                />
              </div>
            </div>

            <h3 className="edit-section-title">Ingredienti ({langLabel})</h3>
            <textarea
              className="edit-textarea"
              value={editForm[`ingredients_${selectedLanguage}`] || ''}
              onChange={e => updateEditField(`ingredients_${selectedLanguage}`, e.target.value)}
              placeholder="Es: Riso, riso maltato (koji), acqua"
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
              {ingredientsSaved && (
                <span style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600 }}>
                  Dati etichetta salvati
                </span>
              )}
              <button
                type="button"
                onClick={saveIngredientsOnly}
                disabled={savingIngredients}
                style={{
                  padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                  background: savingIngredients ? '#ccc' : (ingredientsSaved || confirmedFlags[editingProduct?.slug]?.ingredients || !!(editingProduct?.ingredients?.[selectedLanguage] || editingProduct?.ingredients?.it)) ? '#2e7d32' : '#1565c0', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: savingIngredients ? 'default' : 'pointer',
                }}
              >
                {savingIngredients ? 'Salvataggio...' : ingredientsSaved ? '✓ Dati etichetta confermati' : (confirmedFlags[editingProduct?.slug]?.ingredients || !!(editingProduct?.ingredients?.[selectedLanguage] || editingProduct?.ingredients?.it)) ? '✓ Conferma dati etichetta' : 'Conferma dati etichetta'}
              </button>
            </div>
          </div>

          {/* ====== SEZIONE 2: DATI E-LABEL DIGITALE (completabili dopo) ====== */}
          <div style={{
            background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '8px',
            padding: '16px 18px', marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '16px' }}>📱</span>
              <h3 style={{ margin: 0, fontSize: '15px' }}>Valori nutrizionali — e-label digitale (completabili dopo)</h3>
            </div>
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 16px' }}>
              Questi dati appaiono nella pagina web raggiungibile tramite QR code. Possono essere aggiunti anche in un secondo momento.
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              {nutritionSaved && (
                <span style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600 }}>
                  Valori nutrizionali salvati
                </span>
              )}
              <button
                type="button"
                onClick={saveNutritionOnly}
                disabled={savingNutrition}
                style={{
                  padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                  background: savingNutrition ? '#ccc' : (nutritionSaved || confirmedFlags[editingProduct?.slug]?.nutrition || (editingProduct?.nutrition?.energy_kj != null && editingProduct?.nutrition?.energy_kj !== '')) ? '#2e7d32' : '#1565c0', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: savingNutrition ? 'default' : 'pointer',
                }}
              >
                {savingNutrition ? 'Salvataggio...' : nutritionSaved ? '✓ Valori confermati' : (confirmedFlags[editingProduct?.slug]?.nutrition || (editingProduct?.nutrition?.energy_kj != null && editingProduct?.nutrition?.energy_kj !== '')) ? '✓ Conferma valori nutrizionali' : 'Conferma valori nutrizionali'}
              </button>
            </div>
          </div>

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

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '8px' }}>
            {materialsSaved && (
              <span style={{ fontSize: '13px', color: '#2e7d32', fontWeight: 600 }}>
                Materiali salvati
              </span>
            )}
            <button
              type="button"
              onClick={saveMaterialsOnly}
              disabled={savingMaterials}
              style={{
                padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                background: savingMaterials ? '#ccc' : (materialsSaved || confirmedFlags[editingProduct?.slug]?.materials || editingProduct?.packagingMaterials || editingProduct?.bottleMaterialCode) ? '#2e7d32' : '#1565c0', color: '#fff',
                border: 'none', borderRadius: '6px', cursor: savingMaterials ? 'default' : 'pointer',
              }}
            >
              {savingMaterials ? 'Salvataggio...' : materialsSaved ? '✓ Materiali confermati' : (confirmedFlags[editingProduct?.slug]?.materials || editingProduct?.packagingMaterials || editingProduct?.bottleMaterialCode) ? '✓ Conferma materiali' : 'Conferma materiali'}
            </button>
          </div>

          <div className="edit-actions">
            <button className="button button-secondary" onClick={() => setEditingProduct(null)}>Chiudi</button>
          </div>
        </div>
      </div>
    )
  }


  // Main admin flow: 2-mode UX (list mode or edit mode)
  if (editingSlug && editingProduct_Current) {
    // ========== MODE 2: EDIT & PRINT (single product) ==========
    const product = editingProduct_Current
    const re = reviewEdits[product.slug] || {}
    const titleLines = estimateTitleLines(re.labelTitle || product.name)
    const readiness = getEditingReadiness(product)

    return (
      <div className="admin-container">
        <div className="admin-header">
          <h1>Generatore Retro Etichette</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="button button-secondary button-small" onClick={() => navigate('/')}>
              Home
            </button>
            <button className="button button-secondary button-small" onClick={() => navigate('/archive')}>
              Etichette
            </button>
            <div style={{ width: '1px', height: '20px', background: '#ddd', margin: '0 4px' }}></div>
            <button className="button button-secondary button-small" onClick={logout} style={{ color: '#999' }}>Esci</button>
          </div>
        </div>

        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            className="button button-secondary" 
            onClick={() => setEditingSlug(null)}
            style={{ fontSize: '14px' }}>
            ← Torna alla lista
          </button>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="data-source-badge" style={{
              padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
              background: dataSource === 'airtable' ? '#e8f5e9' : '#fff3e0',
              color: dataSource === 'airtable' ? '#2e7d32' : '#e65100'
            }}>
              {dataSource === 'airtable' ? '☁️ Airtable' : '📁 Dati locali'}
            </div>
          </div>
        </div>

        <div className="steps-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top bar */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Lingua etichetta</label>
              <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                {LANG_OPTIONS.map(l => (
                  <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Paese destinazione</label>
              {allowedRegionCodes.length > 0 ? (
                <select value={allowedRegionCodes.includes(selectedRegion) ? selectedRegion : ''}
                  onChange={e => setSelectedRegion(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                  {!allowedRegionCodes.includes(selectedRegion) && (
                    <option value="" disabled>— Seleziona paese —</option>
                  )}
                  {allowedRegionCodes.map(code => <option key={code} value={code}>{REGION_CODE_LABELS[code]?.label || code}</option>)}
                </select>
              ) : (
                <div style={{
                  padding: '10px 14px', borderRadius: '6px',
                  background: '#fff3e0', border: '1px solid #ffe0b2',
                  fontSize: '13px', color: '#e65100',
                }}>
                  Nessun paese autorizzato.
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>
                Importatore{selectedRegion ? ` per ${REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion}` : ''}
              </label>
              {importersForRegion.length > 0 ? (
                <select value={selectedImporterId} onChange={e => setSelectedImporterId(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                  {importersForRegion.map(imp => (
                    <option key={imp.id} value={imp.id}>{imp.name}</option>
                  ))}
                </select>
              ) : (
                <div style={{
                  padding: '10px 14px', borderRadius: '6px',
                  background: '#fff3e0', border: '1px solid #ffe0b2',
                  fontSize: '13px', color: '#e65100',
                }}>
                  Nessun importatore disponibile
                </div>
              )}
            </div>
          </div>

          {/* Product title and header */}
          <div style={{ borderBottom: '1px solid #e0e0e0', paddingBottom: '16px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '4px' }}>{product.name}</h2>
            <div style={{ fontSize: '13px', color: '#888' }}>
              {product.code} · {product.volumeMl}ml · {product.alcoholPct}%
            </div>
          </div>

          {/* Editable fields - stacked vertically */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '600px' }}>
            {/* Titolo etichetta */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Titolo etichetta</label>
              <input type="text" value={re.labelTitle || ''} onChange={e => updateReviewField(product.slug, 'labelTitle', e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
              {titleLines > 2 && (
                <div style={{ fontSize: '12px', color: '#e65100', marginTop: '4px' }}>
                  ⚠️ Titolo occupa {titleLines} righe — considerare abbreviazione
                </div>
              )}
            </div>

            {/* Categoria */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Categoria</label>
              <input type="text" value={re.category || ''} onChange={e => updateReviewField(product.slug, 'category', e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* Denominazione legale */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Denominazione legale</label>
              <input type="text" value={re.legalDescription || ''} onChange={e => updateReviewField(product.slug, 'legalDescription', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured()) {
                    updateProduct(product._recordId, { legalDescription: e.target.value }).catch(err => console.warn('[Legal] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* Ingredienti */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Ingredienti (lingua selezionata)</label>
              <textarea value={re.ingredients || ''} onChange={e => updateReviewField(product.slug, 'ingredients', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured()) {
                    updateProduct(product._recordId, { [`ingredients_${selectedLanguage}`]: e.target.value }).catch(err => console.warn('[Ingredients] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', minHeight: '80px', fontFamily: 'inherit' }} />
              {!readiness.ready && (
                <div style={{ fontSize: '12px', color: '#c62828', marginTop: '4px' }}>
                  ⚠️ Ingredienti mancanti per {selectedLanguage}
                </div>
              )}
            </div>

            {/* Allergeni */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Allergeni</label>
              <input type="text" value={re.allergens || ''} onChange={e => updateReviewField(product.slug, 'allergens', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured()) {
                    updateProduct(product._recordId, { [`allergens_${selectedLanguage}`]: e.target.value }).catch(err => console.warn('[Allergens] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* Alcool % */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Alcool %</label>
              <input type="number" step="0.1" value={re.alcoholPct || ''} onChange={e => updateReviewField(product.slug, 'alcoholPct', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured() && e.target.value) {
                    updateProduct(product._recordId, { alcoholPct: parseFloat(e.target.value) }).catch(err => console.warn('[Alcohol] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* Volume ml */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Volume (ml)</label>
              <input type="number" value={re.volumeMl || ''} onChange={e => updateReviewField(product.slug, 'volumeMl', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured() && e.target.value) {
                    updateProduct(product._recordId, { volumeMl: parseInt(e.target.value) }).catch(err => console.warn('[Volume] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* Paese di origine */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Paese di origine</label>
              <input type="text" value={re.countryOfOrigin || ''} onChange={e => updateReviewField(product.slug, 'countryOfOrigin', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured()) {
                    updateProduct(product._recordId, { countryOfOrigin: e.target.value }).catch(err => console.warn('[Origin] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
            </div>

            {/* EAN Bottiglia */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>EAN Bottiglia (13 cifre)</label>
              <input type="text" inputMode="numeric" value={product.barcode || ''} 
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 13)
                  setAllProducts(prev => prev.map(p => 
                    p.slug === product.slug ? { ...p, barcode: val } : p
                  ))
                }}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured() && e.target.value.length === 13) {
                    updateProduct(product._recordId, { ean: parseInt(e.target.value, 10) }).catch(err => console.warn('[EAN] Save error:', err.message))
                  }
                }}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'monospace' }} />
            </div>

            {/* EAN Box */}
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>EAN Box (13 cifre)</label>
              <input type="text" value={re.eanBox || ''} onChange={e => updateReviewField(product.slug, 'eanBox', e.target.value)}
                onBlur={e => {
                  if (product._recordId && isAirtableConfigured()) {
                    updateProduct(product._recordId, { eanBox: e.target.value }).catch(err => console.warn('[EAN Box] Save error:', err.message))
                  }
                }}
                placeholder="13-digit EAN" style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'monospace' }} />
            </div>
          </div>

          {/* Summary bar */}
          <div style={{
            padding: '12px 16px', background: '#f5f5f5', borderRadius: '6px',
            border: '1px solid #e0e0e0', fontSize: '13px'
          }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span><strong>Lingua:</strong> {LANG_OPTIONS.find(l => l.code === selectedLanguage)?.label}</span>
              <span><strong>Paese:</strong> {selectedCountry}</span>
              <span><strong>Importatore:</strong> {importer?.name || '—'}</span>
            </div>
          </div>

          {/* Generate buttons */}
          <div style={{ display: 'flex', gap: '12px', paddingTop: '16px' }}>
            <button
              className="button button-secondary"
              onClick={() => openEditor(product)}
              style={{ fontSize: '14px' }}>
              Modifica dettagli
            </button>
            <button
              className="button button-primary"
              onClick={handleGenerateEditMode}
              disabled={!readiness.ready || !hasValidImporter || generating || allowedRegionCodes.length === 0}
              style={{ minWidth: '200px', fontSize: '15px', padding: '10px 24px', fontWeight: 600 }}>
              {generating ? 'Generazione...' : 'Genera etichetta'}
            </button>
            {re.eanBox && (
              <button
                className="button button-secondary"
                onClick={() => {
                  if (!window.confirm('Generare SOLO l\'etichetta della scatola?\n\nConfermi?')) return
                  // Implement box-only generation
                }}
                style={{ fontSize: '14px' }}>
                Genera SOLO Box
              </button>
            )}
          </div>
        </div>

        {/* Product editor modal */}
        {editingProduct && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '16px'
          }}>
            <div style={{
              background: '#fff', borderRadius: '8px', maxWidth: '600px', width: '100%',
              maxHeight: '80vh', overflowY: 'auto', padding: '24px'
            }}>
              <h2 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 700 }}>Modifica dettagli: {editingProduct.name}</h2>
              {/* Editor content here (from original code) */}
              <button className="button button-secondary" onClick={() => setEditingProduct(null)}>Chiudi</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ========== MODE 1: PRODUCT LIST (default view) ==========
  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Generatore Retro Etichette</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="button button-secondary button-small" onClick={() => navigate('/')}>
            Home
          </button>
          <button className="button button-secondary button-small" onClick={() => navigate('/archive')}>
            Etichette
          </button>
          <div style={{ width: '1px', height: '20px', background: '#ddd', margin: '0 4px' }}></div>
          <button className="button button-secondary button-small" onClick={logout} style={{ color: '#999' }}>Esci</button>
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

      <div className="steps-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* TOP BAR: Language, Country/Region, Importer */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Lingua etichetta</label>
            <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
              {LANG_OPTIONS.map(l => (
                <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>Paese destinazione</label>
            <select value={selectedRegion}
              onChange={e => setSelectedRegion(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
              {Object.keys(REGION_CODE_LABELS).map(code => <option key={code} value={code}>{REGION_CODE_LABELS[code]?.label || code}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '14px' }}>
              Importatore{selectedRegion ? ` per ${REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion}` : ''}
            </label>
            {importersForRegion.length > 0 ? (
              <select value={selectedImporterId} onChange={e => setSelectedImporterId(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '15px' }}>
                {importersForRegion.map(imp => (
                  <option key={imp.id} value={imp.id}>{imp.name}</option>
                ))}
              </select>
            ) : (
              <div style={{
                padding: '10px 14px', borderRadius: '6px',
                background: '#fff3e0', border: '1px solid #ffe0b2',
                fontSize: '13px', color: '#e65100',
              }}>
                Nessun importatore per questa regione
              </div>
            )}
          </div>
        </div>

        {/* Search and filters */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input type="text" placeholder="Cerca prodotto..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }} />
          </div>
          <div style={{ minWidth: '150px' }}>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}>
              <option value="">Tutte le categorie</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div style={{ minWidth: '150px' }}>
            <select value={filterLabelStatus} onChange={e => setFilterLabelStatus(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}>
              <option value="">Tutti i prodotti</option>
              <option value="with-label">Con etichetta</option>
              <option value="without-label">Senza etichetta</option>
            </select>
          </div>
        </div>

        {/* Product list */}
        <div>
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#888' }}>
              {filteredProducts.length} prodotti{filterCategory ? ` in "${filterCategory}"` : ''}{searchQuery ? ` per "${searchQuery}"` : ''}
            </span>
          </div>

          <div className="products-list" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
            {filteredProducts.map(product => {
              const productLabels = labelsMap[product.slug] || []
              const hasLabel = productLabels.length > 0
              const canReprint = hasLabel
              return (
                <div key={product.slug} className="product-list-item" style={{
                  display: 'flex', alignItems: 'center', padding: '12px 14px',
                  borderBottom: '1px solid #f0f0f0', gap: '12px',
                }}>
                  {/* Reprint checkbox - only if has label */}
                  {canReprint && (
                    <input
                      type="checkbox"
                      checked={reprintSlugs.has(product.slug)}
                      onChange={() => toggleReprintCheckbox(product.slug)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  )}
                  {!canReprint && <div style={{ width: '18px' }}></div>}

                  {/* Product info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>{product.name}</span>
                      {product.barcode ? (
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
                          background: '#e8f5e9', color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap'
                        }}>EAN ✓</span>
                      ) : (
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
                          background: '#fff3e0', color: '#e65100', fontWeight: 600, whiteSpace: 'nowrap'
                        }}>EAN ✗</span>
                      )}
                      {hasLabel && (
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
                          background: '#e8f5e9', color: '#2e7d32', fontWeight: 600, whiteSpace: 'nowrap'
                        }}>Etichetta presente</span>
                      )}
                      {reprintStatus[product.code]?.needsReprint && (
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
                          background: '#ffebee', color: '#c62828', fontWeight: 600, whiteSpace: 'nowrap'
                        }}>⚠ Ristampa</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {product.code} · {product.volumeMl}ml · {product.alcoholPct}%
                      {product.winery && ` · ${product.winery}`}
                    </div>
                    {/* Missing data indicators */}
                    {(() => {
                      const fondamentali = []
                      const niceToHave = []
                      if (!product.ingredients?.it && !product.ingredients?.en) fondamentali.push('Ingredienti')
                      if (!product.alcoholPct) fondamentali.push('Alcool%')
                      if (!product.volumeMl) fondamentali.push('Volume')
                      if (!product.barcode) fondamentali.push('EAN')
                      if (!product.countryOfOrigin) fondamentali.push('Origine')
                      if (!product.barcodeBox) niceToHave.push('EAN Box')
                      const hasNutrition = product.nutrition && Object.keys(product.nutrition).some(k => product.nutrition[k])
                      if (!hasNutrition) niceToHave.push('Nutrizione')
                      return (fondamentali.length > 0 || niceToHave.length > 0) ? (
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                          {fondamentali.map(f => (
                            <span key={f} style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '8px',
                              background: '#ffebee', color: '#c62828', fontWeight: 600,
                            }}>✗ {f}</span>
                          ))}
                          {niceToHave.map(f => (
                            <span key={f} style={{
                              fontSize: '9px', padding: '1px 5px', borderRadius: '8px',
                              background: '#fff8e1', color: '#f57f17', fontWeight: 600,
                            }}>○ {f}</span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ marginTop: '3px' }}>
                          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}>✓ Dati completi</span>
                        </div>
                      )
                    })()}
                    {/* Sales regions */}
                    {product.salesRegion && product.salesRegion.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', color: '#888', fontWeight: 600 }}>Mercati:</span>
                        {product.salesRegion.map(code => (
                          <span key={code} style={{
                            fontSize: '9px', padding: '1px 5px', borderRadius: '8px',
                            background: '#e3f2fd', color: '#1565c0', fontWeight: 600,
                          }}>{code}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Modifica & Stampa button */}
                  <button
                    onClick={() => setEditingSlug(product.slug)}
                    style={{
                      fontSize: '13px', padding: '6px 12px', border: '1px solid #1565c0',
                      background: '#e3f2fd', color: '#1565c0', borderRadius: '4px',
                      cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600
                    }}>
                    Modifica & Stampa
                  </button>
                </div>
              )
            })}
            {filteredProducts.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                Nessun prodotto trovato
              </div>
            )}
          </div>
        </div>

        {/* Batch reprint button */}
        {reprintSlugs.size > 0 && (
          <div style={{
            padding: '16px', background: '#e8f5e9', borderRadius: '8px',
            border: '1px solid #c8e6c9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              {reprintSlugs.size} etichetta{reprintSlugs.size === 1 ? '' : 'e'} selezionata{reprintSlugs.size === 1 ? '' : 'e'} per ristampa
            </span>
            <button
              className="button button-primary"
              onClick={handleGenerateReprint}
              disabled={generating}
              style={{ fontSize: '14px', padding: '8px 16px' }}>
              {generating ? 'Ristampa in corso...' : `Ristampa ${reprintSlugs.size} etichett${reprintSlugs.size === 1 ? 'a' : 'e'}`}
            </button>
          </div>
        )}
      </div>

      {/* Product editor modal */}
      {editingProduct && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            background: '#fff', borderRadius: '8px', maxWidth: '700px', width: '100%',
            maxHeight: '80vh', overflowY: 'auto', padding: '24px'
          }}>
            <h2 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: 700 }}>Modifica dettagli: {editingProduct.name}</h2>
            {/* Editor form content here */}
            <button className="button button-secondary" onClick={() => setEditingProduct(null)}>Chiudi</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel
