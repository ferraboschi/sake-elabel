import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchProducts, updateProduct, isAirtableConfigured, composeProductTypeString, parseProductTypeString } from '../../services/airtable'
import { translateIngredients as autoTranslate, autoFillIngredients } from '../../services/ingredientTranslator'
import { useGenerateLabel } from '../../hooks/useGenerateLabel'
import { downloadLabelPDF, downloadBoxLabelPDF } from '../../services/labelPrinter'
import { isValidEAN13, detectBarcodeFormat } from '../../services/barcodeGenerator'
import { estimateTitleLines, getMaxCharsFor2Lines } from '../../config/constants'
import { recordProductChange } from '../../services/productChangeTracker'
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
  junmai:       { it: 'riso, riso maltato (koji), acqua',                            jp: '米、米麹、水' },
  nonJunmai:    { it: 'riso, riso maltato (koji), acqua, alcol distillato',          jp: '米、米麹、水、醸造アルコール' },
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
  if (cat.includes('futsushu') || cat.includes('tokubetsu honjozo') || cat.includes('honjozo') || cat.includes('daiginjo') || cat.includes('ginjo')) return INGREDIENT_SUGGESTIONS.nonJunmai
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

// ── Sake product types (Tipologia) ──
const SAKE_TYPE_OPTIONS = [
  '', // empty = no type selected
  'Daiginjo', 'Ginjo', 'Junmai', 'Junmai Daiginjo', 'Junmai Ginjo',
  'Junmai Genshu', 'Honjozo', 'Tokubetsu Honjozo', 'Tokubetsu Junmai',
  'Futsushu', 'Sparkling', 'Ai frutti', 'Shochu', 'Gin', 'Whisky',
  'Awamori', 'Rum', 'Vodka', 'Birra', 'Vino',
]

