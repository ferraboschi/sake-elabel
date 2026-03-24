import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchProducts, updateProduct, isAirtableConfigured } from '../services/airtable'
import { translateIngredients as autoTranslateIngredients, autoFillIngredients } from '../services/ingredientTranslator'
import { useGenerateLabel } from '../hooks/useGenerateLabel'
import { downloadBoxLabelPDF } from '../services/labelPrinter'

const VALID_TOKENS = ['sake2026supplier', 'fornitore2026', 'supplier2026']

// Only show beverage products (exclude books, merch, display items, etc.)
const BEVERAGE_CATEGORIES = new Set([
  'junmai', 'junmai ginjo', 'junmai daiginjo',
  'daiginjo', 'ginjo', 'honjozo',
  'futsushu', 'futushu', 'spirit', 'fruit sake', 'vino',
])

function isBeverage(product) {
  // Has a known beverage category
  if (product.category && BEVERAGE_CATEGORIES.has(product.category.toLowerCase())) return true
  // Has alcohol percentage → it's a drink
  if (product.alcoholPct != null && product.alcoholPct > 0) return true
  // Has a volume in ml (likely a bottle) AND has a winery/producer
  if (product.volumeMl && product.winery) return true
  return false
}

const NUTRITION_FIELDS = [
  { key: 'energyKj', it: 'Energia', jp: 'エネルギー', unit: 'kJ' },
  { key: 'energyKcal', it: 'Energia', jp: 'エネルギー', unit: 'kcal' },
  { key: 'fatG', it: 'Grassi', jp: '脂質', unit: 'g' },
  { key: 'saturatedFatG', it: 'di cui saturi', jp: '飽和脂肪酸', unit: 'g' },
  { key: 'carbsG', it: 'Carboidrati', jp: '炭水化物', unit: 'g' },
  { key: 'sugarsG', it: 'di cui zuccheri', jp: '糖類', unit: 'g' },
  { key: 'proteinG', it: 'Proteine', jp: 'たんぱく質', unit: 'g' },
  { key: 'saltG', it: 'Sale', jp: '食塩相当量', unit: 'g' },
]

// Ingredient suggestions based on product category
const INGREDIENT_SUGGESTIONS = {
  junmai: {
    it: 'Riso, koji (Aspergillus oryzae), acqua',
    jp: '米、米麹、水',
  },
  nonJunmai: {
    it: 'Riso, koji (Aspergillus oryzae), acqua, alcol distillato',
    jp: '米、米麹、水、醸造アルコール',
  },
  // Fruit sake / liqueur suggestions keyed by fruit keyword
  umeshu: {
    it: 'Alcol puro, prugne ume, zucchero',
    jp: '醸造アルコール、梅、砂糖',
  },
  yuzu: {
    it: 'Sake, succo di yuzu, fruttosio',
    jp: '日本酒、柚子果汁、果糖',
  },
  peach: {
    it: 'Sake, succo di pesca, fruttosio',
    jp: '日本酒、桃果汁、果糖',
  },
  mango: {
    it: 'Sake, succo di mango, fruttosio',
    jp: '日本酒、マンゴー果汁、果糖',
  },
  strawberry: {
    it: 'Sake, succo di fragola, fruttosio',
    jp: '日本酒、いちご果汁、果糖',
  },
  pear: {
    it: 'Sake, succo di pera, fruttosio',
    jp: '日本酒、梨果汁、果糖',
  },
  grape: {
    it: 'Sake, succo di uva, fruttosio',
    jp: '日本酒、ぶどう果汁、果糖',
  },
  melon: {
    it: 'Sake, succo di melone, fruttosio',
    jp: '日本酒、メロン果汁、果糖',
  },
  ginger: {
    it: 'Sake, zenzero, zucchero',
    jp: '日本酒、生姜、砂糖',
  },
  matcha: {
    it: 'Sake, matcha, zucchero',
    jp: '日本酒、抹茶、砂糖',
  },
  sakura: {
    it: 'Sake, fiore di ciliegio, zucchero',
    jp: '日本酒、桜、砂糖',
  },
  genericFruit: {
    it: 'Sake, frutta, fruttosio',
    jp: '日本酒、果実、果糖',
  },
}

// IT↔JP ingredient translation map
const INGREDIENT_TRANSLATIONS = [
  { it: 'riso', jp: '米' },
  { it: 'koji (aspergillus oryzae)', jp: '米麹' },
  { it: 'koji', jp: '米麹' },
  { it: 'acqua', jp: '水' },
  { it: 'alcol distillato', jp: '醸造アルコール' },
  { it: 'alcool distillato', jp: '醸造アルコール' },
  { it: 'alcol', jp: '醸造アルコール' },
  { it: 'sale', jp: '塩' },
  { it: 'zucchero', jp: '砂糖' },
  { it: 'lievito', jp: '酵母' },
  { it: 'acido lattico', jp: '乳酸' },
  { it: 'amido di riso', jp: '米デンプン' },
  { it: 'glucosio', jp: 'ブドウ糖' },
  { it: 'sciroppo di glucosio', jp: 'ブドウ糖果糖液糖' },
  { it: 'prugna', jp: '梅' },
  { it: 'yuzu', jp: 'ゆず' },
  { it: 'miele', jp: 'はちみつ' },
]

function translateIngredients(text, fromLang) {
  if (!text || !text.trim()) return ''
  const sep = fromLang === 'jp' ? '、' : ','
  const parts = text.split(sep).map(s => s.trim()).filter(Boolean)
  const translated = parts.map(part => {
    const lower = part.toLowerCase()
    for (const entry of INGREDIENT_TRANSLATIONS) {
      if (fromLang === 'it' && lower === entry.it.toLowerCase()) return entry.jp
      if (fromLang === 'jp' && part === entry.jp) return entry.it.charAt(0).toUpperCase() + entry.it.slice(1)
    }
    return part // keep untranslated
  })
  return fromLang === 'jp' ? translated.join(', ') : translated.join('、')
}

function isJunmai(category) {
  if (!category) return null // unknown
  const cat = category.toLowerCase()
  if (cat.includes('junmai')) return true
  // Non-junmai sake types: Daiginjo, Ginjo, Honjozo (without Junmai prefix)
  if (cat.includes('daiginjo') || cat.includes('ginjo') || cat.includes('honjozo') || cat.includes('honjōzō')) return false
  if (cat.includes('sake') || cat.includes('nihonshu')) return null // generic sake, unclear
  return null // not sake (e.g., umeshu, liqueur) — no suggestion
}

