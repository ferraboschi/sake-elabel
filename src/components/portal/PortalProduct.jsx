import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchProducts, updateProduct, isAirtableConfigured } from '../../services/airtable'
import { translateIngredients as autoTranslate, autoFillIngredients } from '../../services/ingredientTranslator'
import { useGenerateLabel } from '../../hooks/useGenerateLabel'
import { downloadLabelPDF, downloadBoxLabelPDF } from '../../services/labelPrinter'
import { isValidEAN13, detectBarcodeFormat } from '../../services/barcodeGenerator'
import { estimateTitleLines, getMaxCharsFor2Lines } from '../../config/constants'
import QRCode from 'qrcode'

/**
 * Validate a barcode code. Returns { valid: boolean, type: string, issue: string|null }
 */
function validateBarcode(code, label) {
  if (!code || !code.trim()) return { valid: true, type: 'empty', issue: null }
  const clean = String(code).trim().replace(/\s/g, '')
  const fmt = detectBarcodeFormat(clean)
  if (!fmt) {
    return {
      valid: false,
      type: 'invalid_format',
      issue: `Il codice ${label} "${clean}" non e' un formato barcode riconosciuto (EAN13=13 cifre, EAN8=8 cifre, ITF14=14 cifre).`
    }
  }
  if (fmt === 'EAN13' && !isValidEAN13(clean)) {
    return {
      valid: false,
      type: 'invalid_checksum',
      issue: `Il codice ${label} "${clean}" ha 13 cifre ma la cifra di controllo (checksum EAN13) non e' valida.`
    }
  }
  return { valid: true, type: fmt, issue: null }
}
import { getImportersForRegion, addCustomImporter, REGION_CODE_LABELS } from '../../data/importers'
import { LANG_OPTIONS } from '../../config/constants'
import { detectDetailedCategory, getDefaultLegalDescription } from '../../services/categoryDetector'
import shopifyPhotos from '../../data/shopifyPhotos.json'
import LabelPreview from './LabelPreview'
import './portal.css'

// ── Ingredient suggestions by category ──
const INGREDIENT_SUGGESTIONS = {
  junmai:       { it: 'Riso, koji (Aspergillus oryzae), acqua',                      jp: '米、米麹、水' },
  nonJunmai:    { it: 'Riso, koji (Aspergillus oryzae), acqua, alcol distillato',     jp: '米、米麹、水、醸造アルコール' },
  umeshu:       { it: 'Alcol puro, prugne ume, zucchero',                             jp: '醸造アルコール、梅、砂糖' },
  yuzu:         { it: 'Sake, succo di yuzu, fruttosio',                               jp: '日本酒、柚子果汁、果糖' },
  peach:        { it: 'Sake, succo di pesca, fruttosio',                              jp: '日本酒、桃果汁、果糖' },
  mango:        { it: 'Sake, succo di mango, fruttosio',                              jp: '日本酒、マンゴー果汁、果糖' },
  strawberry:   { it: 'Sake, succo di fragola, fruttosio',                            jp: '日本酒、いちご果汁、果糖' },
  pear:         { it: 'Sake, succo di pera, fruttosio',                               jp: '日本酒、梨果汁、果糖' },
  grape:        { it: 'Sake, succo di uva, fruttosio',                                jp: '日本酒、ぶどう果汁、果糖' },
  melon:        { it: 'Sake, succo di melone, fruttosio',                             jp: '日本酒、メロン果汁、果糖' },
  ginger:       { it: 'Sake, zenzero, zucchero',                                     jp: '日本酒、生姜、砂糖' },
  matcha:       { it: 'Sake, matcha, zucchero',                                      jp: '日本酒、抹茶、砂糖' },
  sakura:       { it: 'Sake, fiore di ciliegio, zucchero',                            jp: '日本酒、桜、砂糖' },
  genericFruit: { it: 'Sake, frutta, fruttosio',                                     jp: '日本酒、果実、果糖' },
}

const FRUIT_MAP = [
  { keywords: ['umeshu', 'ume '], key: 'umeshu' },
  { keywords: ['yuzu'], key: 'yuzu' },
  { keywords: ['peach', 'momo', 'pesca'], key: 'peach' },
  { keywords: ['mango'], key: 'mango' },
  { keywords: ['strawberry', 'ichigo', 'fragola'], key: 'strawberry' },
  { keywords: ['pear', 'nashi', 'pera'], key: 'pear' },
  { keywords: ['grape', 'uva'], key: 'grape' },
  { keywords: ['melon'], key: 'melon' },
  { keywords: ['ginger', 'zenzero'], key: 'ginger' },
  { keywords: ['matcha'], key: 'matcha' },
  { keywords: ['sakura', 'cherry', 'ciliegio'], key: 'sakura' },
]

