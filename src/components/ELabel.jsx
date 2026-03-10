import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { products } from '../data/products'
import { getImporterByCountry } from '../data/importers'
import { fetchProducts } from '../services/airtable'
import DisposalIcon from './DisposalIcon'
import NutritionTable from './NutritionTable'

/**
 * Parse packagingMaterials string (e.g. "Vetro trasparente GL 72, Tappo alluminio C/ALU 90")
 * into structured disposal data
 */
function parsePackagingMaterials(materialsStr) {
  if (!materialsStr) return null

  const result = {
    bottleMaterialCode: null,
    capMaterialCode: null,
    capsuleMaterialCode: null,
    hasCapsule: false,
    hasPaperLabel: true, // default for sake/wine bottles
  }

  const parts = materialsStr.split(',').map(s => s.trim())
  for (const part of parts) {
    const lower = part.toLowerCase()
    // Glass bottle
    if (lower.includes('vetro') || lower.includes('glass') || lower.includes('gl ')) {
      const match = part.match(/GL\s*\d+/i)
      result.bottleMaterialCode = match ? match[0].toUpperCase() : 'GL 72'
    }
    // Aluminum cap
    if (lower.includes('tappo') || lower.includes('cap') || lower.includes('alu')) {
      const match = part.match(/C\/ALU\s*\d+/i)
      result.capMaterialCode = match ? match[0].toUpperCase() : 'C/ALU 90'
    }
    // Cork
    if (lower.includes('sughero') || lower.includes('cork')) {
      result.capMaterialCode = 'C/CORK'
    }
    // Capsule / PVC
    if (lower.includes('capsula') || lower.includes('pvc')) {
      result.hasCapsule = true
      result.capsuleMaterialCode = 'PVC'
    }
  }

  return result
}

/**
 * Generate slug from product name (must match airtable.js normalizeRecord logic)
 */
