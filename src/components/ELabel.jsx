import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { products } from '../data/products'
import { getImporterByCountry } from '../data/importers'
import DisposalIcon from './DisposalIcon'
import NutritionTable from './NutritionTable'

const ELabel = () => {
  const { productSlug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { i18n, t } = useTranslation()
  const [selectedSize, setSelectedSize] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || 'it')
  const [selectedCountry, setSelectedCountry] = useState(null)

  const product = productSlug ? products[productSlug] : null

  useEffect(() => {
    const lang = searchParams.get('lang') || i18n.language || 'it'
    const country = searchParams.get('country') || 'Italia'
    setSelectedLanguage(lang)
    setSelectedCountry(country)
    i18n.changeLanguage(lang)
  }, [searchParams, i18n])

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
      'C/ALU 90': 'aluminum',
      'C/CORK': 'cork',
      'PVC': 'plastic'
    }
    return codeMap[code] || 'glass'
  }

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
          <div className="info-label">{t('category')}</div>
          <div className="info-value">{product.category}</div>
        </div>
        <div className="info-item">
          <div className="info-label">{t('alcohol')}</div>
          <div className="info-value">{product.alcoholPct}%</div>
        </div>
        <div className="info-item">
          <div className="info-label">{t('grapeVariety')}</div>
          <div className="info-value">{product.grapeVariety}</div>
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
      <NutritionTable nutrition={product.nutrition} />

      {/* Ingredients Section */}
      <div className="ingredients-section">
        <h2>{t('ingredients')}</h2>
        <div className="ingredients-list">
          {product.ingredients[selectedLanguage]}
        </div>
        {product.allergens[selectedLanguage] && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ddd' }}>
            <strong>{t('contains')}:</strong>{' '}
            <span className="allergens-highlight">{product.allergens[selectedLanguage]}</span>
          </div>
        )}
      </div>

      {/* Disposal Section */}
      <div className="disposal-section">
        <h2>{t('disposal')}</h2>
        <div className="disposal-grid">
          <DisposalIcon
            materialCode={product.bottleMaterialCode}
            materialType={getMaterialTypeFromCode(product.bottleMaterialCode)}
            lang={selectedLanguage}
          />
          <DisposalIcon
            materialCode={product.capMaterialCode}
            materialType={getMaterialTypeFromCode(product.capMaterialCode)}
            lang={selectedLanguage}
          />
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