function getIngredientSuggestion(category, productName) {
  const cat = (category || '').toLowerCase()
  const name = (productName || '').toLowerCase()
  // Junmai check
  if (cat.includes('junmai')) return INGREDIENT_SUGGESTIONS.junmai
  if (cat.includes('daiginjo') || cat.includes('ginjo') || cat.includes('honjozo')) return INGREDIENT_SUGGESTIONS.nonJunmai
  // Fruit / liqueur
  const isFruit = /fruit|frutti|liqueur|liquore/i.test(cat)
  for (const rule of FRUIT_MAP) {
    if (rule.keywords.some(kw => name.includes(kw) || cat.includes(kw))) return INGREDIENT_SUGGESTIONS[rule.key]
  }
  if (isFruit) return INGREDIENT_SUGGESTIONS.genericFruit
  return null
}

const NUTRITION_FIELDS = [
  { key: 'energyKj', label: 'エネルギー', labelIt: 'Energia', unit: 'kJ' },
  { key: 'energyKcal', label: '', labelIt: '', unit: 'kcal' },
  { key: 'fatG', label: '脂質', labelIt: 'Grassi', unit: 'g' },
  { key: 'saturatedFatG', label: '　飽和脂肪酸', labelIt: 'di cui saturi', unit: 'g', sub: true },
  { key: 'carbsG', label: '炭水化物', labelIt: 'Carboidrati', unit: 'g' },
  { key: 'sugarsG', label: '　糖類', labelIt: 'di cui zuccheri', unit: 'g', sub: true },
  { key: 'proteinG', label: 'たんぱく質', labelIt: 'Proteine', unit: 'g' },
  { key: 'saltG', label: '食塩相当量', labelIt: 'Sale', unit: 'g' },
]

const normalizeFullWidth = (s) => s ? s.replace(/[\uff01-\uff5e]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, ' ') : s
const normalizeNumeric = (s) => s ? normalizeFullWidth(s).replace(/[^0-9.]/g, '') : s