function makeSlug(name) {
  return name.toLowerCase()
    .replace(/[/]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const ELabel = () => {
  const { productSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { i18n, t } = useTranslation()
  const [selectedSize, setSelectedSize] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'it')
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState(null)
  const [error, setError] = useState(null)

  // Fetch product data from Airtable (with static fallback)
  useEffect(() => {
    if (!productSlug) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadProduct = async () => {
      setLoading(true)
      setError(null)

      try {
        // Try Airtable first
        const airtableProducts = await fetchProducts()

        if (airtableProducts && !cancelled) {
          // Find all records matching this slug (could be multiple sizes)
          const matching = airtableProducts.filter(p => p.slug === productSlug)

          // Also try matching by CODE (e.g., /label/S093-1800)
          const codeSlug = productSlug.toUpperCase()
          const codeMatch = matching.length === 0
            ? airtableProducts.filter(p => p.code === codeSlug)
            : []

          const allMatches = matching.length > 0 ? matching : codeMatch

          if (allMatches.length > 0) {
            // If code match found, get all variants with same product name
            const baseName = allMatches[0].name
            const variants = codeMatch.length > 0
              ? airtableProducts.filter(p => p.name === baseName)
              : allMatches

            // Build product object for display
            const first = variants[0]
            const packaging = parsePackagingMaterials(first.packagingMaterials)

            const productData = {
              name: first.name,
              nameJp: first.nameJp,
              winery: first.winery,
              wineryJp: first.wineryJp,
              category: first.category,
              grapeVariety: first.category, // Product Type serves as category
              countryOfOrigin: first.countryOfOrigin || 'Japan',
              alcoholPct: first.alcoholPct,
              photo: null,
              sizes: variants
                .filter(v => v.volumeMl)
                .sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0))
                .map(v => ({ ml: v.volumeMl, code: v.code })),
              nutrition: first.nutrition,
              ingredients: {
                it: first.ingredients?.it || '',
                de: first.ingredients?.de || '',
                fr: first.ingredients?.fr || '',
                es: first.ingredients?.es || '',
                ja: '', // Japanese ingredients not in Airtable yet
              },
              allergens: {
                it: first.allergens?.it || null,
                de: first.allergens?.de || null,
                fr: first.allergens?.fr || null,
                es: first.allergens?.es || null,
                ja: null,
              },
              bottleMaterialCode: packaging?.bottleMaterialCode || 'GL 72',
              capMaterialCode: packaging?.capMaterialCode || 'C/ALU 90',
              hasCapsule: packaging?.hasCapsule || false,
              capsuleMaterialCode: packaging?.capsuleMaterialCode || null,
              hasPaperLabel: packaging?.hasPaperLabel ?? true,
            }

            // If no sizes found, add a single entry
            if (productData.sizes.length === 0) {
              productData.sizes = [{ ml: first.volumeMl || 0, code: first.code }]
            }

            setProduct(productData)
            setLoading(false)
            return
          }
        }

        // Fallback to static products.js
        const staticProduct = products[productSlug]
        if (staticProduct) {
          setProduct(staticProduct)
        }
      } catch (err) {
        console.error('[ELabel] Error fetching from Airtable:', err)
        // Fallback to static data on error
        const staticProduct = products[productSlug]
        if (staticProduct) {
          setProduct(staticProduct)
        } else {
          setError(err.message)
        }
      }

      if (!cancelled) setLoading(false)
    }

    loadProduct()
    return () => { cancelled = true }
  }, [productSlug])

  // Handle language/country from URL params
  useEffect(() => {
    const lang = searchParams.get('lang') || i18n.language || 'it'
    const country = searchParams.get('country') || 'Italia'
    setSelectedLanguage(lang)
    setSelectedCountry(country)
    i18n.changeLanguage(lang)
  }, [searchParams, i18n])

  // Loading state
  if (loading) {
    return (
      <div className="container">
        <div className="error-container">
          <div className="error-message" style={{ fontSize: '18px' }}>
            Caricamento...
          </div>
        </div>
      </div>
    )
  }

  // Not found
  if (!product) {
    return (
      <div className="container">
        <div className="error-container">
          <div className="error-code">404</div>
          <div className="error-message">{t('productNotFound')}</div>
        </div>
      </div>
    )
  }

  const currentSize = product.sizes[selectedSize]
  const importer = selectedCountry ? getImporterByCountry(selectedCountry) : null

  const handleLanguageChange = (lang) => {
    setSelectedLanguage(lang)
    i18n.changeLanguage(lang)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('lang', lang)
    setSearchParams(newParams)
  }

  const getMaterialTypeFromCode = (code) => {
    const codeMap = {
      'GL 72': 'glass',
      'GL 71': 'glass',
      'GL 70': 'glass',
      'C/ALU 90': 'aluminum',
      'C/CORK': 'cork',
      'PVC': 'plastic'
    }
    return codeMap[code] || 'glass'
  }

  // Check if nutrition data is filled
  const hasNutrition = product.nutrition &&
    (product.nutrition.energy_kj != null || product.nutrition.energy_kcal != null)

  // Check if ingredients are filled
  const hasIngredients = product.ingredients &&
    Object.values(product.ingredients).some(v => v && v.trim())

  return (
    <div className="container">
      {/* Age Restriction Badge */}
      <div className="age-restriction">18+</div>

      {/* Header with Language Selector */}
      <div className="header">
        <div></div>
        <div className="language-selector">
          <button
            className={`language-button ${selectedLanguage === 'it' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('it')}
            title="Italiano"
          >
            🇮🇹
          </button>
          <button
            className={`language-button ${selectedLanguage === 'de' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('de')}
            title="Deutsch"
          >
            🇩🇪
          </button>
          <button
            className={`language-button ${selectedLanguage === 'fr' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('fr')}
            title="Français"
          >
            🇫🇷
          </button>
          <button
            className={`language-button ${selectedLanguage === 'es' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('es')}
            title="Español"
          >
            🇪🇸
          </button>
          <button
            className={`language-button ${selectedLanguage === 'ja' ? 'active' : ''}`}
            onClick={() => handleLanguageChange('ja')}
            title="日本語"
          >
            🇯🇵
          </button>
        </div>
      </div>

      {/* Product Header */}
      <div className="product-header">
        <div className="product-name">{product.name}</div>
        {product.nameJp && selectedLanguage === 'ja' && (
          <div className="product-winery-jp">{product.nameJp}</div>
        )}
        {product.wineryJp && selectedLanguage === 'ja' && (
          <div className="product-winery-jp">{product.wineryJp}</div>
        )}
        <div className="product-winery">{product.winery}</div>
        {product.photo && (
          <img src={product.photo} alt={product.name} className="product-photo" />
        )}
      </div>

      {/* Product Info Grid */}
      <div className="product-info">
        <div className="info-item">
          <div className="info-label">{t('grapeVariety')}</div>
          <div className="info-value">{product.category}</div>
        </div>
        <div className="info-item">
          <div className="info-label">{t('alcohol')}</div>
          <div className="info-value">{product.alcoholPct}%</div>
        </div>
        <div className="info-item">
          <div className="info-label">{t('countryOfOrigin')}</div>
          <div className="info-value">{product.countryOfOrigin}</div>
        </div>
      </div>

      {/* Size Selector */}
      {product.sizes.length > 0 && (
        <div className="size-selector">
          <div className="size-tabs">
            {product.sizes.map((size, idx) => (
              <button
                key={idx}
                className={`size-tab ${selectedSize === idx ? 'active' : ''}`}
                onClick={() => setSelectedSize(idx)}
              >
                {size.ml} {t('ml')}
              </button>
            ))}
          </div>
          <div className="size-content">
            <p>
              <strong>{t('productCode')}:</strong>
            </p>
            <p className="product-code">{currentSize.code}</p>
            <p>
              <strong>{t('lot')}:</strong> {t('seePackaging')}
            </p>
          </div>
        </div>
      )}

      {/* Nutrition Table */}
      {hasNutrition && <NutritionTable nutrition={product.nutrition} />}

      {/* Ingredients Section */}
      {hasIngredients && (
        <div className="ingredients-section">
          <h2>{t('ingredients')}</h2>
          <div className="ingredients-list">
            {product.ingredients[selectedLanguage] || product.ingredients['it'] || ''}
          </div>
          {(product.allergens[selectedLanguage] || product.allergens['it']) && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ddd' }}>
              <strong>{t('contains')}:</strong>{' '}
              <span className="allergens-highlight">
                {product.allergens[selectedLanguage] || product.allergens['it']}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Disposal Section */}
      {product.bottleMaterialCode && (
        <div className="disposal-section">
          <h2>{t('disposal')}</h2>
          <div className="disposal-grid">
            <DisposalIcon
              materialCode={product.bottleMaterialCode}
              materialType={getMaterialTypeFromCode(product.bottleMaterialCode)}
              lang={selectedLanguage}
            />
            {product.capMaterialCode && (
              <DisposalIcon
                materialCode={product.capMaterialCode}
                materialType={getMaterialTypeFromCode(product.capMaterialCode)}
                lang={selectedLanguage}
              />
            )}
            {product.hasCapsule && product.capsuleMaterialCode && (
              <DisposalIcon
                materialCode={product.capsuleMaterialCode}
                materialType="plastic"
                lang={selectedLanguage}
              />
            )}
            {product.hasPaperLabel && (
              <DisposalIcon
                materialCode="20"
                materialType="paper"
                lang={selectedLanguage}
              />
            )}
          </div>
        </div>
      )}

      {/* Importer Section */}
      {importer && importer.name && (
        <div className="importer-section">
          <div className="importer-label">{t('importer')}</div>
          <div className="importer-name">{importer.name}</div>
          <div className="importer-address">{importer.address}</div>
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div className="product-code-footer">
          {t('productCode')}: {currentSize.code}
        </div>
      </div>
    </div>
  )
}

export default ELabel
