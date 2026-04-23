import React, { useState, useEffect, useMemo } from 'react'
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

/** Normalize full-width (全角) → half-width (半角) for Japanese keyboards */
const normalizeFullWidth = (str) => {
  if (!str) return str
  return str
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
}
const toHalfWidthNum = (str) => normalizeFullWidth(str || '').replace(/[^0-9.]/g, '')

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
  reprintStatus,
}) => {
  const navigate = useNavigate()

  // Review edits state
  const [re, setRe] = useState({})

  // Initialize review data when product or language changes
  useEffect(() => {
    if (!product) return
    const detCat = detectDetailedCategory(product.name, product.category || '', product.shopifyType || '')
    // Prefer ingredients in selected language; only fallback to 'it' if same script
    const langIngredients = product.ingredients?.[selectedLanguage] || ''
    const fallbackIngredients = (selectedLanguage !== 'ja' && product.ingredients?.it) || ''
    // If the stored text looks like Japanese (contains CJK) but language is not ja, skip it
    const isCJK = (text) => /[\u3000-\u9fff]/.test(text)
    const existingIngredients = langIngredients && !(selectedLanguage !== 'ja' && isCJK(langIngredients))
      ? langIngredients
      : (fallbackIngredients && !isCJK(fallbackIngredients) ? fallbackIngredients : '')
    setRe({
      category: detCat || product.category || '',
      // productTypeCurrent: override for Tipologia — load from Airtable if manually set
      productTypeCurrent: (product.category && product.category !== detCat) ? product.category : '',
      // finiture: finishing descriptors appended after tipologia (e.g. "Koshu Nama")
      finiture: '',
      labelTitle: product.labelTitle || product.name || '',
      legalDescription: product.legalDescription || getDefaultLegalDescription(detCat, selectedLanguage),
      ingredients: existingIngredients || getDefaultIngredients(detCat, selectedLanguage),
      allergens: product.allergens?.[selectedLanguage] || product.allergens?.it || '',
      alcoholPct: product.alcoholPct || '',
      volumeMl: product.volumeMl || '',
      countryOfOrigin: product.countryOfOrigin || 'Japan',
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
      ingredients: { [`ingredients${selectedLanguage.charAt(0).toUpperCase()}${selectedLanguage.slice(1)}`]: value },
      allergens: { [`allergens${selectedLanguage.charAt(0).toUpperCase()}${selectedLanguage.slice(1)}`]: value },
      alcoholPct: value ? { alcoholPct: parseFloat(value) } : null,
      volumeMl: value ? { volumeMl: parseInt(value) } : null,
      countryOfOrigin: { countryOfOrigin: value },
      eanBox: { eanBox: value },
      productTypeCurrent: { productType: value },
    }
    const payload = fieldMap[field]
    if (payload) {
      updateProduct(product._recordId, payload).catch(err => console.warn(`[${field}] Save error:`, err.message))
    }
  }

  const titleLines = estimateTitleLines(re.labelTitle || product.name)
  const hasIngredients = re.ingredients?.trim() || product.ingredients?.[selectedLanguage]
  const isReady = !!hasIngredients

  // Empty-field highlighting: red border on required fields that are empty
  const emptyBorder = { border: '1.5px solid #dc3545', background: '#fffafa' }
  const emptyLabel = { color: '#dc3545' }

  // Allowed regions
  const allowedRegionCodes = (product.salesRegion?.length > 0)
    ? product.salesRegion
    : Object.keys(REGION_CODE_LABELS)

  // Importer
  void importerVersion
  const importersForRegion = getImportersForRegion(selectedRegion, { onlyComplete: true })
  const importer = importersForRegion.find(i => i.id === selectedImporterId) || importersForRegion[0] || null
  const hasValidImporter = importer && importer.name

  // Reprint status for this product
  const productReprint = reprintStatus?.[product.code] || {}
  const needsReprint = productReprint.needsReprint
  const printedAt = productReprint.printedAt
  const hasPrintHistory = !!printedAt

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

      {/* ======= REPRINT BANNER ======= */}
      {needsReprint && (
        <div style={{
          ...sectionStyle,
          borderLeft: '4px solid #dc3545',
          background: '#fdf2f2',
          borderColor: '#f5c2c7',
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 20px',
        }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#842029' }}>
              Ristampa necessaria
            </div>
            <div style={{ fontSize: '12px', color: '#842029', opacity: 0.8, marginTop: '2px' }}>
              I dati sono stati modificati dopo l'ultima stampa
              {printedAt && ` del ${new Date(printedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}`}.
              Rigenera l'etichetta per aggiornare il PDF.
            </div>
          </div>
        </div>
      )}

      {/* ======= PRINT HISTORY BADGE ======= */}
      {hasPrintHistory && !needsReprint && (
        <div style={{
          ...sectionStyle,
          borderLeft: '4px solid #198754',
          background: '#f0faf4',
          borderColor: '#badbcc',
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 20px',
        }}>
          <span style={{ fontSize: '16px' }}>✅</span>
          <div style={{ fontSize: '13px', color: '#0f5132' }}>
            Etichetta stampata il {new Date(printedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })} — nessuna modifica pendente
          </div>
        </div>
      )}

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
              <div style={{
                marginTop: '8px', padding: '12px', background: '#fff3e0', border: '1px solid #ffb74d',
                borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '18px' }}>⚠️</span>
                <div style={{ flex: 1, fontSize: '13px', color: '#e65100' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                    Titolo troppo lungo ({titleLines} righe)
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.9 }}>
                    Riduci di almeno {Math.max(1, Math.ceil((re.labelTitle?.length || 0) * 0.25))} caratteri per stare in 2 righe
                  </div>
                </div>
                <button
                  onClick={() => {
                    const field = document.querySelector('input[value="' + (re.labelTitle || '').replace(/"/g, '\\"') + '"]')
                    field?.focus()
                  }}
                  style={{
                    padding: '6px 12px', background: '#ff9800', color: '#fff', border: 'none',
                    borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✏️ Modifica
                </button>
              </div>
            )}
          </div>

          {/* Categoria (rilevata automaticamente — sola lettura) */}
          <div>
            <label style={fieldLabelStyle}>Categoria rilevata / カテゴリー</label>
            <input
              type="text"
              value={re.category || ''}
              readOnly
              style={{ ...inputStyle, background: '#f6f8fa', color: '#8898aa', cursor: 'default' }}
            />
          </div>

          {/* Tipologia (Product_Type_Current) — override sessione */}
          <div>
            <label style={fieldLabelStyle}>
              Tipologia (override) / 種別
              {re.productTypeCurrent && re.productTypeCurrent !== 'Nessuna' && (
                <span style={{
                  marginLeft: '8px', fontSize: '10px', fontWeight: 700,
                  background: '#635bff', color: '#fff',
                  padding: '1px 6px', borderRadius: '10px', verticalAlign: 'middle',
                }}>MODIFICATO</span>
              )}
            </label>
            <input
              type="text"
              value={re.productTypeCurrent || ''}
              onChange={e => updateField('productTypeCurrent', e.target.value)}
              onBlur={e => {
                const val = e.target.value.trim()
                if (val && val !== 'Nessuna') {
                  autoSave('productTypeCurrent', val)
                  setAllProducts(prev => prev.map(p =>
                    p._recordId === product._recordId ? { ...p, category: val } : p
                  ))
                }
              }}
              placeholder={`${re.category || 'es: Tokubetsu Honjozo'} (lascia vuoto = usa originale)`}
              style={inputStyle}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#8898aa' }}>
              Scrivi "Nessuna" per omettere la tipologia dal PDF. Lascia vuoto per usare la categoria rilevata.
            </div>
          </div>

          {/* Finiture — finishing descriptors */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={fieldLabelStyle}>Finiture / 仕上げ</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {['Koshu', 'Nama', 'Genshu', 'Nigori', 'Muroka', 'Shiboritate', 'Happoshu'].map(tag => {
                const currentFiniture = (re.finiture || '').split(/\s+/).filter(Boolean)
                const isActive = currentFiniture.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const next = isActive
                        ? currentFiniture.filter(f => f !== tag)
                        : [...currentFiniture, tag]
                      updateField('finiture', next.join(' '))
                    }}
                    style={{
                      padding: '4px 12px', fontSize: '12px', fontWeight: isActive ? 700 : 400,
                      background: isActive ? '#635bff' : '#f0f0f5',
                      color: isActive ? '#fff' : '#596780',
                      border: isActive ? '1px solid #635bff' : '1px solid #d8dee4',
                      borderRadius: '20px', cursor: 'pointer', transition: 'all 0.1s',
                    }}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            <input
              type="text"
              value={re.finiture || ''}
              onChange={e => updateField('finiture', e.target.value)}
              placeholder="es: Koshu Nama  (spazi tra tag, ordine libero)"
              style={inputStyle}
            />
            {(re.productTypeCurrent || re.category || re.finiture) && (
              <div style={{
                marginTop: '6px', padding: '6px 10px',
                background: '#f0f5ff', borderRadius: '6px',
                fontSize: '12px', color: '#3730a3', fontWeight: 500,
              }}>
                Anteprima PDF: <em>
                  {[
                    re.productTypeCurrent === 'Nessuna'
                      ? ''
                      : (re.productTypeCurrent || re.category || ''),
                    re.finiture || '',
                  ].filter(Boolean).join(' ') || '(vuoto)'}
                </em>
              </div>
            )}
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
              style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', ...(!hasIngredients ? emptyBorder : {}) }}
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
            <label style={{ ...fieldLabelStyle, ...(!re.alcoholPct ? emptyLabel : {}) }}>Alcool % / アルコール度数{!re.alcoholPct && ' *'}</label>
            <input
              type="text"
              inputMode="decimal"
              value={re.alcoholPct || ''}
              onChange={e => updateField('alcoholPct', toHalfWidthNum(e.target.value))}
              onBlur={e => autoSave('alcoholPct', e.target.value)}
              style={{ ...inputStyle, maxWidth: '160px', ...(!re.alcoholPct ? emptyBorder : {}) }}
            />
          </div>

          {/* Volume */}
          <div>
            <label style={fieldLabelStyle}>Volume (ml) / 容量</label>
            <input
              type="text"
              inputMode="numeric"
              value={re.volumeMl || ''}
              onChange={e => updateField('volumeMl', toHalfWidthNum(e.target.value).replace(/\./g, ''))}
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
            <label style={{ ...fieldLabelStyle, ...(!product.barcode ? emptyLabel : {}) }}>EAN Bottiglia (13 cifre) / ボトル{!product.barcode && ' *'}</label>
            <input
              type="text"
              inputMode="numeric"
              value={product.barcode || ''}
              onChange={e => {
                const val = normalizeFullWidth(e.target.value).replace(/[^0-9]/g, '').slice(0, 13)
                setAllProducts(prev => prev.map(p =>
                  p.slug === product.slug ? { ...p, barcode: val } : p
                ))
              }}
              onBlur={e => {
                if (product._recordId && isAirtableConfigured()) {
                  const val = e.target.value
                  const payload = { barcode: val }
                  if (val.length === 13) payload.ean = parseInt(val, 10)
                  updateProduct(product._recordId, payload).catch(err => console.warn('[EAN]', err.message))
                }
              }}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', ...(!product.barcode ? emptyBorder : {}) }}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>EAN Box (13 cifre) / 箱</label>
            <input
              type="text"
              inputMode="numeric"
              value={re.eanBox || ''}
              onChange={e => updateField('eanBox', normalizeFullWidth(e.target.value).replace(/[^0-9]/g, ''))}
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
              background: !isReady || !hasValidImporter || generating ? '#d8dee4'
                : needsReprint ? '#dc3545'
                : '#635bff',
              color: '#fff', border: 'none', borderRadius: '8px',
              cursor: (isReady && hasValidImporter && !generating) ? 'pointer' : 'default',
              transition: 'all 0.15s',
              minWidth: '200px',
            }}
          >
            {generating ? 'Generazione...'
              : needsReprint ? '⚠ Rigenera etichetta'
              : hasPrintHistory ? 'Genera nuova versione'
              : 'Genera etichetta'}
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

      {/* ======= SIBLING PROPAGATION ======= */}
      <SiblingPropagation
        product={product}
        allProducts={allProducts}
        setAllProducts={setAllProducts}
        reviewEdits={re}
        selectedLanguage={selectedLanguage}
      />
    </div>
  )
}

/**
 * Sibling propagation component.
 * Shows when the current product has siblings (same name, different volumes).
 * Allows propagating shared data (ingredients, allergens, alcohol, nutrition) to siblings.
 */
const SiblingPropagation = ({ product, allProducts, setAllProducts, reviewEdits, selectedLanguage }) => {
  const [propagating, setPropagating] = useState(false)
  const [propagated, setPropagated] = useState(false)

  const siblings = useMemo(() => {
    if (!product) return []
    return allProducts.filter(p =>
      p.name === product.name && p.slug !== product.slug && p.volumeMl
    )
  }, [product, allProducts])

  if (siblings.length === 0) return null

  // Fields that are shared across siblings (NOT volume-specific like EAN, volume)
  const sharedFields = ['ingredients', 'allergens', 'alcoholPct', 'nutrition', 'countryOfOrigin', 'seimaibuai']

  const handlePropagate = async () => {
    setPropagating(true)
    try {
      // Build the data to propagate from current product + review edits
      const propagateData = {}

      // Ingredients: merge current product data with review edits
      if (reviewEdits.ingredients) {
        propagateData.ingredients = {
          ...product.ingredients,
          [selectedLanguage]: reviewEdits.ingredients,
        }
      } else if (product.ingredients) {
        propagateData.ingredients = product.ingredients
      }

      // Allergens
      if (reviewEdits.allergens !== undefined) {
        propagateData.allergens = {
          ...product.allergens,
          [selectedLanguage]: reviewEdits.allergens,
        }
      } else if (product.allergens) {
        propagateData.allergens = product.allergens
      }

      // Alcohol
      const alcoholVal = reviewEdits.alcoholPct
        ? parseFloat(reviewEdits.alcoholPct)
        : product.alcoholPct
      if (alcoholVal) propagateData.alcoholPct = alcoholVal

      // Nutrition (from product state, not review edits)
      if (product.nutrition) propagateData.nutrition = product.nutrition

      // Country of origin
      const origin = reviewEdits.countryOfOrigin || product.countryOfOrigin
      if (origin) propagateData.countryOfOrigin = origin

      // Seimaibuai
      if (product.seimaibuai) propagateData.seimaibuai = product.seimaibuai

      // Update local state for all siblings
      setAllProducts(prev => prev.map(p => {
        if (p.name !== product.name || p.slug === product.slug) return p
        return { ...p, ...propagateData }
      }))

      // Persist to Airtable for each sibling
      if (isAirtableConfigured()) {
        for (const sibling of siblings) {
          if (!sibling._recordId) continue
          const payload = {}
          const langMap = { it: 'It', en: 'En', de: 'De', fr: 'Fr', es: 'Es' }

          if (propagateData.ingredients) {
            for (const [lang, suffix] of Object.entries(langMap)) {
              if (propagateData.ingredients[lang]) payload[`ingredients${suffix}`] = propagateData.ingredients[lang]
            }
          }
          if (propagateData.allergens) {
            for (const [lang, suffix] of Object.entries(langMap)) {
              if (propagateData.allergens[lang]) payload[`allergens${suffix}`] = propagateData.allergens[lang]
            }
          }
          if (propagateData.alcoholPct) {
            payload.alcoholPct = propagateData.alcoholPct <= 1
              ? propagateData.alcoholPct
              : propagateData.alcoholPct / 100
          }
          if (propagateData.nutrition) {
            payload.energyKj = propagateData.nutrition.energy_kj
            payload.energyKcal = propagateData.nutrition.energy_kcal
            payload.fatG = propagateData.nutrition.fat
            payload.saturatedFatG = propagateData.nutrition.saturated_fat
            payload.carbsG = propagateData.nutrition.carbs
            payload.sugarsG = propagateData.nutrition.sugars
            payload.proteinG = propagateData.nutrition.protein
            payload.saltG = propagateData.nutrition.salt
          }
          if (propagateData.countryOfOrigin) payload.countryOfOrigin = propagateData.countryOfOrigin

          if (Object.keys(payload).length > 0) {
            updateProduct(sibling._recordId, payload).catch(err =>
              console.warn(`[Propagate] ${sibling.code}:`, err.message)
            )
          }
        }
      }

      setPropagated(true)
      setTimeout(() => setPropagated(false), 4000)
    } catch (err) {
      console.error('[Propagate] Error:', err)
    } finally {
      setPropagating(false)
    }
  }

  return (
    <div style={{
      ...sectionStyle,
      borderLeft: '4px solid #f59e0b',
      background: '#fffbeb',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: '#fef3c7', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '14px',
        }}>🔗</div>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#92400e' }}>
            Formati fratelli
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#b45309' }}>
            Stesso sake, {siblings.length + 1} formati — propaga ingredienti, alcool, nutrizione
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {/* Current product */}
        <span style={{
          padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
          background: '#fbbf24', color: '#78350f',
        }}>
          {product.volumeMl}ml · {product.code} (corrente)
        </span>
        {/* Siblings */}
        {siblings.map(s => (
          <span key={s.slug} style={{
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
            background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
          }}>
            {s.volumeMl}ml · {s.code}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={handlePropagate}
          disabled={propagating}
          style={{
            padding: '8px 18px', fontSize: '13px', fontWeight: 600,
            background: propagated ? '#059669' : '#f59e0b',
            color: '#fff', border: 'none', borderRadius: '6px',
            cursor: propagating ? 'default' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {propagating ? 'Propagazione...'
            : propagated ? '✓ Propagato!'
            : `Propaga ai ${siblings.length} fratell${siblings.length === 1 ? 'o' : 'i'}`}
        </button>
        <span style={{ fontSize: '11px', color: '#92400e' }}>
          Ingredienti, allergeni, alcool, nutrizione, origine
        </span>
      </div>
    </div>
  )
}

export default ProductEditor