function getIngredientSuggestion(category, lang, productName) {
  const junmai = isJunmai(category)
  if (junmai === true) return INGREDIENT_SUGGESTIONS.junmai[lang] || ''
  if (junmai === false) return INGREDIENT_SUGGESTIONS.nonJunmai[lang] || ''

  // Fruit Sake / Liqueur: detect fruit from product name or category
  const isFruit = /fruit|frutti|liqueur|liquore/i.test(category || '')
  const nameLower = (productName || '').toLowerCase()
  const catLower = (category || '').toLowerCase()
  if (isFruit || catLower.includes('umeshu') || catLower.includes('yuzushu')
      || /umeshu|yuzu|peach|mango|strawberry|pear|grape|melon|ginger|matcha|sakura/i.test(nameLower)) {
    // Detect specific fruit
    const FRUIT_MAP = [
      { keywords: ['umeshu', 'ume '], key: 'umeshu' },
      { keywords: ['yuzu'], key: 'yuzu' },
      { keywords: ['peach', 'momo', 'momoko', 'pesca'], key: 'peach' },
      { keywords: ['mango'], key: 'mango' },
      { keywords: ['strawberry', 'ichigo', 'fragola'], key: 'strawberry' },
      { keywords: ['pear', 'nashi', 'pera'], key: 'pear' },
      { keywords: ['grape', 'uva'], key: 'grape' },
      { keywords: ['melon'], key: 'melon' },
      { keywords: ['ginger', 'zenzero'], key: 'ginger' },
      { keywords: ['matcha'], key: 'matcha' },
      { keywords: ['sakura', 'cherry', 'ciliegio'], key: 'sakura' },
    ]
    for (const rule of FRUIT_MAP) {
      if (rule.keywords.some(kw => nameLower.includes(kw) || catLower.includes(kw))) {
        return INGREDIENT_SUGGESTIONS[rule.key]?.[lang] || ''
      }
    }
    // Generic fruit sake fallback
    if (isFruit) return INGREDIENT_SUGGESTIONS.genericFruit[lang] || ''
  }

  return '' // no suggestion
}

const T = {
  it: {
    title: 'Portale Fornitori — Valori Nutrizionali',
    subtitle: 'Inserisci i valori nutrizionali per 100ml per ogni prodotto',
    producer: 'Produttore',
    producerPlaceholder: 'Cerca produttore...',
    searchProduct: 'Cerca prodotto',
    searchProductPlaceholder: 'Nome o codice...',
    products: 'prodotti',
    groups: 'gruppi',
    hideConfirmed: 'Nascondi confermati',
    copyFrom: 'Copia da:',
    clickPaste: '— Clicca Incolla sui prodotti destinazione',
    exitCopy: 'Esci da copia',
    howItWorks: 'Come funziona:',
    howItWorksText: 'I prodotti con più pezzature sono raggruppati: compila una volta sola e il salvataggio si applica a tutte le dimensioni. Clicca "Salva ✓" per confermare e nascondere. Per copiare valori su altri prodotti, usa Copia → Incolla.',
    nutritionTitle: 'Valori nutrizionali per 100ml',
    ingredientsLabel: 'Ingredienti',
    ingredientsPlaceholder: 'Es: Riso, koji, acqua...',
    alcoholLabel: 'Alcol',
    productCol: 'Prodotto',
    sizes: 'Pezzature',
    copy: 'Copia',
    copying: 'Copiando...',
    paste: 'Incolla',
    save: 'Salva ✓',
    saving: 'Salvataggio...',
    saved: 'Salvato ✓',
    saveAll: 'Salva tutti',
    savedCount: 'salvati',
    confirmedCount: 'confermati',
    totalCount: 'totali',
    allConfirmed: 'Tutti i prodotti visibili sono stati confermati!',
    confirmedProducts: 'prodotti confermati',
    showAll: 'Mostra tutti i prodotti',
    noProducts: 'Nessun prodotto trovato. Prova a cambiare i filtri.',
    unauthorized: 'Accesso non autorizzato',
    unauthorizedMsg: 'Il link non è valido o è scaduto. Contatta Sake Company per un nuovo link.',
    loading: 'Caricamento prodotti...',
    data: 'dati presenti',
    clearFilter: 'Cancella filtro',
    footer: 'Sake Company srl — Portale Fornitori',
    useSuggestion: 'Usa suggerimento',
    per100ml: 'per 100ml',
    category: 'Categoria',
    progress: 'Avanzamento',
    completed: 'completati',
    remaining: 'da fare',
    of: 'di',
    printLabel: 'Stampa etichetta',
    printBox: 'Stampa box',
    printing: 'Generando...',
    lastSaved: 'Ultimo salvataggio',
    printDone: 'Etichetta scaricata',
    logisticsTitle: '📦 Logistica',
    eanBottle: 'EAN Bottiglia',
    eanBox: 'EAN Box / ITF-14',
    bottlesPerBox: 'Bottiglie per cartone',
    eanBottlePlaceholder: 'EAN 13 cifre',
    eanBoxPlaceholder: 'EAN 13 o ITF-14 (14 cifre)',
    eanBoxNote: 'Il codice box può essere EAN-13 (13 cifre) o ITF-14 (14 cifre, stampato sulla scatola dal produttore giapponese)',
  },
  jp: {
    title: '仕入先ポータル — 栄養成分',
    subtitle: '各製品の100mlあたりの栄養成分を入力してください',
    producer: '蔵元',
    producerPlaceholder: '蔵元を検索...',
    searchProduct: '製品検索',
    searchProductPlaceholder: '製品名またはコード...',
    products: '製品',
    groups: 'グループ',
    hideConfirmed: '確認済みを非表示',
    copyFrom: 'コピー元:',
    clickPaste: '— 貼り付け先で「貼付」をクリック',
    exitCopy: 'コピー終了',
    howItWorks: '使い方:',
    howItWorksText: '同じ製品の異なるサイズはグループ化されます。一度入力すれば全サイズに保存されます。「保存 ✓」で確認・非表示。「コピー」→「貼付」で他の製品に値をコピーできます。',
    nutritionTitle: '100mlあたりの栄養成分',
    ingredientsLabel: '原材料名',
    ingredientsPlaceholder: '例: 米、米麹、水...',
    alcoholLabel: 'アルコール',
    productCol: '製品',
    sizes: 'サイズ',
    copy: 'コピー',
    copying: 'コピー中...',
    paste: '貼付',
    save: '保存 ✓',
    saving: '保存中...',
    saved: '保存済み ✓',
    saveAll: '全て保存',
    savedCount: '保存済み',
    confirmedCount: '確認済み',
    totalCount: '合計',
    allConfirmed: '表示中の全製品が確認済みです！',
    confirmedProducts: '製品確認済み',
    showAll: '全製品を表示',
    noProducts: '製品が見つかりません。フィルターを変更してください。',
    unauthorized: 'アクセス権限がありません',
    unauthorizedMsg: 'リンクが無効または期限切れです。新しいリンクについてはSake Companyにお問い合わせください。',
    loading: '製品を読み込み中...',
    data: 'データ有',
    clearFilter: 'フィルターをクリア',
    footer: 'Sake Company srl — 仕入先ポータル',
    useSuggestion: '提案を使用',
    per100ml: '100mlあたり',
    category: 'カテゴリー',
    progress: '進捗',
    completed: '完了',
    remaining: '残り',
    of: '/',
    printLabel: 'ラベル印刷',
    printBox: 'ボックス印刷',
    printing: '生成中...',
    lastSaved: '最終保存',
    printDone: 'ダウンロード済み',
    logisticsTitle: '📦 物流情報',
    eanBottle: 'EANボトル',
    eanBox: 'EAN Box / ITF-14',
    bottlesPerBox: '箱入り本数',
    eanBottlePlaceholder: 'EAN 13桁',
    eanBoxPlaceholder: 'EAN 13桁 or ITF-14 (14桁)',
    eanBoxNote: 'ケースコードはEAN-13(13桁)またはITF-14(14桁、蔵元が箱に印刷)のいずれか',
  },
}