// ── Sake finishes (Finiture) — toggleable tags ──
const SAKE_FINISH_OPTIONS = [
  'Koshu', 'Nama', 'Nigori', 'Genshu', 'Kimoto', 'Yamahai',
  'Muroka', 'Sparkling', 'Tokubetsu',
]

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
  const [lotData, setLotData] = useState({})

  // Title editor modal
  const [showTitleEditor, setShowTitleEditor] = useState(false)
  const [titleEditorValue, setTitleEditorValue] = useState('')

  // Product type / finishes editor
  const [showTypeEditor, setShowTypeEditor] = useState(false)

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
  // Keep track of known record IDs so we can find the product even after a name/slug change
  const knownRecordIds = useRef([])
  // Track IME composition state so Enter during composition confirms characters, not saves
  const titleComposingRef = useRef(false)
  // Track whether the component is still mounted to prevent stale alerts/setState
  const mountedRef = useRef(true)

  const first = items[0] || {}

  // Load product
  useEffect(() => { if (slug) loadProduct() }, [slug])

  // Cancel pending autosave on unmount (in-app navigation) and mark as unmounted
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
        console.log('[unmount] Cancelled pending autosave — saving via sendBeacon')
        // Fire-and-forget save via sendBeacon for pending changes during SPA navigation.
        // We cannot use async fetch here because the component is already unmounting.
        // sendBeacon is reliable even during page teardown.
        if (saveRef.current?._pendingPayloads) {
          const payloads = saveRef.current._pendingPayloads()
          if (payloads && payloads.length > 0) {
            const API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || ''
            const PROXY_URL = import.meta.env.VITE_AIRTABLE_PROXY_URL || ''
            const USE_PROXY = !!PROXY_URL
            const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'appwCWGRd0jXOCxMA'
            const TABLE_ID = 'tblilRsJLHIVJ1xju'
            const apiBase = USE_PROXY
              ? `${PROXY_URL.replace(/\/$/, '')}/api/airtable/v0`
              : 'https://api.airtable.com/v0'
            for (const { recordId, fields } of payloads) {
              const url = `${apiBase}/${BASE_ID}/${TABLE_ID}/${recordId}`
              const blob = new Blob(
                [JSON.stringify({ fields, typecast: true })],
                { type: 'application/json' }
              )
              // Note: sendBeacon doesn't support custom headers, so this only works
              // with the proxy (which injects auth server-side). For direct Airtable
              // calls in dev, we fall back to a keepalive fetch.
              if (USE_PROXY) {
                navigator.sendBeacon(url, blob)
              } else {
                fetch(url, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
                  body: JSON.stringify({ fields, typecast: true }),
                  keepalive: true,
                }).catch(() => {}) // Silently ignore — best-effort save during navigation
              }
            }
            console.log('[unmount] Sent', payloads.length, 'beacon save(s)')
          }
        }
      }
    }
  }, [])

  // Flush autosave before page unload (browser close / external navigation)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
        console.log('[beforeunload] Flushing pending autosave via sendBeacon')
        // Use the same beacon approach as unmount — async fetch won't complete on page close
        if (saveRef.current?._pendingPayloads) {
          const payloads = saveRef.current._pendingPayloads()
          if (payloads && payloads.length > 0) {
            const API_KEY = import.meta.env.VITE_AIRTABLE_API_KEY || ''
            const PROXY_URL = import.meta.env.VITE_AIRTABLE_PROXY_URL || ''
            const USE_PROXY = !!PROXY_URL
            const BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || 'appwCWGRd0jXOCxMA'
            const TABLE_ID = 'tblilRsJLHIVJ1xju'
            const apiBase = USE_PROXY
              ? `${PROXY_URL.replace(/\/$/, '')}/api/airtable/v0`
              : 'https://api.airtable.com/v0'
            for (const { recordId, fields } of payloads) {
              const url = `${apiBase}/${BASE_ID}/${TABLE_ID}/${recordId}`
              if (USE_PROXY) {
                const blob = new Blob(
                  [JSON.stringify({ fields, typecast: true })],
                  { type: 'application/json' }
                )
                navigator.sendBeacon(url, blob)
              } else {
                fetch(url, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
                  body: JSON.stringify({ fields, typecast: true }),
                  keepalive: true,
                }).catch(() => {})
              }
            }
          }
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const loadProduct = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      if (isAirtableConfigured()) {
        const all = await fetchProducts()
        if (all) {
          const decoded = decodeURIComponent(slug)

          // 1. Try exact slug match
          let match = all.find(p => p.slug === decoded)

          // 2. Try exact code match (e.g. URL is just "SC001")
          if (!match) {
            match = all.find(p => p.code === decoded.toUpperCase())
          }

          // 3. Try extracting code suffix from slug (slug format: "name-parts-CODE")
          //    This handles the case where the product name changed and the slug no longer matches
          if (!match) {
            const parts = decoded.split('-')
            const codeSuffix = parts[parts.length - 1]?.toUpperCase()
            if (codeSuffix) {
              match = all.find(p => p.code === codeSuffix)
            }
          }

          // 4. Try matching by known record IDs from a previous load
          if (!match && knownRecordIds.current.length) {
            match = all.find(p => knownRecordIds.current.includes(p._recordId))
          }

          if (match) {
            console.log('[loadProduct] Found product:', match.name, 'slug:', match.slug, 'code:', match.code)
            const siblings = all.filter(p => p.name === match.name)
              .sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0))
            setItems(siblings)

            // Store record IDs so we can find them again after a rename
            knownRecordIds.current = siblings.map(s => s._recordId)

            const f = siblings[0]

            // Parse product type / finishes from Airtable or from the category field
            const savedTypeCurrent = f.productTypeCurrent || ''
            const savedFinishes = f.productFinishes || ''
            const typeOriginal = f.typeOriginal || `(${f.category || ''})`
            const isTypeModified = f.typeModifiedFlag || false

            // If there's a saved modified type, use it; otherwise derive from category
            let initProductType = ''
            let initFinishes = []
            if (savedTypeCurrent) {
              // User previously edited: use saved values
              initProductType = savedTypeCurrent
              initFinishes = savedFinishes ? savedFinishes.split(/\s+/).filter(Boolean) : []
            } else {
              // First time: derive from the original category field
              const parsed = parseProductTypeString(f.category || '', SAKE_TYPE_OPTIONS.filter(Boolean))
              initProductType = parsed.productType
              initFinishes = parsed.finishes
            }

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
              // Product type / finishes
              productTypeModified: initProductType,
              finishesModified: initFinishes,
              productTypeOriginal: typeOriginal,
              typeModifiedFlag: isTypeModified,
            })
            const ean = {}, ebox = {}, bpb = {}, lot = {}
            for (const s of siblings) {
              ean[s._recordId] = s.barcode || ''
              ebox[s._recordId] = s.barcodeBox || ''
              bpb[s._recordId] = s.bottlesPerBox || ''
              lot[s._recordId] = ''
            }
            setEanData(ean)
            setEanBoxData(ebox)
            setBpbData(bpb)
            setLotData(lot)

            // If the slug changed (e.g. after a title rename), update the URL silently
            if (match.slug !== decoded) {
              console.log('[loadProduct] Slug changed, updating URL:', decoded, '->', match.slug)
              navigate(`/portal/product/${encodeURIComponent(match.slug)}`, { replace: true })
            }
          } else {
            console.warn('[loadProduct] No product found for slug:', decoded)
          }
        }
      }
    } catch (err) { console.error('[PortalProduct]', err) }
    if (!silent) setLoading(false)
  }

  // Build the Airtable payload for all items (used by doSave and by beacon saves on unmount)
  const buildPayloads = () => {
    if (!items.length) return []
    const d = ed
    const payload = {}
    for (const f of NUTRITION_FIELDS) {
      payload[f.key] = parseFloat(normalizeNumeric(String(d[f.key]))) || 0
    }
    payload.ingredientsIt = normalizeFullWidth(d.ingredientsIt) || ''
    const raw = payload.ingredientsIt
    if (raw) {
      for (const [l, suf] of Object.entries({ en: 'En', de: 'De', fr: 'Fr', es: 'Es' })) {
        const { text } = autoTranslate(raw, l)
        if (text) payload[`ingredients${suf}`] = text
      }
    }
    const alc = parseFloat(normalizeNumeric(String(d.alcoholPct)))
    if (!isNaN(alc) && alc >= 0) payload.alcoholPct = alc
    if (d.editedName && d.editedName.trim()) {
      payload.productName = d.editedName.trim()
    }
    if (d.productTypeModified !== undefined) {
      const combinedType = composeProductTypeString(d.productTypeModified, d.finishesModified || [])
      payload.productTypeCurrent = d.productTypeModified || ''
      payload.productFinishes = (d.finishesModified || []).join(' ')
      const originalClean = (d.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
      payload.typeModifiedFlag = combinedType !== originalClean
      if (!d.productTypeOriginal && first.category) {
        payload.typeOriginal = `(${first.category})`
      }
    }

    // Map internal keys to Airtable field names (same logic as updateProduct in airtable.js)
    // This is needed for beacon saves which bypass the updateProduct abstraction.
    const FIELDS_MAP = {
      energyKj: 'Energy_kJ', energyKcal: 'Energy_kcal', fatG: 'Fat_g',
      saturatedFatG: 'Saturates_g', carbsG: 'Carbohydrates_g', sugarsG: 'Sugars_g',
      proteinG: 'Protein_g', saltG: 'Salt_g', ingredientsIt: 'Ingredients_IT',
      ingredientsEn: 'Ingredients_EN', ingredientsDe: 'Ingredients_DE',
      ingredientsFr: 'Ingredients_FR', ingredientsEs: 'Ingredients_ES',
      alcoholPct: 'Alcohol %', productName: 'Product Name', barcode: 'Barcode',
      ean: 'codice EAN', eanBox: 'EAN_Box', bottlesPerBox: 'Bottles per box',
    }

    return items.map(item => {
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

      // Convert to Airtable field names for beacon saves
      const airtableFields = {}
      for (const [key, value] of Object.entries(ip)) {
        const fieldName = FIELDS_MAP[key]
        if (fieldName && value !== undefined) {
          airtableFields[fieldName] = value
        }
      }

      return { recordId: item._recordId, fields: airtableFields }
    })
  }

  // Autosave - use ref to always get latest state
  const doSave = async () => {
    console.log('[doSave] Starting save, ed.editedName:', ed.editedName)
    if (!items.length) return
    if (mountedRef.current) setSaving(true)
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
        console.log('[doSave] Saving title:', d.editedName.trim())
        payload.productName = d.editedName.trim()
      } else {
        console.log('[doSave] Not saving title (editedName is empty or falsy)')
      }

      // Save product type / finishes
      if (d.productTypeModified !== undefined) {
        const combinedType = composeProductTypeString(d.productTypeModified, d.finishesModified || [])
        payload.productTypeCurrent = d.productTypeModified || ''
        payload.productFinishes = (d.finishesModified || []).join(' ')
        // Compare with original to set modified flag
        const originalClean = (d.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
        const isModified = combinedType !== originalClean
        payload.typeModifiedFlag = isModified
        if (!d.productTypeOriginal && first.category) {
          payload.typeOriginal = `(${first.category})`
        }
        console.log('[doSave] Type:', combinedType, 'Original:', originalClean, 'Modified:', isModified)
      }

      console.log('[doSave] Payload:', payload)
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
        console.log('[doSave] Updating item', item._recordId, 'with payload:', ip)
        try {
          await updateProduct(item._recordId, ip)
          console.log('[doSave] Item updated successfully:', item._recordId)
        } catch (updateErr) {
          // If component already unmounted, don't throw — the save was best-effort
          if (!mountedRef.current) {
            console.warn('[doSave] Save failed after unmount (expected during navigation):', updateErr.message)
            return
          }
          console.error('[doSave] Failed to update item', item._recordId, updateErr)
          throw updateErr
        }
      }
      if (mountedRef.current) setSaved(true)
      recordProductChange(first.code, d.editedName || first.name, d.productTypeModified || first.category, d.finishesModified || [])
      console.log('[doSave] Save completed successfully')
    } catch (err) {
      console.error('[Save]', err)
      // Only show alert if component is still mounted — prevents stale error dialogs
      // after navigating away from the product page
      if (mountedRef.current) {
        alert(`Save error: ${err.message}`)
      }
    }
    if (mountedRef.current) setSaving(false)
  }

  saveRef.current = doSave
  // Expose payload builder for beacon saves during unmount/beforeunload
  saveRef.current._pendingPayloads = buildPayloads

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
  const updateLot = (id, v) => { setLotData(p => ({ ...p, [id]: v })) }

  // Title editor functions
  const openTitleEditor = () => {
    const currentName = ed.editedName || first.name
    setTitleEditorValue(currentName)
    setShowTitleEditor(true)
  }

  const saveTitleEdit = async () => {
    console.log('[saveTitleEdit] titleEditorValue:', titleEditorValue)
    if (titleEditorValue.trim()) {
      const newTitle = titleEditorValue.trim()
      console.log('[saveTitleEdit] saving new title:', newTitle)

      // 1. Cancel any pending autosave to avoid race conditions
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
        console.log('[saveTitleEdit] Cancelled pending autosave')
      }

      // 2. Update state with new title
      setEd(prev => ({ ...prev, editedName: newTitle }))
      setShowTitleEditor(false)

      // 3. Save to Airtable — build a COMPLETE payload (same as doSave) with the new title
      setSaving(true)
      try {
        const payload = { productName: newTitle }

        // Include all current field values (mirror doSave logic)
        for (const f of NUTRITION_FIELDS) {
          payload[f.key] = parseFloat(normalizeNumeric(String(ed[f.key]))) || 0
        }
        payload.ingredientsIt = normalizeFullWidth(ed.ingredientsIt) || ''
        // Auto-translate ingredients
        const raw = payload.ingredientsIt
        if (raw) {
          for (const [l, suf] of Object.entries({ en: 'En', de: 'De', fr: 'Fr', es: 'Es' })) {
            const { text } = autoTranslate(raw, l)
            if (text) payload[`ingredients${suf}`] = text
          }
        }
        const alc = parseFloat(normalizeNumeric(String(ed.alcoholPct)))
        if (!isNaN(alc) && alc >= 0) payload.alcoholPct = alc

        // Include product type / finishes in title save payload
        if (ed.productTypeModified !== undefined) {
          const ct = composeProductTypeString(ed.productTypeModified, ed.finishesModified || [])
          payload.productTypeCurrent = ed.productTypeModified || ''
          payload.productFinishes = (ed.finishesModified || []).join(' ')
          const oc = (ed.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
          payload.typeModifiedFlag = ct !== oc
          if (!ed.productTypeOriginal && first.category) {
            payload.typeOriginal = `(${first.category})`
          }
        }

        // Save for all items (siblings = different sizes of same product)
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

          console.log('[saveTitleEdit] Updating item', item._recordId, 'payload:', ip)
          await updateProduct(item._recordId, ip)
          console.log('[saveTitleEdit] Item saved:', item._recordId)
        }

        setSaved(true)
        recordProductChange(first.code, newTitle, ed.productTypeModified || first.category, ed.finishesModified || [])
        console.log('[saveTitleEdit] Title saved to Airtable successfully')

        // 4. Reload data from Airtable to confirm save persisted
        //    and update the URL if the slug changed (silent = no loading spinner)
        await loadProduct({ silent: true })
        console.log('[saveTitleEdit] Data reloaded from Airtable')
      } catch (err) {
        console.error('[saveTitleEdit] Save failed:', err)
        alert(`Errore nel salvataggio del titolo: ${err.message}`)
      }
      setSaving(false)
    } else {
      setShowTitleEditor(false)
    }
  }

  // Product type / finishes editing helpers
  const updateProductType = (newType) => {
    setEd(prev => ({ ...prev, productTypeModified: newType }))
    scheduleAutosave()
  }

  const toggleFinish = (finish) => {
    setEd(prev => {
      const current = prev.finishesModified || []
      const next = current.includes(finish)
        ? current.filter(f => f !== finish)
        : [...current, finish]
      return { ...prev, finishesModified: next }
    })
    scheduleAutosave()
  }

  // Compute combined type string and check if modified
  const combinedTypeDisplay = composeProductTypeString(ed.productTypeModified || '', ed.finishesModified || [])
  const originalTypeClean = (ed.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
  const isTypeModified = combinedTypeDisplay !== originalTypeClean && combinedTypeDisplay !== ''

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
  const downloadQROnly = async () => {
    const item = items[printFormat] || items[0]
    if (!item) return

    setSaving(true)
    try {
      const regionInfo = REGION_CODE_LABELS[printRegion]
      const qrUrl = `https://label.sakecompany.com/${item.slug}?lang=${printLang}&country=${regionInfo?.label || 'Italia'}`
      const qrCanvas = await QRCode.toCanvas(document.createElement('canvas'), qrUrl, {
        width: 400, errorCorrectionLevel: 'H', margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      const qrDataUrl = qrCanvas.toDataURL('image/png')

      // Download as PNG
      const link = document.createElement('a')
      link.href = qrDataUrl
      link.download = `${item.slug || item.code || 'qr'}-qr.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('QR download error:', err)
      alert('Errore nel download del QR code')
    } finally {
      setSaving(false)
    }
  }

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
      // Use modified type if available, otherwise detect from category
      const cat = combinedTypeDisplay || detectDetailedCategory(item.name, item.category || '', '')
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
        lotNumber: lotData[item._recordId] || '',
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

  // Title validation (needed before canPrint check below)
  const displayName = ed.editedName || first.name || ''
  const titleLines = estimateTitleLines(displayName || '')
  const isTitleTooLong = titleLines > 2
  const maxCharsFor2Lines = getMaxCharsFor2Lines(2)
  const displayCharsCount = (displayName || '').length

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

  // Use modified type if available, otherwise fallback to detected category
  const detailedCategory = combinedTypeDisplay || detectDetailedCategory(first.name, first.category || '', '')
  const legalDesc = first.legalDescription || getDefaultLegalDescription(detailedCategory, printLang)

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
                        onCompositionStart={() => { titleComposingRef.current = true; }}
                        onCompositionEnd={() => { titleComposingRef.current = false; }}
                        onKeyDown={e => {
                          // During IME composition, Enter confirms the composition — do not save
                          if (titleComposingRef.current) return;
                          if (e.key === 'Enter') { e.preventDefault(); saveTitleEdit(); }
                          if (e.key === 'Escape') { e.preventDefault(); setShowTitleEditor(false); }
                        }}
                        autoFocus
                        style={{
                          fontSize: 'inherit', fontWeight: 700, letterSpacing: '0.3px',
                          border: '1.5px solid #4a90d9',
                          borderRadius: 4, padding: '2px 6px', width: '100%', maxWidth: 340,
                          outline: 'none', background: '#f0f7ff', fontFamily: 'inherit'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => saveTitleEdit()}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#2ecc71', flexShrink: 0, background: 'none', border: 'none', padding: '2px 4px', lineHeight: 1 }}
                        title="Salva (Invio)"
                      >✔</button>
                      <button
                        type="button"
                        onClick={() => setShowTitleEditor(false)}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#e74c3c', flexShrink: 0, background: 'none', border: 'none', padding: '2px 4px', lineHeight: 1 }}
                        title="Annulla (Esc)"
                      >✖</button>
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
                  {(combinedTypeDisplay || first.category) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      🍶 {combinedTypeDisplay || first.category}
                      {isTypeModified && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: '#e67e22',
                          background: '#fef3e2', padding: '1px 5px', borderRadius: 3,
                          border: '1px solid #f0c27a', lineHeight: 1.3,
                        }}>MODIFICATO</span>
                      )}
                      <span
                        onClick={() => setShowTypeEditor(v => !v)}
                        style={{ cursor: 'pointer', fontSize: 13 }}
                        title={jp ? 'Tipologia/Finiture編集' : 'Modifica Tipologia/Finiture'}
                      >✏️</span>
                    </span>
                  )}
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

          {/* Product Type / Finishes Editor */}
          {showTypeEditor && (
            <div className="portal-card" style={{ borderLeft: '3px solid #4a90d9' }}>
              <div className="portal-card-head">
                <span className="portal-card-title">🍶 {jp ? 'Tipologia / Finiture' : 'Tipologia / Finiture'}</span>
                <button
                  onClick={() => setShowTypeEditor(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--portal-ink-muted)', padding: '2px 4px' }}
                  title={jp ? '閉じる' : 'Chiudi'}
                >✖</button>
              </div>

              {/* Tipologia (Product Type) */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--portal-ink-muted)', marginBottom: 4, fontWeight: 600 }}>
                  {jp ? 'Tipologia (種類)' : 'Tipologia'}
                </div>
                <select
                  className="portal-select"
                  value={ed.productTypeModified || ''}
                  onChange={e => updateProductType(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="">— {jp ? '選択なし' : 'Nessuna'} —</option>
                  {SAKE_TYPE_OPTIONS.filter(Boolean).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Finiture (Finishes) — toggle chips */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--portal-ink-muted)', marginBottom: 4, fontWeight: 600 }}>
                  {jp ? 'Finiture (仕上げ)' : 'Finiture'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {SAKE_FINISH_OPTIONS.map(finish => {
                    const isSelected = (ed.finishesModified || []).includes(finish)
                    return (
                      <button
                        key={finish}
                        onClick={() => toggleFinish(finish)}
                        style={{
                          padding: '3px 10px', fontSize: 11, fontWeight: isSelected ? 700 : 400,
                          borderRadius: 12, cursor: 'pointer', transition: 'all 0.12s',
                          fontFamily: 'var(--portal-font)',
                          border: isSelected ? '1.5px solid #4a90d9' : '1px solid var(--portal-border)',
                          background: isSelected ? '#e8f2fc' : 'white',
                          color: isSelected ? '#2a6cb8' : 'var(--portal-ink-soft)',
                        }}
                      >
                        {finish}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Combined result display */}
              <div style={{
                background: 'var(--portal-paper)', borderRadius: 'var(--portal-radius-sm)',
                padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
              }}>
                <div>
                  <span style={{ color: 'var(--portal-ink-muted)' }}>{jp ? '結果' : 'Risultato'}: </span>
                  <strong>{combinedTypeDisplay || (jp ? '(なし)' : '(vuoto)')}</strong>
                </div>
                <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)' }}>
                  <span>{jp ? 'オリジナル' : 'Originale'}: </span>
                  <span>{ed.productTypeOriginal || `(${first.category || ''})`}</span>
                </div>
                {isTypeModified && (
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: '#e67e22',
                    marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    MODIFICATO
                  </div>
                )}
              </div>

              <div className="portal-note" style={{ marginTop: 6 }}>
                {jp ? '保存は自動 (2秒後)' : 'Salvataggio automatico (2 sec)'}
              </div>
            </div>
          )}

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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)', marginBottom: 2 }}>{jp ? '入数' : 'Bottiglie/box'}</div>
                    <input className="portal-input" style={{ width: 56 }}
                      value={bpbData[item._recordId] || ''} onChange={e => updateBpb(item._recordId, normalizeNumeric(e.target.value))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--portal-ink-muted)', marginBottom: 2 }}>{jp ? 'ロット' : 'Lotto'}</div>
                    <input
                      className="portal-input"
                      style={{ width: '100%', textAlign: 'left', boxSizing: 'border-box' }}
                      placeholder={jp ? 'Es: L2026-04' : 'Es: L2026-04'}
                      value={lotData[item._recordId] || ''}
                      onChange={e => updateLot(item._recordId, e.target.value)} />
                  </div>
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
              <button className="portal-btn portal-btn--secondary" style={{ flex: 1, fontSize: 11, padding: '8px 10px' }}
                onClick={() => downloadQROnly()} disabled={generating}>
                {generating ? '...' : `📱 ${currentItem?.volumeMl}ml QR Code`}
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
