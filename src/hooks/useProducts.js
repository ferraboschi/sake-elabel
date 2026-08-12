import { useState, useEffect, useMemo } from 'react'
import { products as localProducts } from '../data/products'
import { fetchProducts, updateProduct, isAirtableConfigured, composePackagingMaterials } from '../services/airtable'
import { fetchShopifyProducts, isShopifyConfigured, matchProducts } from '../services/shopify'
import { translateIngredients } from '../services/ingredientTranslator'
import { batchCheckReprint } from '../services/printSnapshot'
import { getLabels } from '../services/labelStore'
import shopifyPhotos from '../data/shopifyPhotos.json'

/**
 * Central hook for product state management.
 * Loads from Airtable (primary), falls back to local data, enriches with Shopify photos.
 */
export function useProducts() {
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState('local')
  const [refreshing, setRefreshing] = useState(false)
  const [reprintStatus, setReprintStatus] = useState({})

  // EAN inline editing
  const [eanEdits, setEanEdits] = useState({})
  const [eanSaving, setEanSaving] = useState({})
  const [eanSaved, setEanSaved] = useState({})

  useEffect(() => { loadProducts() }, [])

  const loadProducts = async () => {
    setLoading(true)
    let products = []

    // 1. Load from Airtable
    try {
      if (isAirtableConfigured()) {
        const airtableProducts = await fetchProducts()
        if (airtableProducts?.length > 0) {
          products = airtableProducts
          setDataSource('airtable')
        }
      }
    } catch (err) {
      console.warn('Airtable fetch failed:', err.message)
    }

    // 2. Fallback to local data
    if (products.length === 0) {
      products = Object.entries(localProducts).map(([slug, p]) => ({ ...p, slug, _recordId: null }))
      setDataSource('local')
    }

    // 3. Enrich with Shopify API
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
        }
      }
    } catch (err) {
      console.warn('Shopify API enrichment failed:', err.message)
    }

    // 4. Fallback: static Shopify photo mapping
    products = products.map(p => {
      const codeKey = (p.code || '').toUpperCase()
      const barcodeKey = p.barcode || ''
      const match = (codeKey && shopifyPhotos[codeKey]) || (barcodeKey && shopifyPhotos[barcodeKey])
      if (match) {
        const enriched = { ...p, shopifyType: match.product_type || p.shopifyType || '' }
        if (!p.photo && match.photo) enriched.photo = match.photo
        return enriched
      }
      return p
    })

    setAllProducts(products)
    setLoading(false)

    // Check reprint status in background
    batchCheckReprint(products).then(status => {
      setReprintStatus(status)
    }).catch(err => console.warn('[Reprint] Check failed:', err.message))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadProducts()
    setRefreshing(false)
  }

  // Labels map — index by both slug AND productCode for robust matching
  const existingLabels = getLabels()
  const labelsMap = useMemo(() => {
    const map = {}
    existingLabels.forEach(l => {
      // Index by slug
      const slugKey = l.productSlug || ''
      if (slugKey) {
        if (!map[slugKey]) map[slugKey] = []
        map[slugKey].push(l)
      }
      // Also index by productCode for stable matching
      const codeKey = l.productCode || ''
      if (codeKey && codeKey !== slugKey) {
        if (!map[codeKey]) map[codeKey] = []
        map[codeKey].push(l)
      }
    })
    return map
  }, [existingLabels])

  const hasExistingLabel = (slug, code) => !!(labelsMap[slug]?.length > 0 || labelsMap[code]?.length > 0)

  const categories = useMemo(() =>
    [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort(),
    [allProducts]
  )

  // EAN save
  const saveEan = async (product) => {
    const recordId = product._recordId
    const eanVal = eanEdits[recordId]
    if (eanVal === undefined || !recordId) return
    if (eanVal && eanVal.length !== 13) return

    setEanSaving(prev => ({ ...prev, [recordId]: true }))
    try {
      const payload = { barcode: eanVal || '' }
      if (eanVal && eanVal.length === 13) payload.ean = parseInt(eanVal, 10)
      await updateProduct(recordId, payload)
      setAllProducts(prev => prev.map(p =>
        p._recordId === recordId ? { ...p, barcode: eanVal } : p
      ))
      setEanSaved(prev => ({ ...prev, [recordId]: true }))
      setTimeout(() => setEanSaved(prev => ({ ...prev, [recordId]: false })), 3000)
    } catch (err) {
      console.error('EAN save error:', err)
    } finally {
      setEanSaving(prev => ({ ...prev, [recordId]: false }))
    }
  }

  // Save ingredients with auto-translation
  const saveIngredients = async (product, editForm, selectedLanguage) => {
    const ingredientsValue = editForm[`ingredients_${selectedLanguage}`] || ''
    const allergensValue = editForm[`allergens_${selectedLanguage}`] || ''
    const alcoholValue = editForm.alcoholPct !== '' ? parseFloat(editForm.alcoholPct) : null

    const allLangs = ['it', 'en', 'de', 'fr', 'es', 'ja']
    const translatedIngredients = { ...product.ingredients, [selectedLanguage]: ingredientsValue }
    const translatedAllergens = { ...product.allergens, [selectedLanguage]: allergensValue }

    if (ingredientsValue) {
      for (const lang of allLangs) {
        if (lang === selectedLanguage || translatedIngredients[lang]?.trim()) continue
        const { text } = translateIngredients(ingredientsValue, lang)
        if (text) translatedIngredients[lang] = text
      }
    }
    if (allergensValue) {
      for (const lang of allLangs) {
        if (lang === selectedLanguage || translatedAllergens[lang]?.trim()) continue
        const { text } = translateIngredients(allergensValue, lang)
        if (text) translatedAllergens[lang] = text
      }
    }

    setAllProducts(prev => prev.map(p => {
      if (p.slug !== product.slug) return p
      return {
        ...p,
        ingredients: translatedIngredients,
        allergens: translatedAllergens,
        alcoholPct: alcoholValue !== null ? alcoholValue : p.alcoholPct,
      }
    }))

    if (isAirtableConfigured() && product._recordId) {
      try {
        const langMap = { it: 'It', en: 'En', de: 'De', fr: 'Fr', es: 'Es' }
        const payload = {}
        for (const [lang, suffix] of Object.entries(langMap)) {
          if (translatedIngredients[lang]) payload[`ingredients${suffix}`] = translatedIngredients[lang]
          if (translatedAllergens[lang]) payload[`allergens${suffix}`] = translatedAllergens[lang]
        }
        if (alcoholValue !== null && !isNaN(alcoholValue)) {
          // Display value (15 = 15%) — updateProduct converts to decimal once.
          payload.alcoholPct = alcoholValue
        }
        await updateProduct(product._recordId, payload)
      } catch (err) {
        console.error('Airtable save ingredients error:', err)
      }
    }

    return { translatedIngredients, translatedAllergens }
  }

  // Save nutrition
  const saveNutrition = async (product, editForm) => {
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

    setAllProducts(prev => prev.map(p => {
      if (p.slug !== product.slug) return p
      return { ...p, nutrition: nutritionData }
    }))

    if (isAirtableConfigured() && product._recordId) {
      try {
        await updateProduct(product._recordId, {
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

    return nutritionData
  }

  // Save materials
  const saveMaterials = async (product, editForm) => {
    const materialData = {
      bottleMaterialCode: editForm.bottleMaterialCode,
      capMaterialCode: editForm.capMaterialCode,
      bottleColor: editForm.bottleColor,
      capType: editForm.capType,
    }

    setAllProducts(prev => prev.map(p => {
      if (p.slug !== product.slug) return p
      return { ...p, ...materialData }
    }))

    if (isAirtableConfigured() && product._recordId) {
      try {
        await updateProduct(product._recordId, {
          packagingMaterials: composePackagingMaterials(
            editForm.bottleColor, editForm.bottleMaterialCode,
            editForm.capType, editForm.capMaterialCode
          ),
        })
      } catch (err) {
        console.error('Airtable save materials error:', err)
      }
    }

    return materialData
  }

  // Find sibling products (same name, different sizes)
  const findSiblingProducts = (product) => {
    return allProducts.filter(p =>
      p.name === product.name && p.slug !== product.slug && p.volumeMl
    )
  }

  return {
    allProducts, setAllProducts, loading, dataSource, refreshing,
    reprintStatus, handleRefresh,
    labelsMap, hasExistingLabel, categories,
    eanEdits, setEanEdits, eanSaving, eanSaved, saveEan,
    saveIngredients, saveNutrition, saveMaterials,
    findSiblingProducts,
  }
}