/**
 * Normalize Japanese full-width numbers and punctuation to ASCII.
 */
function normalizeJapaneseInput(str, isNumeric = false) {
  if (!str && str !== 0) return ''
  let s = String(str)
  s = s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 0x30))
  s = s.replace(/．/g, '.').replace(/，/g, ',').replace(/；/g, ';').replace(/：/g, ':')
  s = s.replace(/（/g, '(').replace(/）/g, ')').replace(/％/g, '%')
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF21 + 0x41 + (ch >= 'ａ' ? 32 : 0)))
  if (isNumeric) {
    s = s.replace(/,/g, '')
    s = s.replace(/[^0-9.\-]/g, '')
    const parts = s.split('.')
    if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('')
  }
  return s
}

function NutritionInput({ label, unit, value, onChange, bg = '#fff', indent = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <label style={{
        fontSize: '12px', color: indent ? '#888' : '#555', fontWeight: indent ? 400 : 500,
        minWidth: '90px', flexShrink: 0,
        paddingLeft: indent ? '12px' : 0,
        fontStyle: indent ? 'italic' : 'normal',
      }}>
        {indent ? '↳ ' : ''}{label}
      </label>
      <input
        type="text" inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        style={{
          flex: 1, padding: '7px 8px', textAlign: 'right',
          border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px',
          background: bg, minWidth: 0, maxWidth: '120px',
        }}
      />
      <span style={{ fontSize: '12px', color: '#888', fontWeight: 500, minWidth: '32px' }}>
        {unit}
      </span>
    </div>
  )
}