export default function PortalProduct() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [lang, setLang] = useState('ja')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPreviewMobile, setShowPreviewMobile] = useState(false)
  const [previewMode, setPreviewMode] = useState('bottle') // 'bottle' | 'box'

  // Edit state (shared across sizes)
  const [ed, setEd] = useState({})
  const [eanData, setEanData] = useState({})
  const [eanBoxData, setEanBoxData] = useState({})
  const [bpbData, setBpbData] = useState({})

  // Title editor modal
  const [showTitleEditor, setShowTitleEditor] = useState(false)
  const [titleEditorValue, setTitleEditorValue] = useState('')

  // Print settings
  const [printLang, setPrintLang] = useState('it')
  const [printRegion, setPrintRegion] = useState('ITA')
  const [printImporterId, setPrintImporterId] = useState('default-it')
  const [perText, setPerText] = useState('')
  const [printFormat, setPrintFormat] = useState(0)
  const [importerVersion, setImporterVersion] = useState(0) // bump to refresh dropdown

  // Inline new importer
  const [showNewImp, setShowNewImp] = useState(false)
  const [newImp, setNewImp] = useState({ name: '', address: '', website: '' })

  const { generate, generating } = useGenerateLabel()
  const autosaveTimer = useRef(null)
  const saveRef = useRef(null)

  const first = items[0] || {}

  // Load product
  useEffect(() => { if (slug) loadProduct() }, [slug])

  const loadProduct = async () => {
    setLoading(true)
    try {
      if (isAirtableConfigured()) {
        const all = await fetchProducts()
        if (all) {
          const decoded = decodeURIComponent(slug)
          const match = all.find(p => p.slug === decoded || p.code === decoded.toUpperCase())
          if (match) {
            const siblings = all.filter(p => p.name === match.name)
              .sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0))
            setItems(siblings)
            const f = siblings[0]
            setEd({
              editedName: '',
              alcoholPct: f.alcoholPct ?? '',
              ingredientsIt: f.ingredients?.it || '',
              energyKj: f.nutrition?.energy_kj ?? '',
              energyKcal: f.nutrition?.energy_kcal ?? '',
              fatG: f.nutrition?.fat ?? '',
              saturatedFatG: f.nutrition?.saturated_fat ?? '',
              carbsG: f.nutrition?.carbs ?? '',
              sugarsG: f.nutrition?.sugars ?? '',
              proteinG: f.nutrition?.protein ?? '',
              saltG: f.nutrition?.salt ?? '',
            })
            const ean = {}, ebox = {}, bpb = {}
            for (const s of siblings) {
              ean[s._recordId] = s.barcode || ''
              ebox[s._recordId] = s.barcodeBox || ''
              bpb[s._recordId] = s.bottlesPerBox || ''
            }
            setEanData(ean)
            setEanBoxData(ebox)
            setBpbData(bpb)
          }
        }
      }
    } catch (err) { console.error('[PortalProduct]', err) }
    setLoading(false)
  }

  // Autosave via ref (avoids stale closure)
  const doSave = useCallback(async () => {
    if (!items.length) return
    setSaving(true)
    try {
      const d = ed
      const payload = {}
      for (const f of NUTRITION_FIELDS) {
        payload[f.key] = parseFloat(normalizeNumeric(String(d[f.key]))) || 0
      }
      payload.ingredientsIt = normalizeFullWidth(d.ingredientsIt) || ''
      // Auto-translate
      const raw = payload.ingredientsIt
      if (raw) {
        for (const [l, suf] of Object.entries({ en: 'En', de: 'De', fr: 'Fr', es: 'Es' })) {
          const { text } = autoTranslate(raw, l)
          if (text) payload[`ingredients${suf}`] = text
        }
      }
      const alc = parseFloat(normalizeNumeric(String(d.alcoholPct)))
      if (!isNaN(alc) && alc >= 0) payload.alcoholPct = alc
      // Save edited title if provided
      if (d.editedName && d.editedName.trim()) {
        payload.name = d.editedName.trim()
      }

      for (const item of items) {
        const ip = { ...payload }
        const ev = eanData[item._recordId]
        if (ev !== undefined && ev !== '') {
          ip.barcode = ev
          if (ev.length === 13) { const n = parseInt(ev, 10); if (!isNaN(n)) ip.ean = n }
        }
        const ebv = eanBoxData[item._recordId]
        if (ebv !== undefined && ebv !== '') {
          const num = parseInt(ebv, 10)
          ip.eanBox = (!isNaN(num) && String(num) === ebv.trim()) ? num : ebv
        }
        const bv = bpbData[item._recordId]
        if (bv !== undefined && bv !== '') ip.bottlesPerBox = parseInt(bv, 10) || 0
        await updateProduct(item._recordId, ip)
      }
      setSaved(true)
    } catch (err) {
      console.error('[Save]', err)
      alert(`Save error: ${err.message}`)
    }
    setSaving(false)
  }, [items, ed, eanData, eanBoxData, bpbData])

  saveRef.current = doSave

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    setSaved(false)
    autosaveTimer.current = setTimeout(() => saveRef.current(), 2000)
  }, [])

  const updateField = (key, value) => {
    setEd(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'energyKj') {
        const kj = parseFloat(normalizeNumeric(value))
        if (!isNaN(kj) && kj > 0) next.energyKcal = String(Math.round(kj / 4.184))
      }
      if (key === 'energyKcal') {
        const kcal = parseFloat(normalizeNumeric(value))
        if (!isNaN(kcal) && kcal > 0) next.energyKj = String(Math.round(kcal * 4.184))
      }
      return next
    })
    scheduleAutosave()
  }
  const updateEan = (id, v) => { setEanData(p => ({ ...p, [id]: v })); scheduleAutosave() }
  const updateEanBox = (id, v) => { setEanBoxData(p => ({ ...p, [id]: v })); scheduleAutosave() }
  const updateBpb = (id, v) => { setBpbData(p => ({ ...p, [id]: v })); scheduleAutosave() }

  // Title editor functions
  const openTitleEditor = () => {
    const currentName = ed.editedName || first.name
    setTitleEditorValue(currentName)
    setShowTitleEditor(true)
  }

  const saveTitleEdit = () => {
    if (titleEditorValue.trim()) {
      setEd(prev => ({ ...prev, editedName: titleEditorValue.trim() }))
      scheduleAutosave()
    }
    setShowTitleEditor(false)
  }

  // Importers
  const importers = getImportersForRegion(printRegion)
  // Force re-read on importerVersion change
  const importerList = React.useMemo(() => getImportersForRegion(printRegion), [printRegion, importerVersion])
  const selectedImporter = importerList.find(i => i.id === printImporterId) || importerList[0] || { name: '', address: '' }

  const handleAddImporter = () => {
    if (!newImp.name.trim()) return
    const created = addCustomImporter({
      name: newImp.name.trim(),
      address: newImp.address.trim(),
      website: newImp.website.trim(),
      lang: printLang,
      regionCode: printRegion,
    })
    if (created) {
      setPrintImporterId(created.id)
      setImporterVersion(v => v + 1)
    }
    setNewImp({ name: '', address: '', website: '' })
    setShowNewImp(false)
  }

  // Print
  const handlePrint = async (isBox = false) => {
    const item = items[printFormat] || items[0]
    if (!item) return

    // Validate barcode BEFORE generating PDF — ask for confirmation if invalid
    const codeToCheck = isBox
      ? (eanBoxData[item._recordId] || item.barcodeBox || '')
      : (eanData[item._recordId] || item.barcode || '')
    const codeLabel = isBox ? 'EAN Box' : 'EAN Bottiglia'
    const check = validateBarcode(codeToCheck, codeLabel)

    if (!check.valid) {
      const confirmMsg = [
        `⚠ ATTENZIONE — Codice barcode non valido`,
        ``,
        check.issue,
        ``,
        `Opzioni:`,
        `• OK → stampa comunque l'etichetta (il barcode verra' generato come CODE128, leggibile ma non conforme agli standard GS1)`,
        `• Annulla → torna al portale per correggere il codice`,
      ].join('\n')
      const proceed = confirm(confirmMsg)
      if (!proceed) return
    }

    setSaving(true)
    try {
      const regionInfo = REGION_CODE_LABELS[printRegion]
      const imp = selectedImporter
      const cat = detectDetailedCategory(item.name, item.category || '', '')
      const legalDesc = item.legalDescription || getDefaultLegalDescription(cat, printLang)

      // Generate QR code
      const qrUrl = `https://label.sakecompany.com/${item.slug}?lang=${printLang}&country=${regionInfo?.label || 'Italia'}`
      const qrCanvas = await QRCode.toCanvas(document.createElement('canvas'), qrUrl, {
        width: 400, errorCorrectionLevel: 'H', margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      const qr = qrCanvas.toDataURL('image/png')

      // Build ingredients with local edits (user may have typed but autosave hasn't finished)
      const localIngredients = { ...(item.ingredients || {}) }
      if (ed.ingredientsIt) localIngredients.it = ed.ingredientsIt
      // Auto-translate from edited Italian
      const rawIng = localIngredients.it || ''
      if (rawIng) {
        for (const [l, _] of Object.entries({ en: 1, de: 1, fr: 1, es: 1 })) {
          if (!localIngredients[l]) {
            const { text } = autoTranslate(rawIng, l)
            if (text) localIngredients[l] = text
          }
        }
      }

      const label = {
        ...item,
        category: cat || item.category,
        legalDescription: legalDesc,
        ingredients: autoFillIngredients(localIngredients),
        allergens: autoFillIngredients(item.allergens),
        perText: perText || '',
        // Use locally edited values (may differ from Airtable if user just typed them)
        barcode: eanData[item._recordId] || item.barcode || '',
        barcodeBox: eanBoxData[item._recordId] || item.barcodeBox || '',
        bottlesPerBox: bpbData[item._recordId] || item.bottlesPerBox || '',
        alcoholPct: parseFloat(ed.alcoholPct) || item.alcoholPct,
        qr,
        language: printLang,
        country: regionInfo?.label || 'Italia',
        importer: imp,
      }

      if (isBox) {
        await downloadBoxLabelPDF(label)
      } else {
        await downloadLabelPDF(label)
      }
    } catch (err) {
      console.error('[Print]', err)
      alert(`Print error: ${err.message}`)
    }
    setSaving(false)
  }

  // Completeness check
  const hasIngredients = !!(ed.ingredientsIt || '').trim()
  const hasNutrition = !!(ed.energyKj || ed.energyKcal)
  const hasAlcohol = !!(ed.alcoholPct)
  const currentItem = items[printFormat] || items[0]
  const hasEan = !!(currentItem && eanData[currentItem?._recordId])
  const hasEanBox = !!(currentItem && eanBoxData[currentItem?._recordId])
  // Print requires only alcohol + ingredients. EAN/nutrition are optional (barcode just won't appear)
  const canPrint = hasIngredients && hasAlcohol && !isTitleTooLong

  // Photo
  const photo = (() => {
    for (const item of items) {
      const match = shopifyPhotos[(item.code || '').toUpperCase()]
      if (match?.photo) return match.photo
    }
    return null
  })()

  // Preview ingredients (pick for print language)
  const previewIngredients = (() => {
    const ing = first.ingredients || {}
    if (printLang === 'it') return ed.ingredientsIt || ing.it || ''
    // Try auto-translate from Italian
    const raw = ed.ingredientsIt || ing.it || ''
    if (!raw) return ing[printLang] || ''
    const { text } = autoTranslate(raw, printLang)
    return text || ing[printLang] || raw
  })()

  const jp = lang === 'ja'

  if (loading) {
    return (
      <div className="portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--portal-ink-muted)' }}>{jp ? '読み込み中...' : 'Caricamento...'}</div>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="portal">
        <div className="portal-topbar">
          <button className="portal-breadcrumb-back" onClick={() => navigate(-1)} style={{ color: 'white' }}>
            ← {jp ? 'ダッシュボード' : 'Dashboard'}
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--portal-ink-muted)' }}>
          {jp ? '商品が見つかりません' : 'Prodotto non trovato'}
        </div>
      </div>
    )
  }

  const detailedCategory = detectDetailedCategory(first.name, first.category || '', '')
  const legalDesc = first.legalDescription || getDefaultLegalDescription(detailedCategory, printLang)

  // Calculate title lines for validation indicator
  const displayName = ed.editedName || first.name
  const titleLines = estimateTitleLines(displayName)
  const isTitleTooLong = titleLines > 2
  const maxCharsFor2Lines = getMaxCharsFor2Lines(2)
  const displayCharsCount = displayName.length

  return (
    <div className="portal">
      {/* Sticky Top Bar */}
      <div className="portal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="portal-breadcrumb-back" onClick={() => navigate(-1)} style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--portal-font)', fontSize: 13 }}>
            ← {jp ? 'ダッシュボード' : 'Dashboard'}
          </button>
          <span style={{ opacity: 0.3 }}>/</span>
          <strong style={{ fontSize: 14 }}>{first.name}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="portal-lang-switch" style={{ borderLeft: 'none', marginLeft: 0 }}>
            <button className={lang === 'ja' ? 'active' : ''} onClick={() => setLang('ja')}>JP</button>
            <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
          </div>
          {saving && <span style={{ fontSize: 11, opacity: 0.5 }}>⏳</span>}
          {saved && <span style={{ fontSize: 11, opacity: 0.5 }}>✓ {jp ? '保存済' : 'Salvato'}</span>}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="portal-product-layout">
        {/* LEFT: Data entry */}
        <div className="portal-product-left">
          {/* Product header */}
          <div className="portal-detail-header" style={{ padding: 20, borderBottom: '1px solid var(--portal-border-light)' }}>
            <div className="portal-detail-top">
              <div className="portal-detail-photo">
                {photo ? <img src={photo} alt={first.name} /> : '🍶'}
              </div>
              <div style={{ flex: 1 }}>
                <div className="portal-detail-title">
                  {showTitleEditor ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        value={titleEditorValue}
                        onChange={e => setTitleEditorValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveTitleEdit()
                          if (e.key === 'Escape') setShowTitleEditor(false)
                        }}
                        autoFocus
                        style={{
                          fontSize: 'inherit', fontWeight: 700, letterSpacing: '0.3px',
                          textTransform: 'uppercase', border: '1.5px solid #4a90d9',
                          borderRadius: 4, padding: '2px 6px', width: '100%', maxWidth: 340,
                          outline: 'none', background: '#f0f7ff', fontFamily: 'inherit'
                        }}
                      />
                      <span
                        onClick={saveTitleEdit}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#2ecc71', flexShrink: 0 }}
                        title="Salva (Invio)"
                      >✔</span>
                      <span
                        onClick={() => setShowTitleEditor(false)}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#e74c3c', flexShrink: 0 }}
                        title="Annulla (Esc)"
                      >✖</span>
                      <span style={{ fontSize: 12, color: titleEditorValue.length > maxCharsFor2Lines ? '#e74c3c' : '#888', flexShrink: 0 }}>
                        {titleEditorValue.length}/{maxCharsFor2Lines}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{displayName}</span>
                      {isTitleTooLong && (
                        <span style={{ fontSize: 16, cursor: 'default' }} title="Titolo troppo lungo">🚨</span>
                      )}
                      <span
                        onClick={openTitleEditor}
                        style={{ cursor: 'pointer', fontSize: 14 }}
                        title="Modifica titolo"
                      >✏️</span>
                      <span style={{
                        fontSize: 12,
                        color: isTitleTooLong ? '#e74c3c' : '#888',
                        fontWeight: isTitleTooLong ? 700 : 400
                      }}>
                        {displayCharsCount}/{maxCharsFor2Lines}
                      </span>
                    </div>
                  )}
                </div>
                {first.nameJp && <div className="portal-detail-title-jp">{first.nameJp}</div>}
                <div className="portal-detail-attrs">
                  <span>🏭 {first.wineryJp || first.winery}</span>
                  {first.category && <span>🍶 {first.category}</span>}
                  {first.countryOfOrigin && <span>🇯🇵 {first.countryOfOrigin}</span>}
                </div>
                <div className="portal-detail-sizes">
                  {items.filter(i => i.volumeMl).map(i => (
                    <span key={i._recordId} className="portal-detail-size">{i.volumeMl}ml · {i.code}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Ingredients + Alcohol */}
          <div className="portal-card">
            <div className="portal-card-head">
              <span className="portal-card-title">🍶 {jp ? '原材料・アルコール' : 'Ingredienti & Alcool'}</span>
              {saved && <span className="portal-card-saved">✓ {jp ? '保存済' : 'Salvato'}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--portal-ink-muted)', minWidth: 70 }}>
                {jp ? 'アルコール' : 'Alcool'}
              </span>
              <input className="portal-input" style={{ width: 60, fontSize: 14, padding: '6px 8px' }}
                value={ed.alcoholPct ?? ''} onChange={e => updateField('alcoholPct', normalizeNumeric(e.target.value))} />
              <span style={{ fontSize: 12, color: 'var(--portal-ink-muted)' }}>% vol</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--portal-ink-muted)' }}>
                {jp ? '原材料' : 'Ingredienti'}
              </span>
              {/* Suggestion button — only when field is empty and suggestion exists */}
              {(() => {
                const suggestion = getIngredientSuggestion(first.category, first.name)
                const currentVal = (ed.ingredientsIt || '').trim()
                if (!suggestion || currentVal) return null
                const displayText = jp ? suggestion.jp : suggestion.it
                return (
                  <button onClick={() => {
                    updateField('ingredientsIt', suggestion.it)
                    scheduleAutosave()
                  }} style={{
                    padding: '2px 8px', fontSize: 10, fontWeight: 600,
                    background: 'var(--portal-ok-bg)', color: 'var(--portal-ok)',
                    border: '1px solid #c8e6c9', borderRadius: 4, cursor: 'pointer',
                    fontFamily: 'var(--portal-font)', transition: 'background 0.12s',
                  }}>
                    {jp ? '提案を使用' : 'Usa suggerimento'}: {displayText.length > 35 ? displayText.slice(0, 35) + '...' : displayText}
                  </button>
                )
              })()}
            </div>
            <textarea className="portal-textarea" rows={2}
              value={ed.ingredientsIt || ''}
              onChange={e => updateField('ingredientsIt', e.target.value)}
              placeholder={jp ? '例: 米、米麹、水、醸造アルコール' : 'es: Riso, koji, acqua, alcol distillato'}
            />
            <div className="portal-note">{jp ? '自動翻訳: IT → EN, DE, FR, ES' : 'Traduzione automatica: IT → EN, DE, FR, ES'}</div>
          </div>

          {/* Nutrition */}
          <div className="portal-card">
            <div className="portal-card-head">
              <span className="portal-card-title">📊 {jp ? '栄養成分' : 'Nutrizione'} <span style={{ fontWeight: 400, color: 'var(--portal-ink-muted)' }}>(per 100ml)</span></span>
            </div>
            <div className="portal-nutrition-grid">
              {NUTRITION_FIELDS.map(f => (
                <div key={f.key} className="portal-nutrition-row">
                  <span className={`portal-nutrition-label ${f.sub ? 'portal-nutrition-label--sub' : ''}`}>
                    {jp ? f.label : f.labelIt}
                  </span>
                  <div className="portal-nutrition-value">
                    <input className="portal-input" style={{ width: 56 }}
                      value={ed[f.key] ?? ''}
                      onChange={e => updateField(f.key, normalizeNumeric(e.target.value))} />
                    <span className="portal-nutrition-unit">{f.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="portal-note">{jp ? '⚡ kJ ↔ kcal 自動計算' : '⚡ kJ ↔ kcal calcolati automaticamente'}</div>
          </div>

          {/* EAN per format */}
          <div className="portal-card">
            <div className="portal-card-title" style={{ marginBottom: 12 }}>📦 {jp ? '物流 / EAN' : 'Logistica / EAN'}</div>
            {items.map(item => {
              const eanVal = eanData[item._recordId] || ''
              const eanBoxVal = eanBoxData[item._recordId] || ''
              const eanCheck = validateBarcode(eanVal, 'EAN Bottiglia')
              const eanBoxCheck = validateBarcode(eanBoxVal, 'EAN Box')
              return (
              <div key={item._recordId} className="portal-format-block">
                <div className="portal-format-title">{item.volumeMl}ml · {item.code}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)', marginBottom: 2 }}>EAN {jp ? 'ボトル' : 'Bottiglia'}</div>
                    <input className="portal-input"
                      style={{
                        width: '100%', textAlign: 'left', boxSizing: 'border-box',
                        borderColor: !eanCheck.valid ? 'var(--portal-warn)' : undefined,
                        background: !eanCheck.valid ? 'var(--portal-warn-bg)' : undefined,
                      }}
                      value={eanVal} onChange={e => updateEan(item._recordId, e.target.value)}
                      placeholder="4901524..."
                      title={eanCheck.issue || ''} />
                    {!eanCheck.valid && (
                      <div style={{ fontSize: 9, color: 'var(--portal-warn)', marginTop: 2 }}>⚠ {eanCheck.type === 'invalid_checksum' ? 'Checksum EAN13 non valido' : 'Formato non valido'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)', marginBottom: 2 }}>EAN/ITF-14 Box</div>
                    <input className="portal-input"
                      style={{
                        width: '100%', textAlign: 'left', boxSizing: 'border-box',
                        borderColor: !eanBoxCheck.valid ? 'var(--portal-warn)' : undefined,
                        background: !eanBoxCheck.valid ? 'var(--portal-warn-bg)' : undefined,
                      }}
                      value={eanBoxVal} onChange={e => updateEanBox(item._recordId, e.target.value)}
                      placeholder="EAN 13 o ITF-14"
                      title={eanBoxCheck.issue || ''} />
                    {!eanBoxCheck.valid && (
                      <div style={{ fontSize: 9, color: 'var(--portal-warn)', marginTop: 2 }}>⚠ {eanBoxCheck.type === 'invalid_checksum' ? 'Checksum EAN13 non valido' : 'Formato non valido'}</div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)', marginBottom: 2 }}>{jp ? '入数' : 'Bottiglie/box'}</div>
                  <input className="portal-input" style={{ width: 56 }}
                    value={bpbData[item._recordId] || ''} onChange={e => updateBpb(item._recordId, normalizeNumeric(e.target.value))} />
                </div>
              </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT: Print + Preview */}
        <div className="portal-product-right">
          {/* Print config */}
          <div className="portal-card">
            <div className="portal-card-title" style={{ marginBottom: 12 }}>🖨 {jp ? '印刷設定' : 'Stampa'}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div className="portal-field-label">{jp ? '言語' : 'Lingua'}</div>
                <select className="portal-select" value={printLang} onChange={e => setPrintLang(e.target.value)}>
                  {LANG_OPTIONS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
              <div>
                <div className="portal-field-label">{jp ? '地域' : 'Regione'}</div>
                <select className="portal-select" value={printRegion} onChange={e => setPrintRegion(e.target.value)}>
                  {Object.entries(REGION_CODE_LABELS).map(([c, info]) => <option key={c} value={c}>{info.label}</option>)}
                </select>
              </div>
            </div>

            {/* Importer */}
            <div style={{ marginBottom: 8 }}>
              <div className="portal-field-label">{jp ? '輸入者' : 'Importatore'}</div>
              <select className="portal-select" value={printImporterId} onChange={e => {
                if (e.target.value === '__new__') { setShowNewImp(true); return }
                setPrintImporterId(e.target.value)
              }}>
                {importerList.map(i => <option key={i.id} value={i.id}>{i.name || '—'}</option>)}
                <option value="__new__">+ {jp ? '新規追加' : 'Nuovo importatore'}</option>
              </select>
            </div>

            {/* Inline new importer form */}
            {showNewImp && (
              <div style={{ background: 'var(--portal-paper-warm)', borderRadius: 'var(--portal-radius)', padding: 12, marginBottom: 10, border: '1px solid var(--portal-border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{jp ? '新しい輸入者' : 'Nuovo importatore'}</div>
                <input className="portal-input" style={{ width: '100%', textAlign: 'left', marginBottom: 6, boxSizing: 'border-box' }}
                  value={newImp.name} onChange={e => setNewImp(p => ({ ...p, name: e.target.value }))}
                  placeholder={jp ? '会社名' : 'Nome azienda'} />
                <input className="portal-input" style={{ width: '100%', textAlign: 'left', marginBottom: 6, boxSizing: 'border-box' }}
                  value={newImp.address} onChange={e => setNewImp(p => ({ ...p, address: e.target.value }))}
                  placeholder={jp ? '住所' : 'Indirizzo'} />
                <input className="portal-input" style={{ width: '100%', textAlign: 'left', marginBottom: 8, boxSizing: 'border-box' }}
                  value={newImp.website} onChange={e => setNewImp(p => ({ ...p, website: e.target.value }))}
                  placeholder="sito web (opzionale)" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="portal-btn portal-btn--primary" style={{ flex: 1, padding: '8px 12px', fontSize: 12 }} onClick={handleAddImporter}>
                    {jp ? '追加' : 'Aggiungi'}
                  </button>
                  <button className="portal-btn" style={{ flex: 0, padding: '8px 12px', fontSize: 12, background: 'var(--portal-paper)', color: 'var(--portal-ink-soft)' }}
                    onClick={() => setShowNewImp(false)}>
                    {jp ? 'キャンセル' : 'Annulla'}
                  </button>
                </div>
                <Link to="/importers" style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--portal-accent)', textAlign: 'center' }}>
                  {jp ? '全て管理 →' : 'Gestisci tutti →'}
                </Link>
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="portal-field-label">Per:</div>
                <div style={{ fontSize: 9, color: perText.length > 35 ? 'var(--portal-warn)' : 'var(--portal-ink-muted)' }}>
                  {perText.length}/35
                </div>
              </div>
              <input className="portal-input"
                style={{
                  width: '100%', textAlign: 'left', boxSizing: 'border-box',
                  borderColor: perText.length > 35 ? 'var(--portal-warn)' : undefined,
                }}
                maxLength={35}
                value={perText}
                onChange={e => setPerText(e.target.value)}
                placeholder={jp ? '例: Xin Shi 88 srl' : 'es. Xin Shi 88 srl'} />
              {perText.length > 35 && (
                <div style={{ fontSize: 9, color: 'var(--portal-warn)', marginTop: 2 }}>
                  ⚠ {jp ? '文字数制限超過' : 'Troppo lungo, verra troncato'}
                </div>
              )}
            </div>
          </div>

          {/* Format selector — prominent toggle buttons */}
          <div className="portal-card">
            <div className="portal-field-label" style={{ marginBottom: 6 }}>{jp ? 'サイズ選択 — プレビュー＆印刷' : 'Formato — preview e stampa'}</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {items.map((item, idx) => {
                const isActive = printFormat === idx
                const itemEan = eanData[item._recordId] || ''
                return (
                  <button key={item._recordId} onClick={() => setPrintFormat(idx)}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 'var(--portal-radius)', cursor: 'pointer',
                      border: isActive ? '2px solid var(--portal-ink)' : '1.5px solid var(--portal-border)',
                      background: isActive ? 'var(--portal-ink)' : 'white',
                      color: isActive ? 'white' : 'var(--portal-ink)',
                      fontFamily: 'var(--portal-font)', fontSize: 12, fontWeight: 600,
                      transition: 'all 0.12s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    }}>
                    <span>{item.volumeMl}ml</span>
                    <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>{item.code}</span>
                    {!itemEan && <span style={{ fontSize: 8, color: isActive ? '#ffb3b3' : 'var(--portal-warn)' }}>⚠ EAN</span>}
                  </button>
                )
              })}
            </div>

            {/* Status check */}
            {canPrint ? (
              <div style={{ background: 'var(--portal-ok-bg)', borderRadius: 'var(--portal-radius-sm)', padding: '6px 8px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--portal-ok)', fontWeight: 600, textAlign: 'center' }}>
                  ✅ {currentItem?.volumeMl}ml — {jp ? '印刷可能' : 'Pronto per la stampa'}
                </div>
                {/* Info about optional fields */}
                {(!hasEan || !hasNutrition || !hasEanBox) && (
                  <div style={{ fontSize: 9, color: 'var(--portal-ink-muted)', textAlign: 'center', marginTop: 2 }}>
                    {!hasEan && `${jp ? 'EANボトル未入力 → バーコードなし' : 'EAN bottiglia mancante → senza barcode'}. `}
                    {!hasEanBox && `${jp ? 'EAN Box未入力 → Boxバーコードなし' : 'EAN box mancante → box senza barcode'}. `}
                    {!hasNutrition && `${jp ? '栄養未入力 → QRのみ' : 'Nutrizione mancante → solo QR'}. `}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: 'var(--portal-warn-bg)', borderRadius: 'var(--portal-radius-sm)', padding: '6px 8px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--portal-warn)', fontWeight: 600 }}>
                  ⚠ {jp ? '印刷不可 — 必須項目が不足' : 'Stampa disabilitata — mancano'}:
                  {!hasIngredients && ` ${jp ? '原材料' : 'Ingredienti'}`}
                  {!hasAlcohol && ` ${jp ? 'アルコール' : 'Alcool'}`}
                  {isTitleTooLong && ` ${jp ? '商品名が長すぎます' : 'Nome prodotto troppo lungo'}`}
                </div>
              </div>
            )}

            {/* Print buttons — both always visible, disabled only if missing alcohol/ingredients */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="portal-btn portal-btn--primary" style={{ flex: 1, fontSize: 11, padding: '8px 10px' }}
                onClick={() => handlePrint(false)} disabled={generating || !canPrint}>
                {generating ? '...' : `🖨 ${currentItem?.volumeMl}ml ${jp ? 'ボトル' : 'Bottiglia'}`}
              </button>
              <button className="portal-btn portal-btn--secondary" style={{ flex: 1, fontSize: 11, padding: '8px 10px' }}
                onClick={() => handlePrint(true)} disabled={generating || !canPrint}>
                {`📦 ${currentItem?.volumeMl}ml Box`}
              </button>
            </div>
          </div>

          {/* Preview with Bottle/Box toggle */}
          {(() => {
            const previewBarcode = previewMode === 'box'
              ? (currentItem ? (eanBoxData[currentItem._recordId] || '') : '')
              : (currentItem ? (eanData[currentItem._recordId] || '') : '')
            const previewBpb = currentItem ? (bpbData[currentItem._recordId] || '') : ''

            const previewContent = (
              <>
                {/* Bottle / Box toggle */}
                <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'var(--portal-paper)', borderRadius: 'var(--portal-radius-sm)', padding: 2 }}>
                  <button onClick={() => setPreviewMode('bottle')} style={{
                    flex: 1, padding: '5px 8px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                    borderRadius: 4, fontFamily: 'var(--portal-font)', transition: 'all 0.12s',
                    background: previewMode === 'bottle' ? 'var(--portal-ink)' : 'transparent',
                    color: previewMode === 'bottle' ? 'white' : 'var(--portal-ink-muted)',
                  }}>
                    🍶 {jp ? 'ボトル' : 'Bottiglia'}
                  </button>
                  <button onClick={() => setPreviewMode('box')} style={{
                    flex: 1, padding: '5px 8px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer',
                    borderRadius: 4, fontFamily: 'var(--portal-font)', transition: 'all 0.12s',
                    background: previewMode === 'box' ? 'var(--portal-ink)' : 'transparent',
                    color: previewMode === 'box' ? 'white' : 'var(--portal-ink-muted)',
                  }}>
                    📦 Box
                  </button>
                </div>
                <LabelPreview
                  name={first.name || ''}
                  category={detailedCategory || first.category || ''}
                  legalDescription={legalDesc}
                  ingredients={previewIngredients}
                  alcoholPct={ed.alcoholPct || ''}
                  volumeMl={currentItem?.volumeMl || ''}
                  code={currentItem?.code || ''}
                  barcode={previewBarcode}
                  countryOfOrigin={first.countryOfOrigin || 'Japan'}
                  importer={selectedImporter}
                  perText={perText}
                  lang={printLang}
                  isBox={previewMode === 'box'}
                  bottlesPerBox={previewBpb}
                />
              </>
            )

            return (
              <>
                {/* Desktop: always visible */}
                <div className="portal-preview-desktop">
                  <div className="portal-card">
                    <div className="portal-card-head">
                      <span className="portal-card-title">👁 {jp ? 'プレビュー' : 'Preview'}</span>
                      <span style={{ fontSize: 10, color: 'var(--portal-ink-muted)' }}>55mm × auto</span>
                    </div>
                    {previewContent}
                    <div className="portal-note" style={{ textAlign: 'center', marginTop: 8 }}>
                      {jp ? 'データ変更でリアルタイム更新' : 'Si aggiorna live con le modifiche'}
                    </div>
                  </div>
                </div>

                {/* Mobile: toggle */}
                <div className="portal-preview-mobile">
                  <button className="portal-btn" style={{ width: '100%', background: 'var(--portal-paper)', color: 'var(--portal-ink-soft)', marginBottom: 10 }}
                    onClick={() => setShowPreviewMobile(v => !v)}>
                    {showPreviewMobile
                      ? (jp ? '👁 プレビューを隠す' : '👁 Nascondi preview')
                      : (jp ? '👁 プレビューを表示' : '👁 Mostra preview')
                    }
                  </button>
                  {showPreviewMobile && (
                    <div className="portal-card">{previewContent}</div>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </div>

    </div>
  )
}
