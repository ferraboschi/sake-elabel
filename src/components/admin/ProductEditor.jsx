import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LANG_OPTIONS, estimateTitleLines } from '../../config/constants'
import { getImportersForRegion, REGION_CODE_LABELS } from '../../data/importers'
import { isAirtableConfigured, updateProduct } from '../../services/airtable'
import { detectDetailedCategory, getDefaultLegalDescription, getDefaultIngredients } from '../../services/categoryDetector'
import TopBar from './TopBar'

/**
 * Single product editor + generate page.
 * Stripe-inspired: clean sections, clear hierarchy, inline saves.
 * URL: /admin/product/:slug
 */

const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #d8dee4',
  borderRadius: '6px', fontSize: '14px', color: '#0a2540', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.15s',
}

const fieldLabelStyle = {
  display: 'block', fontWeight: 500, marginBottom: '5px',
  fontSize: '13px', color: '#596780',
}

const sectionStyle = {
  background: '#fff', border: '1px solid #e3e8ee', borderRadius: '8px',
  padding: '20px 24px', marginBottom: '16px',
}

const ProductEditor = ({
  product,
  selectedLanguage, setSelectedLanguage,
  selectedRegion, setSelectedRegion,
  selectedImporterId, setSelectedImporterId,
  importerVersion,
  onGenerate,
  generating,
  allProducts, setAllProducts,
}) => {
  const navigate = useNavigate()

  // Review edits state
  const [re, setRe] = useState({})

  // Initialize review data when product or language changes
  useEffect(() => {
    if (!product) return
    const detCat = detectDetailedCategory(product.name, product.category || '', product.shopifyType || '')
    const existingIngredients = product.ingredients?.[selectedLanguage] || product.ingredients?.it || ''
    setRe({
      category: detCat || product.category || '',
      labelTitle: product.labelTitle || product.name || '',
      legalDescription: product.legalDescription || getDefaultLegalDescription(detCat, selectedLanguage),
      ingredients: existingIngredients || getDefaultIngredients(detCat, selectedLanguage),
      allergens: product.allergens?.[selectedLanguage] || product.allergens?.it || '',
      alcoholPct: product.alcoholPct || '',
      volumeMl: product.volumeMl || '',
      countryOfOrigin: product.countryOfOrigin || 'Giappone',
      eanBox: product.barcodeBox || '',
    })
  }, [product?.slug, selectedLanguage])

  if (!product) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#8898aa' }}>
        Prodotto non trovato
      </div>
    )
  }

  const updateField = (field, value) => {
    setRe(prev => ({ ...prev, [field]: value }))
  }

  // Auto-save on blur
  const autoSave = (field, value) => {
    if (!product._recordId || !isAirtableConfigured()) return
    const fieldMap = {
      legalDescription: { legalDescription: value },
      ingredients: { [`ingredients_${selectedLanguage}`]: value },
      allergens: { [`allergens_${selectedLanguage}`]: value },
      alcoholPct: value ? { alcoholPct: parseFloat(value) } : null,
      volumeMl: value ? { volumeMl: parseInt(value) } : null,
      countryOfOrigin: { countryOfOrigin: value },
      eanBox: { eanBox: value },
    }
    const payload = fieldMap[field]
    if (payload) {
      updateProduct(product._recordId, payload).catch(err => console.warn(`[${field}] Save error:`, err.message))
    }
  }

  const titleLines = estimateTitleLines(re.labelTitle || product.name)
  const hasIngredients = re.ingredients?.trim() || product.ingredients?.[selectedLanguage]
  const isReady = !!hasIngredients

  // Allowed regions
  const allowedRegionCodes = (product.salesRegion?.length > 0)
    ? product.salesRegion
    : Object.keys(REGION_CODE_LABELS)

  // Importer
  void importerVersion
  const importersForRegion = getImportersForRegion(selectedRegion, { onlyComplete: true })
  const importer = importersForRegion.find(i => i.id === selectedImporterId) || importersForRegion[0] || null
  const hasValidImporter = importer && importer.name

  const handleGenerate = () => {
    const reviewEdits = { [product.slug]: re }
    onGenerate([product], {
      selectedLanguage,
      selectedCountry: REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion,
      importer,
      reviewEdits,
    })
  }

  const langLabel = LANG_OPTIONS.find(l => l.code === selectedLanguage)?.label || selectedLanguage

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/admin')}
        style={{
          background: 'none', border: 'none', color: '#635bff',
          fontSize: '13px', cursor: 'pointer', padding: '0', marginBottom: '16px',
          fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        ← Torna alla lista
      </button>

      {/* Product header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{
          fontSize: '24px', fontWeight: 700, color: '#0a2540',
          margin: '0 0 4px', letterSpacing: '-0.3px',
        }}>
          {product.name}
        </h2>
        <div style={{ fontSize: '13px', color: '#8898aa' }}>
          {product.code}
          {product.volumeMl ? ` · ${product.volumeMl}ml` : ''}
          {product.alcoholPct ? ` · ${product.alcoholPct}%` : ''}
          {product.winery ? ` · ${product.winery}` : ''}
        </div>
      </div>

      {/* Top bar selectors */}
      <TopBar
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        selectedImporterId={selectedImporterId}
        setSelectedImporterId={setSelectedImporterId}
        allowedRegionCodes={allowedRegionCodes}
        importerVersion={importerVersion}
      />

      {/* ======= SECTION 1: Label Data ======= */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: '#eef2ff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '16px',
          }}>🏷️</div>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0a2540' }}>
              Dati etichetta fisica
              <span style={{ fontWeight: 400, color: '#8898aa', marginLeft: '8px', fontSize: '12px' }}>
                / 物理ラベルデータ
              </span>
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#8898aa' }}>
              Obbligatori per generare il PDF
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Titolo */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabelStyle}>Titolo etichetta / ラベルタイトル</label>
            <input
              type="text"
              value={re.labelTitle || ''}
              onChange={e => updateField('labelTitle', e.target.value)}
              style={inputStyle}
            />
            {titleLines > 2 && (
              <div style={{ fontSize: '12px', color: '#e65100', marginTop: '4px' }}>
                Il titolo occupa {titleLines} righe — considerare abbreviazione
              </div>
            )}
          </div>

          {/* Categoria */}
          <div>
            <label style={fieldLabelStyle}>Categoria / カテゴリー</label>
            <input type="text" value={re.category || ''} onChange={e => updateField('category', e.target.value)} style={inputStyle} />
          </div>

          {/* Denominazione legale */}
          <div>
            <label style={fieldLabelStyle}>Denominazione legale / 法定名称</label>
            <input
              type="text"
              value={re.legalDescription || ''}
              onChange={e => updateField('legalDescription', e.target.value)}
              onBlur={e => autoSave('legalDescription', e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Ingredienti */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabelStyle}>
              Ingredienti ({langLabel}) / 原材料名
              {!hasIngredients && (
                <span style={{ color: '#dc3545', marginLeft: '8px', fontSize: '11px', fontWeight: 600 }}>
                  Obbligatorio
                </span>
              )}
            </label>
            <textarea
              value={re.ingredients || ''}
              onChange={e => updateField('ingredients', e.target.value)}
              onBlur={e => autoSave('ingredients', e.target.value)}
              rows={3}
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          {/* Allergeni */}
          <div>
            <label style={fieldLabelStyle}>Allergeni / アレルゲン</label>
            <input
              type="text"
              value={re.allergens || ''}
              onChange={e => updateField('allergens', e.target.value)}
              onBlur={e => autoSave('allergens', e.target.value)}
              placeholder="Es: solfiti"
              style={inputStyle}
            />
          </div>

          {/* Alcool */}
          <div>
            <label style={fieldLabelStyle}>Alcool % / アルコール度数</label>
            <input
              type="number"
              step="0.1"
              value={re.alcoholPct || ''}
              onChange={e => updateField('alcoholPct', e.target.value)}
              onBlur={e => autoSave('alcoholPct', e.target.value)}
              style={{ ...inputStyle, maxWidth: '160px' }}
            />
          </div>

          {/* Volume */}
          <div>
            <label style={fieldLabelStyle}>Volume (ml) / 容量</label>
            <input
              type="number"
              value={re.volumeMl || ''}
              onChange={e => updateField('volumeMl', e.target.value)}
              onBlur={e => autoSave('volumeMl', e.target.value)}
              style={{ ...inputStyle, maxWidth: '160px' }}
            />
          </div>

          {/* Origine */}
          <div>
            <label style={fieldLabelStyle}>Paese di origine / 原産国</label>
            <input
              type="text"
              value={re.countryOfOrigin || ''}
              onChange={e => updateField('countryOfOrigin', e.target.value)}
              onBlur={e => autoSave('countryOfOrigin', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* ======= SECTION 2: EAN Codes ======= */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: '#e6f4ea', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '16px',
          }}>📊</div>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#0a2540' }}>
              Codici EAN
              <span style={{ fontWeight: 400, color: '#8898aa', marginLeft: '8px', fontSize: '12px' }}>
                / JANコード
              </span>
            </h3>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={fieldLabelStyle}>EAN Bottiglia (13 cifre) / ボトル</label>
            <input
              type="text"
              inputMode="numeric"
              value={product.barcode || ''}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 13)
                setAllProducts(prev => prev.map(p =>
                  p.slug === product.slug ? { ...p, barcode: val } : p
                ))
              }}
              onBlur={e => {
                if (product._recordId && isAirtableConfigured() && e.target.value.length === 13) {
                  updateProduct(product._recordId, { ean: parseInt(e.target.value, 10) }).catch(err => console.warn('[EAN]', err.message))
                }
              }}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>EAN Box (13 cifre) / 箱</label>
            <input
              type="text"
              inputMode="numeric"
              value={re.eanBox || ''}
              onChange={e => updateField('eanBox', e.target.value)}
              onBlur={e => autoSave('eanBox', e.target.value)}
              placeholder="13 cifre"
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
            />
          </div>
        </div>
      </div>

      {/* ======= GENERATE ACTIONS ======= */}
      <div style={{
        ...sectionStyle,
        background: isReady && hasValidImporter ? '#f0f5ff' : '#fff',
        borderColor: isReady && hasValidImporter ? '#c7d2fe' : '#e3e8ee',
      }}>
        {/* Summary */}
        <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', fontSize: '13px', color: '#596780' }}>
          <span><strong>Lingua:</strong> {langLabel}</span>
          <span><strong>Paese:</strong> {REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion}</span>
          <span><strong>Importatore:</strong> {importer?.name || '—'}</span>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleGenerate}
            disabled={!isReady || !hasValidImporter || generating || allowedRegionCodes.length === 0}
            style={{
              padding: '10px 28px', fontSize: '15px', fontWeight: 600,
              background: (isReady && hasValidImporter && !generating) ? '#635bff' : '#d8dee4',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: (isReady && hasValidImporter && !generating) ? 'pointer' : 'default',
              transition: 'all 0.15s',
              minWidth: '200px',
            }}
          >
            {generating ? 'Generazione...' : 'Genera etichetta'}
          </button>

          {re.eanBox && (
            <button
              onClick={() => {
                // Generate box-only
                const reviewEdits = { [product.slug]: re }
                onGenerate([product], {
                  selectedLanguage,
                  selectedCountry: REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion,
                  importer,
                  reviewEdits,
                })
              }}
              style={{
                padding: '10px 20px', fontSize: '14px', fontWeight: 500,
                background: '#fff', color: '#635bff', border: '1px solid #635bff',
                borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Genera Box
            </button>
          )}

          {!isReady && (
            <span style={{ fontSize: '13px', color: '#dc3545' }}>
              Compila i campi obbligatori per procedere
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default ProductEditor