export default function SupplierPortal() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || searchParams.get('t') || ''
  const producerParam = searchParams.get('producer') || searchParams.get('p') || ''
  const langParam = searchParams.get('lang') || searchParams.get('l') || ''

  const [lang, setLang] = useState(langParam === 'jp' ? 'jp' : 'it')
  const t = T[lang]

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const [confirmed, setConfirmed] = useState({})
  const [statusFilter, setStatusFilter] = useState('todo') // 'all' | 'todo' | 'done'
  const [copySource, setCopySource] = useState(null) // groupKey
  const [savedAt, setSavedAt] = useState({}) // groupKey → Date
  const [printingGroup, setPrintingGroup] = useState(null)
  const [printingBoxGroup, setPrintingBoxGroup] = useState(null)
  const [printingQRGroup, setPrintingQRGroup] = useState(null)
  const { generate, generating: generatingLabel, generateQR } = useGenerateLabel()
  const [producerFilter, setProducerFilter] = useState(producerParam.replace(/[-_]/g, ' '))
  const [productFilter, setProductFilter] = useState('')

  const isAuthorized = VALID_TOKENS.includes(token)

  useEffect(() => {
    if (!isAuthorized) { setLoading(false); return }
    loadProducts()
  }, [isAuthorized])

  const loadProducts = async () => {
    try {
      setLoading(true)
      const all = await fetchProducts()
      setProducts(all)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Filter to beverages only, then group by name (sibling products = same name, different volumes)
  const beverageProducts = useMemo(() => products.filter(isBeverage), [products])

  const productGroups = useMemo(() => {
    const groups = new Map()
    beverageProducts.forEach(p => {
      const key = p.name || p.slug
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(p)
    })
    // Sort each group by volume descending (largest first)
    for (const [, items] of groups) {
      items.sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0))
    }
    return groups
  }, [beverageProducts])

  const producers = useMemo(() => {
    const map = new Map()
    beverageProducts.forEach(p => {
      if (p.winery && !map.has(p.winery)) map.set(p.winery, p.wineryJp || '')
    })
    return [...map.entries()].map(([en, jp]) => ({ en, jp })).sort((a, b) => a.en.localeCompare(b.en))
  }, [beverageProducts])

  // A product is "complete" only when it has both alcohol AND ingredients
  const hasData = (p) => {
    const hasAlcohol = p.alcoholPct != null && p.alcoholPct !== '' && parseFloat(p.alcoholPct) > 0
    const hasIngredients = !!(p.ingredients?.it || '').trim()
    return hasAlcohol && hasIngredients
  }

  // Filter groups
  const filteredGroups = useMemo(() => {
    const result = []
    for (const [key, items] of productGroups) {
      // Apply producer filter
      if (producerFilter) {
        const pf = producerFilter.toLowerCase()
        const match = items.some(p =>
          (p.winery || '').toLowerCase().includes(pf) ||
          (p.wineryJp || '').includes(producerFilter)
        )
        if (!match) continue
      }
      // Apply product filter
      if (productFilter) {
        const nf = productFilter.toLowerCase()
        const match = items.some(p =>
          (p.name || '').toLowerCase().includes(nf) ||
          (p.nameJp || '').includes(nf) ||
          (p.code || '').toLowerCase().includes(nf)
        )
        if (!match) continue
      }
      // Status filter: done = has data or confirmed, todo = neither
      const groupDone = items.some(p => hasData(p)) || items.every(p => confirmed[p._recordId])
      if (statusFilter === 'done' && !groupDone) continue
      if (statusFilter === 'todo' && groupDone) continue
      result.push({ key, items })
    }
    return result
  }, [productGroups, producerFilter, productFilter, statusFilter, confirmed])

  // Use the first (largest) product as the "representative" for edit data
  const getGroupEditValues = (group) => {
    const product = group.items[0]
    const existing = editData[product._recordId]
    if (existing) return existing
    return {
      energyKj: product.nutrition?.energy_kj || '',
      energyKcal: product.nutrition?.energy_kcal || '',
      fatG: product.nutrition?.fat || '',
      saturatedFatG: product.nutrition?.saturated_fat || '',
      carbsG: product.nutrition?.carbs || '',
      sugarsG: product.nutrition?.sugars || '',
      proteinG: product.nutrition?.protein || '',
      saltG: product.nutrition?.salt || '',
      alcoholPct: product.alcoholPct || '',
      ingredientsIt: product.ingredients?.it || '',
      ingredientsJp: product.ingredients?.jp || '',
    }
  }

  // EAN edit data is per-product (not per-group, since each size has its own EAN)
  const [eanEditData, setEanEditData] = useState({})
  const [eanBoxEditData, setEanBoxEditData] = useState({})
  const [bottlesPerBoxEditData, setBottlesPerBoxEditData] = useState({}) // recordId → value

  const getEanValue = (product) => {
    if (eanEditData[product._recordId] !== undefined) return eanEditData[product._recordId]
    return product.barcode || ''
  }

  const getEanBoxValue = (product) => {
    if (eanBoxEditData[product._recordId] !== undefined) return eanBoxEditData[product._recordId]
    return product.barcodeBox || ''
  }

  const getBottlesPerBoxValue = (product) => {
    if (bottlesPerBoxEditData[product._recordId] !== undefined) return bottlesPerBoxEditData[product._recordId]
    return product.bottlesPerBox || ''
  }

  const updateEan = (recordId, value) => {
    const clean = normalizeJapaneseInput(value, true)
    setEanEditData(prev => ({ ...prev, [recordId]: clean }))
  }

  const updateEanBox = (recordId, value) => {
    const clean = normalizeJapaneseInput(value, true)
    setEanBoxEditData(prev => ({ ...prev, [recordId]: clean }))
  }

  const updateBottlesPerBox = (recordId, value) => {
    const clean = normalizeJapaneseInput(value, true)
    setBottlesPerBoxEditData(prev => ({ ...prev, [recordId]: clean }))
  }

  const updateField = (groupKey, field, rawValue) => {
    const group = filteredGroups.find(g => g.key === groupKey) ||
                  [...productGroups.entries()].find(([k]) => k === groupKey)
    if (!group) return
    const items = group.items || group[1]
    const recordId = items[0]._recordId
    const isNumericField = NUTRITION_FIELDS.some(f => f.key === field) || field === 'alcoholPct'
    const value = normalizeJapaneseInput(rawValue, isNumericField)
    setEditData(prev => ({
      ...prev,
      [recordId]: {
        ...getGroupEditValues({ items }),
        ...prev[recordId],
        [field]: value,
      }
    }))
    // Mark all items in group as unsaved
    const newSaved = {}
    items.forEach(p => { newSaved[p._recordId] = false })
    setSaved(prev => ({ ...prev, ...newSaved }))
  }

  const saveGroup = async (group, autoConfirm = false) => {
    const items = group.items
    const primaryRecord = items[0]._recordId
    const values = { ...getGroupEditValues(group), ...editData[primaryRecord] }

    // Mark all items as saving
    const savingState = {}
    items.forEach(p => { savingState[p._recordId] = true })
    setSaving(prev => ({ ...prev, ...savingState }))

    try {
      const alcoholVal = parseFloat(values.alcoholPct)
      const payload = {
        energyKj: parseFloat(values.energyKj) || 0,
        energyKcal: parseFloat(values.energyKcal) || 0,
        fatG: parseFloat(values.fatG) || 0,
        saturatedFatG: parseFloat(values.saturatedFatG) || 0,
        carbsG: parseFloat(values.carbsG) || 0,
        sugarsG: parseFloat(values.sugarsG) || 0,
        proteinG: parseFloat(values.proteinG) || 0,
        saltG: parseFloat(values.saltG) || 0,
        ingredientsIt: normalizeJapaneseInput(values.ingredientsIt, false) || '',
      }
      // Auto-translate ingredients to all other Airtable languages
      const rawIngredients = payload.ingredientsIt
      if (rawIngredients) {
        const langMap = { en: 'En', de: 'De', fr: 'Fr', es: 'Es' }
        for (const [lang, suffix] of Object.entries(langMap)) {
          const { text } = autoTranslateIngredients(rawIngredients, lang)
          if (text) payload[`ingredients${suffix}`] = text
        }
        console.log(`[Supplier] Auto-translated ingredients to ${Object.keys(langMap).length} languages`)
      }
      // Save alcohol directly as percentage (no conversion)
      if (!isNaN(alcoholVal) && alcoholVal >= 0) {
        payload.alcoholPct = alcoholVal
      }

      // Save to ALL items in the group (all sizes)
      for (const item of items) {
        // Include per-item logistics: EAN bottle, EAN box, bottles per box
        const itemPayload = { ...payload }
        const eanVal = eanEditData[item._recordId]
        if (eanVal !== undefined && eanVal !== '') {
          itemPayload.ean = parseInt(eanVal, 10) || 0
        }
        const eanBoxVal = eanBoxEditData[item._recordId]
        if (eanBoxVal !== undefined && eanBoxVal !== '') {
          itemPayload.eanBox = parseInt(eanBoxVal, 10) || 0
        }
        const bpbVal = bottlesPerBoxEditData[item._recordId]
        if (bpbVal !== undefined && bpbVal !== '') {
          itemPayload.bottlesPerBox = parseInt(bpbVal, 10) || 0
        }
        await updateProduct(item._recordId, itemPayload)
      }

      const savedState = {}
      const confirmedState = {}
      items.forEach(p => {
        savedState[p._recordId] = true
        if (autoConfirm) confirmedState[p._recordId] = true
      })
      setSaved(prev => ({ ...prev, ...savedState }))
      setSavedAt(prev => ({ ...prev, [group.key]: new Date() }))
      if (autoConfirm) setConfirmed(prev => ({ ...prev, ...confirmedState }))
    } catch (err) {
      alert(`${lang === 'jp' ? '保存エラー' : 'Errore salvataggio'} ${items[0].name}: ${err.message}`)
    } finally {
      const savingOff = {}
      items.forEach(p => { savingOff[p._recordId] = false })
      setSaving(prev => ({ ...prev, ...savingOff }))
    }
  }

  const saveAndConfirm = (group) => saveGroup(group, true)
  const saveAll = async () => { for (const g of filteredGroups) await saveGroup(g) }

  const handlePrintLabel = async (item) => {
    setPrintingGroup(item._recordId)
    try {
      const allProducts = await fetchProducts()
      const freshProduct = allProducts.find(p => p.slug === item.slug) || item
      const filledProduct = {
        ...freshProduct,
        ingredients: autoFillIngredients(freshProduct.ingredients),
        allergens: autoFillIngredients(freshProduct.allergens),
      }
      await generate([filledProduct], {
        selectedLanguage: 'it',
        selectedCountry: 'Italia',
        importer: null,
      })
    } catch (err) {
      console.error('Print label failed:', err)
      alert(`Errore stampa: ${err.message}`)
    } finally {
      setPrintingGroup(null)
    }
  }

  const handlePrintBox = async (item) => {
    setPrintingBoxGroup(item._recordId)
    try {
      const allProducts = await fetchProducts()
      const freshProduct = allProducts.find(p => p.slug === item.slug) || item
      const filledProduct = {
        ...freshProduct,
        ingredients: autoFillIngredients(freshProduct.ingredients),
        allergens: autoFillIngredients(freshProduct.allergens),
      }
      const qr = await generateQR(filledProduct.slug, 'it', 'Italia')
      const boxLabel = {
        ...filledProduct,
        qr,
        language: 'it',
        country: 'Italia',
        importer: null,
      }
      await downloadBoxLabelPDF(boxLabel)
    } catch (err) {
      console.error('Print box failed:', err)
      alert(`Errore stampa box: ${err.message}`)
    } finally {
      setPrintingBoxGroup(null)
    }
  }

  const handlePrintQR = async (item) => {
    setPrintingQRGroup(item._recordId)
    try {
      const qrDataUrl = await generateQR(item.slug, 'it', 'Italia')
      // Download QR as PNG
      const link = document.createElement('a')
      link.download = `QR_${item.slug}.png`
      link.href = qrDataUrl
      link.click()
    } catch (err) {
      console.error('Print QR failed:', err)
      alert(`Errore QR: ${err.message}`)
    } finally {
      setPrintingQRGroup(null)
    }
  }

  const startCopy = (groupKey) => setCopySource(copySource === groupKey ? null : groupKey)
  const pasteValues = (targetGroupKey) => {
    if (!copySource) return
    const sourceGroup = [...productGroups.entries()].find(([k]) => k === copySource)
    if (!sourceGroup) return
    const sourceItems = sourceGroup[1]
    const sourceRecordId = sourceItems[0]._recordId
    const sv = { ...getGroupEditValues({ items: sourceItems }), ...editData[sourceRecordId] }

    const targetGroup = [...productGroups.entries()].find(([k]) => k === targetGroupKey)
    if (!targetGroup) return
    const targetItems = targetGroup[1]
    const targetRecordId = targetItems[0]._recordId

    setEditData(prev => ({
      ...prev,
      [targetRecordId]: {
        ...getGroupEditValues({ items: targetItems }),
        ...prev[targetRecordId],
        ...Object.fromEntries(NUTRITION_FIELDS.map(f => [f.key, sv[f.key]])),
        alcoholPct: sv.alcoholPct,
        ingredientsIt: sv.ingredientsIt,
      }
    }))
    const newSaved = {}
    targetItems.forEach(p => { newSaved[p._recordId] = false })
    setSaved(prev => ({ ...prev, ...newSaved }))
  }

  const applySuggestion = (groupKey, category, productName) => {
    const suggestion = lang === 'jp'
      ? getIngredientSuggestion(category, 'jp', productName)
      : getIngredientSuggestion(category, 'it', productName)
    if (suggestion) {
      updateField(groupKey, 'ingredientsIt', suggestion)
    }
  }

  // Handle ingredient auto-translation when switching language
  const getIngredientDisplay = (group) => {
    const values = { ...getGroupEditValues(group), ...editData[group.items[0]._recordId] }
    return values.ingredientsIt || ''
  }

  // --- Unauthorized ---
  if (!isAuthorized) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <h1 style={{ fontSize: '22px', color: '#333', marginBottom: '12px' }}>{T.it.unauthorized}</h1>
        <p style={{ color: '#888' }}>{T.it.unauthorizedMsg}</p>
        <p style={{ color: '#888', marginTop: '12px' }}>{T.jp.unauthorizedMsg}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <p style={{ color: '#888' }}>{t.loading}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'Inter, -apple-system, sans-serif' }}>
        <p style={{ color: '#c0392b' }}>Errore: {error}</p>
      </div>
    )
  }

  const groupHasData = (group) => group.items.some(p => hasData(p))
  const savedCount = Object.values(saved).filter(Boolean).length
  const confirmedCount = Object.values(confirmed).filter(Boolean).length
  const copySourceGroup = copySource ? [...productGroups.entries()].find(([k]) => k === copySource) : null

  // Progress: count groups that already have data OR have been confirmed in this session
  const totalGroups = [...productGroups.values()].length
  const completedGroups = [...productGroups.entries()].filter(([key, items]) =>
    items.some(p => hasData(p)) || items.every(p => confirmed[p._recordId])
  ).length
  const remainingGroups = totalGroups - completedGroups
  const progressPct = totalGroups > 0 ? Math.round((completedGroups / totalGroups) * 100) : 0

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, -apple-system, sans-serif' }}>
      {/* Header + Language selector */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <img src="/logo-sc.png" alt="Sake Company" style={{ height: '32px' }} />
          <h1 style={{ fontSize: '20px', margin: 0, color: '#333', flex: 1 }}>
            {t.title}
          </h1>
          <div style={{
            display: 'flex', borderRadius: '6px', overflow: 'hidden',
            border: '1px solid #ccc', fontSize: '13px',
          }}>
            <button onClick={() => setLang('it')}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: 600,
                background: lang === 'it' ? '#1565c0' : '#fff',
                color: lang === 'it' ? '#fff' : '#555',
              }}>
              Italiano
            </button>
            <button onClick={() => setLang('jp')}
              style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontWeight: 600,
                borderLeft: '1px solid #ccc',
                background: lang === 'jp' ? '#1565c0' : '#fff',
                color: lang === 'jp' ? '#fff' : '#555',
              }}>
              日本語
            </button>
          </div>
        </div>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>{t.subtitle}</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: 600 }}>
            {t.producer}
          </label>
          <div style={{ position: 'relative' }}>
            <input type="text" list="producer-list" value={producerFilter}
              onChange={e => setProducerFilter(e.target.value)}
              placeholder={t.producerPlaceholder}
              style={{ width: '100%', padding: '8px 10px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '6px', boxSizing: 'border-box' }}
            />
            {producerFilter && (
              <button onClick={() => setProducerFilter('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#999', padding: '0 4px', lineHeight: 1 }}
                title={t.clearFilter}>×</button>
            )}
          </div>
          <datalist id="producer-list">
            {producers.map(p => <option key={p.en} value={p.en}>{p.en}{p.jp ? ` — ${p.jp}` : ''}</option>)}
            {producers.filter(p => p.jp).map(p => <option key={`jp-${p.en}`} value={p.jp}>{p.jp} — {p.en}</option>)}
          </datalist>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px', fontWeight: 600 }}>
            {t.searchProduct}
          </label>
          <input type="text" value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            placeholder={t.searchProductPlaceholder}
            style={{ width: '100%', padding: '8px 10px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '6px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ padding: '8px 0', fontSize: '13px', color: '#888', whiteSpace: 'nowrap' }}>
          {filteredGroups.length} {t.groups} · {filteredGroups.reduce((n, g) => n + g.items.length, 0)} {t.products}
        </div>
      </div>

      {/* Status filter: Tutti / Da fare / Completati */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px' }}>
        {[
          { key: 'all', label: lang === 'jp' ? 'すべて' : 'Tutti', count: totalGroups },
          { key: 'todo', label: lang === 'jp' ? '残り' : 'Da fare', count: remainingGroups },
          { key: 'done', label: lang === 'jp' ? '完了' : 'Completati', count: completedGroups },
        ].map((opt, i) => (
          <button key={opt.key} onClick={() => setStatusFilter(opt.key)}
            style={{
              padding: '7px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              border: '1px solid #ccc',
              borderLeft: i === 0 ? '1px solid #ccc' : 'none',
              borderRadius: i === 0 ? '6px 0 0 6px' : i === 2 ? '0 6px 6px 0' : '0',
              background: statusFilter === opt.key ? '#1565c0' : '#fff',
              color: statusFilter === opt.key ? '#fff' : '#555',
            }}>
            {opt.label} ({opt.count})
          </button>
        ))}
      </div>

      {/* Copy mode sticky banner */}
      {copySource && copySourceGroup && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 100,
          padding: '10px 16px', borderRadius: '8px', marginBottom: '12px',
          background: '#fff3e0', border: '1px solid #ffe0b2',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '13px', color: '#e65100', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
          <span>
            <strong>{t.copyFrom}</strong> {copySourceGroup[1][0].name}
            {' '}{t.clickPaste}
          </span>
          <button onClick={() => setCopySource(null)}
            style={{ padding: '4px 12px', fontSize: '12px', fontWeight: 600, background: '#e65100', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {t.exitCopy}
          </button>
        </div>
      )}

      {/* Info box */}
      <div style={{
        padding: '14px 18px', borderRadius: '8px', marginBottom: '24px',
        background: '#e3f2fd', border: '1px solid #bbdefb', fontSize: '13px', color: '#1565c0'
      }}>
        <strong>{t.howItWorks}</strong> {t.howItWorksText}
      </div>

      {/* Progress counter */}
      <div style={{
        padding: '14px 18px', borderRadius: '8px', marginBottom: '16px',
        background: '#fafafa', border: '1px solid #e0e0e0',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
            {t.progress}: {completedGroups} {t.of} {totalGroups} ({progressPct}%)
          </span>
          <span style={{ fontSize: '13px', color: '#888' }}>
            <span style={{ color: '#2e7d32', fontWeight: 600 }}>{completedGroups} {t.completed}</span>
            {' · '}
            <span style={{ color: '#e65100', fontWeight: 600 }}>{remainingGroups} {t.remaining}</span>
          </span>
        </div>
        <div style={{
          height: '8px', borderRadius: '4px', background: '#e0e0e0', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            background: progressPct === 100 ? '#2e7d32' : '#1565c0',
            width: `${progressPct}%`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Product cards */}
      {filteredGroups.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
          {statusFilter === 'todo' && completedGroups > 0 ? (
            <div>
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>{t.allConfirmed}</p>
              <p style={{ fontSize: '14px' }}>{completedGroups} {t.confirmedProducts}</p>
              <button onClick={() => setStatusFilter('all')}
                style={{ marginTop: '12px', padding: '8px 20px', fontSize: '14px', background: '#f5f5f5', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', color: '#555' }}>
                {t.showAll}
              </button>
            </div>
          ) : (
            <p>{t.noProducts}</p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredGroups.map((group) => {
            const product = group.items[0] // representative
            const primaryRecordId = product._recordId
            const values = { ...getGroupEditValues(group), ...editData[primaryRecordId] }
            const isSaving = group.items.some(p => saving[p._recordId])
            const isSaved = group.items.every(p => saved[p._recordId])
            const alreadyHasData = groupHasData(group)
            const isCopySource = copySource === group.key
            const hasSiblings = group.items.length > 1
            const category = product.category || ''
            const suggestion = getIngredientSuggestion(category, lang === 'jp' ? 'jp' : 'it', product.name)
            const currentIngredients = values.ingredientsIt || ''

            const bg = isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'

            return (
              <div key={group.key} style={{
                border: isCopySource ? '2px solid #ff9800' : isSaved ? '2px solid #4caf50' : '1px solid #e0e0e0',
                borderRadius: '12px', background: bg, padding: '20px',
                transition: 'all 0.2s ease',
              }}>
                {/* Product header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#222', marginBottom: '2px' }}>
                      {lang === 'jp' && product.nameJp ? product.nameJp : product.name}
                      {alreadyHasData && !isSaved && (
                        <span style={{ color: '#2e7d32', fontSize: '12px', fontWeight: 500, marginLeft: '8px' }}>✓ {t.data}</span>
                      )}
                    </div>
                    {((lang === 'jp' && product.name && product.nameJp) || (lang === 'it' && product.nameJp)) && (
                      <div style={{ fontSize: '13px', color: '#666', marginBottom: '2px' }}>
                        {lang === 'jp' ? product.name : product.nameJp}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {lang === 'jp' ? (product.wineryJp || product.winery) : product.winery}
                      {lang === 'jp' && product.winery && product.wineryJp ? ` (${product.winery})` : ''}
                      {lang === 'it' && product.wineryJp ? ` (${product.wineryJp})` : ''}
                      {category ? ` · ${category}` : ''}
                    </div>
                    {/* Size badges only */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {group.items.map(item => (
                        <span key={item._recordId} style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                          background: hasSiblings ? '#e3f2fd' : '#f5f5f5',
                          border: hasSiblings ? '1px solid #bbdefb' : '1px solid #e0e0e0',
                          fontSize: '11px', fontWeight: 600,
                        }}>
                          {item.volumeMl}ml · {item.code}
                        </span>
                      ))}
                      {hasSiblings && (
                        <span style={{ fontSize: '11px', color: '#1565c0', fontStyle: 'italic', alignSelf: 'center' }}>
                          {lang === 'jp' ? '一括入力' : 'inserimento unico'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    {copySource && copySource !== group.key ? (
                      <button onClick={() => pasteValues(group.key)}
                        style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, background: '#e65100', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        {t.paste}
                      </button>
                    ) : (
                      <button onClick={() => startCopy(group.key)}
                        style={{
                          padding: '6px 14px', fontSize: '12px', fontWeight: 500,
                          background: isCopySource ? '#e65100' : '#f5f5f5',
                          color: isCopySource ? '#fff' : '#666',
                          border: isCopySource ? 'none' : '1px solid #ddd', borderRadius: '6px', cursor: 'pointer',
                        }}>
                        {isCopySource ? t.copying : t.copy}
                      </button>
                    )}
                    <button
                      onClick={() => saveAndConfirm(group)} disabled={isSaving}
                      style={{
                        padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                        background: isSaved ? '#2e7d32' : isSaving ? '#ccc' : '#1565c0',
                        color: '#fff', border: 'none', borderRadius: '6px',
                        cursor: isSaving ? 'default' : 'pointer',
                        minWidth: '100px',
                      }}>
                      {isSaving ? t.saving : isSaved ? t.saved : t.save}
                    </button>
                  </div>

                  {/* Last save date */}
                  {savedAt[group.key] && (
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      {t.lastSaved}: {savedAt[group.key].toLocaleTimeString(lang === 'jp' ? 'ja-JP' : 'it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* ====== SEZIONE 1: Dati etichetta fisica (obbligatori) ====== */}
                <div style={{
                  background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px',
                  padding: '12px 14px', marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#8d6e00', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {lang === 'jp' ? '🏷️ ラベル必須データ（アルコール・原材料）' : '🏷️ Dati etichetta fisica (obbligatori)'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    <NutritionInput
                      label={lang === 'jp' ? 'アルコール度数' : 'Alcol'}
                      unit="% vol"
                      value={values.alcoholPct ?? ''}
                      onChange={v => updateField(group.key, 'alcoholPct', v)}
                      bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                    />
                  </div>

                  {/* Ingredients inline */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {t.ingredientsLabel}
                      </label>
                      {suggestion && !currentIngredients && (
                        <button onClick={() => applySuggestion(group.key, category, product.name)}
                          style={{
                            padding: '2px 10px', fontSize: '11px', fontWeight: 600,
                            background: '#e8f5e9', color: '#2e7d32', border: '1px solid #c8e6c9',
                            borderRadius: '4px', cursor: 'pointer',
                          }}>
                          {t.useSuggestion}: {suggestion.length > 40 ? suggestion.slice(0, 40) + '...' : suggestion}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={currentIngredients}
                      onChange={e => updateField(group.key, 'ingredientsIt', e.target.value)}
                      placeholder={suggestion || t.ingredientsPlaceholder}
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 10px',
                        border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px',
                        background: isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff',
                        resize: 'vertical', boxSizing: 'border-box',
                        fontFamily: 'Inter, -apple-system, sans-serif',
                      }}
                    />
                  </div>
                </div>

                {/* ====== SEZIONE 2: Valori nutrizionali (completabili dopo) ====== */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {lang === 'jp' ? '📱 栄養成分表示（後で追加可能）' : '📱 ' + t.nutritionTitle + ' (completabili dopo)'}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Energia group: kJ + kcal side by side */}
                    <div style={{
                      background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: '3px solid #90caf9',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
                    }}>
                      <NutritionInput
                        label={lang === 'jp' ? 'エネルギー' : 'Energia'}
                        unit="kJ"
                        value={values.energyKj ?? ''}
                        onChange={v => {
                          updateField(group.key, 'energyKj', v)
                          const kj = parseFloat(normalizeJapaneseInput(v, true))
                          if (!isNaN(kj) && kj > 0) {
                            updateField(group.key, 'energyKcal', String(Math.round(kj / 4.184)))
                          }
                        }}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                      <NutritionInput
                        label=""
                        unit="kcal"
                        value={values.energyKcal ?? ''}
                        onChange={v => {
                          updateField(group.key, 'energyKcal', v)
                          const kcal = parseFloat(normalizeJapaneseInput(v, true))
                          if (!isNaN(kcal) && kcal > 0) {
                            updateField(group.key, 'energyKj', String(Math.round(kcal * 4.184)))
                          }
                        }}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                    </div>

                    {/* Grassi group: Grassi + di cui saturi side by side */}
                    <div style={{
                      background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: '3px solid #a5d6a7',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
                    }}>
                      <NutritionInput
                        label={lang === 'jp' ? '脂質' : 'Grassi'}
                        unit="g"
                        value={values.fatG ?? ''}
                        onChange={v => updateField(group.key, 'fatG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                      <NutritionInput
                        label={lang === 'jp' ? '飽和脂肪酸' : 'di cui saturi'}
                        unit="g"
                        value={values.saturatedFatG ?? ''}
                        onChange={v => updateField(group.key, 'saturatedFatG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                        indent
                      />
                    </div>

                    {/* Carboidrati group: Carboidrati + di cui zuccheri side by side */}
                    <div style={{
                      background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: '3px solid #ffcc80',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
                    }}>
                      <NutritionInput
                        label={lang === 'jp' ? '炭水化物' : 'Carboidrati'}
                        unit="g"
                        value={values.carbsG ?? ''}
                        onChange={v => updateField(group.key, 'carbsG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                      <NutritionInput
                        label={lang === 'jp' ? '糖類' : 'di cui zuccheri'}
                        unit="g"
                        value={values.sugarsG ?? ''}
                        onChange={v => updateField(group.key, 'sugarsG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                        indent
                      />
                    </div>

                    {/* Proteine + Sale side by side */}
                    <div style={{
                      background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px',
                      borderLeft: '3px solid #ffcc80',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
                    }}>
                      <NutritionInput
                        label={lang === 'jp' ? 'たんぱく質' : 'Proteine'}
                        unit="g"
                        value={values.proteinG ?? ''}
                        onChange={v => updateField(group.key, 'proteinG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                      <NutritionInput
                        label={lang === 'jp' ? '食塩相当量' : 'Sale'}
                        unit="g"
                        value={values.saltG ?? ''}
                        onChange={v => updateField(group.key, 'saltG', v)}
                        bg={isCopySource ? '#fff8e1' : isSaved ? '#e8f5e9' : '#fff'}
                      />
                    </div>
                  </div>
                </div>

                {/* ====== SEZIONE 3: Logistica ====== */}
                <div style={{
                  background: '#e8eaf6', border: '1px solid #c5cae9', borderRadius: '8px',
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#283593', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t.logisticsTitle}
                  </div>

                  {/* Per-size logistics rows — single line each */}
                  {group.items.map(item => {
                    const itemHasAlcohol = (values.alcoholPct !== '' && parseFloat(values.alcoholPct) > 0) || (item.alcoholPct > 0)
                    const itemHasIngredients = (values.ingredientsIt || '').trim().length > 0 || !!(item.ingredients?.it || '').trim()
                    const itemCanPrint = itemHasAlcohol && itemHasIngredients
                    const itemIsPrinting = printingGroup === item._recordId
                    const itemHasBoxEan = !!(item.barcodeBox || eanBoxEditData[item._recordId])
                    const itemHasBottlesPerBox = !!(getBottlesPerBoxValue(item))
                    const itemCanPrintBox = itemCanPrint && itemHasBottlesPerBox
                    const itemIsPrintingBox = printingBoxGroup === item._recordId
                    const itemIsPrintingQR = printingQRGroup === item._recordId
                    const cellStyle = { display: 'flex', flexDirection: 'column', gap: '2px' }
                    const labelStyle = { fontSize: '10px', color: '#5c6bc0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }
                    const inputBase = {
                      padding: '5px 8px', fontSize: '13px', borderRadius: '5px',
                      fontFamily: 'monospace', letterSpacing: '0.5px', outline: 'none',
                    }
                    return (
                    <div key={item._recordId} style={{
                      background: '#fff', borderRadius: '8px', padding: '10px 16px', marginBottom: '6px',
                      border: '1px solid #e0e0e0',
                      display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap',
                    }}>
                      {/* DIMENSIONE */}
                      <div style={cellStyle}>
                        <span style={labelStyle}>{lang === 'jp' ? 'サイズ' : 'Formato'}</span>
                        <span style={{
                          fontSize: '14px', fontWeight: 700, color: '#283593',
                          background: '#c5cae9', borderRadius: '4px', padding: '4px 12px',
                          textAlign: 'center', whiteSpace: 'nowrap',
                        }}>
                          {item.volumeMl}ml
                        </span>
                      </div>

                      {/* NUM BOTTIGLIE */}
                      <div style={cellStyle}>
                        <span style={labelStyle}>{lang === 'jp' ? '本数' : 'N° Bott.'}</span>
                        <input type="text" inputMode="numeric" placeholder="6"
                          value={getBottlesPerBoxValue(item)}
                          onChange={e => updateBottlesPerBox(item._recordId, e.target.value)}
                          style={{
                            ...inputBase, width: '50px', textAlign: 'center',
                            border: '1px solid #c5cae9', background: '#fff',
                          }}
                        />
                      </div>

                      {/* EAN BOTTIGLIA */}
                      <div style={cellStyle}>
                        <span style={labelStyle}>
                          EAN {lang === 'jp' ? 'ボトル' : 'Bottiglia'}
                          {getEanValue(item) && getEanValue(item).length === 13 && (
                            <span style={{ color: '#2e7d32', marginLeft: '4px' }}> ✓</span>
                          )}
                        </span>
                        <input type="text" inputMode="numeric"
                          placeholder="EAN 13 cifre"
                          value={getEanValue(item)}
                          onChange={e => updateEan(item._recordId, e.target.value)}
                          style={{
                            ...inputBase, width: '150px',
                            border: '1px solid #c5cae9',
                            background: getEanValue(item) ? '#f0f7ff' : '#fff',
                          }}
                        />
                      </div>

                      {/* EAN/ITF BOX */}
                      <div style={cellStyle}>
                        <span style={{ ...labelStyle, color: '#e65100' }}>
                          EAN/ITF Box
                          {getEanBoxValue(item) && (getEanBoxValue(item).length === 13 || getEanBoxValue(item).length === 14) && (
                            <span style={{ color: '#2e7d32', marginLeft: '4px' }}>
                              ✓ {getEanBoxValue(item).length === 14 ? 'ITF' : ''}
                            </span>
                          )}
                        </span>
                        <input type="text" inputMode="numeric"
                          placeholder="EAN 13 o ITF-14"
                          value={getEanBoxValue(item)}
                          onChange={e => updateEanBox(item._recordId, e.target.value)}
                          style={{
                            ...inputBase, width: '155px',
                            border: '1px solid #ffcc80',
                            background: getEanBoxValue(item) ? '#fff8e1' : '#fff',
                          }}
                        />
                      </div>

                      {/* PRINT BUTTONS — right aligned */}
                      <div style={{ ...cellStyle, marginLeft: 'auto' }}>
                        <span style={labelStyle}>{lang === 'jp' ? '印刷' : 'Stampa'}</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {/* Bottle label */}
                          <button onClick={() => handlePrintLabel(item)}
                            disabled={!itemCanPrint || itemIsPrinting}
                            title={lang === 'jp' ? 'ボトルラベル' : 'Etichetta bottiglia'}
                            style={{
                              padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                              background: !itemCanPrint ? '#e0e0e0' : itemIsPrinting ? '#ccc' : '#7b1fa2',
                              color: '#fff', border: 'none', borderRadius: '5px',
                              cursor: !itemCanPrint || itemIsPrinting ? 'default' : 'pointer',
                              whiteSpace: 'nowrap', opacity: !itemCanPrint ? 0.5 : 1,
                            }}>
                            {itemIsPrinting ? '...' : '🍶'}
                          </button>
                          {/* Box label */}
                          <button onClick={() => {
                              if (!itemHasBottlesPerBox) {
                                alert(lang === 'jp' ? '箱あたりの本数が未入力です' : 'Manca il numero di bottiglie per box')
                                return
                              }
                              handlePrintBox(item)
                            }}
                            disabled={!itemCanPrint || itemIsPrintingBox}
                            title={lang === 'jp' ? 'ボックスラベル' : 'Etichetta box'}
                            style={{
                              padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                              background: !itemCanPrint ? '#e0e0e0' : itemIsPrintingBox ? '#ccc' : '#e65100',
                              color: '#fff', border: 'none', borderRadius: '5px',
                              cursor: !itemCanPrint || itemIsPrintingBox ? 'default' : 'pointer',
                              whiteSpace: 'nowrap', opacity: !itemCanPrint ? 0.5 : 1,
                            }}>
                            {itemIsPrintingBox ? '...' : '📦'}
                          </button>
                          {/* QR code */}
                          <button onClick={() => handlePrintQR(item)}
                            disabled={itemIsPrintingQR}
                            title="QR Code"
                            style={{
                              padding: '4px 10px', fontSize: '12px', fontWeight: 600,
                              background: itemIsPrintingQR ? '#ccc' : '#1565c0',
                              color: '#fff', border: 'none', borderRadius: '5px',
                              cursor: itemIsPrintingQR ? 'default' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}>
                            {itemIsPrintingQR ? '...' : 'QR'}
                          </button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                  <div style={{ fontSize: '10px', color: '#7986cb', marginTop: '4px', fontStyle: 'italic' }}>
                    {t.eanBoxNote}
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Footer actions */}
      {filteredGroups.length > 0 && (
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#888' }}>
            {completedGroups} {t.completed} / {totalGroups} {t.totalCount}
          </span>
          <button onClick={saveAll}
            style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 600, background: '#1565c0', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            {t.saveAll}
          </button>
        </div>
      )}

      <div style={{ marginTop: '48px', padding: '16px 0', borderTop: '1px solid #eee', textAlign: 'center', fontSize: '12px', color: '#aaa' }}>
        {t.footer} · label.sakecompany.com
      </div>
    </div>
  )
}