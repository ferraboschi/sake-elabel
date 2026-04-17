/**
 * Label Printer Service — BACK LABEL (retro etichetta)
 * Version: 2.1.0 — 2026-03-24T14:00
 *
 * Rewritten from scratch to match the reference PDF design exactly.
 *
 * REFERENCE DESIGN (both BOTTIGLIA and BOX):
 * ┌─────────────────────────────────────────────┐
 * │ PRODUCT NAME (bold)          [Pittogramma]  │
 * │ Category (italic)                            │
 * │─────────────────────────────────────────────│
 * │ Legal description            ┌────────────┐ │
 * │ Ingredienti: (bold)          │            │ │
 * │ ingredient list              │  BARCODE   │ │
 * │ Alcool: XX% Vol.             │  (vertical)│ │
 * │ Contenuto: XXXml             │            │ │
 * │─────────────────────────────│            │ │
 * │ Prodotto e confezionato...   │            │ │
 * │ Importato da: Company        │            │ │
 * │ Address                      │            │ │
 * │ sakecompany.com              └────────────┘ │
 * │─────────────────────────────────────────────│
 * │ [QR]  Avvertenze:                           │
 * │ [QR]  warning text...                       │
 * │ [QR]  Info nutrizionali nel QR              │
 * │ Cod. XXXX    Lotto: vedi sulla confezione   │
 * └─────────────────────────────────────────────┘
 *
 * BOTTLE vs BOX:
 *   - BOTTLE: QR code in footer, bottle EAN barcode
 *   - BOX: Box icon in footer (no QR), box EAN/ITF-14 barcode,
 *           category line shows "· X bottiglie"
 *
 * EU Regulation 1169/2011: x-height >= 0.9mm for packages <= 80cm²
 * QR code: minimum 13×13mm (EU e-label requirement)
 * Label width: 55mm, height: dynamic
 */

import { jsPDF } from 'jspdf'
import { generateVerticalBarcodePdfDataUrl } from './barcodeGenerator'

// ═══════════════════════════════════════════════════════
// ASSET LOADERS (cached)
// ═══════════════════════════════════════════════════════

let cachedFontBase64 = null
async function loadJapaneseFont() {
  if (cachedFontBase64) return cachedFontBase64
  try {
    const basePath = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${basePath}fonts/NotoSansJP-Regular.ttf`)
    if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    cachedFontBase64 = btoa(binary)
    return cachedFontBase64
  } catch (err) {
    console.warn('[LabelPrinter] CJK font unavailable:', err.message)
    return null
  }
}

let cachedPittogramma = null
async function loadPittogramma() {
  if (cachedPittogramma) return cachedPittogramma
  try {
    const basePath = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${basePath}icons/pittogramma-sake.png`)
    if (!res.ok) throw new Error(`Pittogramma fetch failed: ${res.status}`)
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    cachedPittogramma = 'data:image/png;base64,' + btoa(binary)
    return cachedPittogramma
  } catch (err) {
    console.warn('[LabelPrinter] Pittogramma unavailable:', err.message)
    return null
  }
}

let cachedBoxIcon = null
async function loadBoxIcon() {
  if (cachedBoxIcon) return cachedBoxIcon
  try {
    const basePath = import.meta.env.BASE_URL || '/'
    for (const ext of ['jpg', 'png']) {
      try {
        const res = await fetch(`${basePath}icons/BOX.${ext}`)
        if (!res.ok) continue
        const buf = await res.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png'
        cachedBoxIcon = `data:${mime};base64,` + btoa(binary)
        return cachedBoxIcon
      } catch { continue }
    }
    throw new Error('No BOX icon found')
  } catch (err) {
    console.warn('[LabelPrinter] Box icon unavailable:', err.message)
    return null
  }
}

function registerJpFont(doc, fontBase64) {
  if (!fontBase64) return false
  doc.addFileToVFS('NotoSansJP-Regular.ttf', fontBase64)
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal')
  return true
}

// ═══════════════════════════════════════════════════════
// DESIGN CONSTANTS — extracted from reference PDF
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// EU Reg. 1169/2011 — minimum x-height = 0.9mm for packages
// with surface < 80 cm² (our label: 55mm × ~80mm ≈ 44 cm²).
// Helvetica x-height ≈ 0.523 × em size.
// → min em = 0.9 / 0.523 ≈ 1.72mm ≈ 4.88pt
// → SAFE FLOOR: 5pt (gives x-height 0.92mm, just above minimum)
// All font sizes below MUST be >= EU_MIN_PT.
// ═══════════════════════════════════════════════════════
const EU_MIN_PT = 5

// Font sizes (pt) — all values verified ≥ EU_MIN_PT
const FS = {
  title: 8,       // Product name — bold, auto-reduced for long names
  category: 6,    // Category line — italic
  ingHeader: 6.5, // "Ingredienti:" — bold
  body: 6,        // Body text — regular (x-height ~1.11mm, EU compliant)
  warnHeader: 5.5,// "Avvertenze:" — bold (x-height ~1.02mm, EU compliant)
  warn: 5.5,      // Warning text — regular (x-height ~1.02mm, EU compliant)
  cod: 5.5,       // Footer "Cod." line (x-height ~1.02mm, EU compliant)
}

// Compile-time safety check: prevent any font from going below EU minimum
for (const [k, v] of Object.entries(FS)) {
  if (v < EU_MIN_PT) {
    throw new Error(`[LabelPrinter] FS.${k} = ${v}pt is below EU minimum (${EU_MIN_PT}pt). Reg. 1169/2011 requires x-height ≥ 0.9mm.`)
  }
}

// Baseline offsets (distance from text top-edge to jsPDF baseline)
const BL = {
  title: 2.0,
  body: 1.5,
  ingH: 1.6,
  warn: 1.35,
  warnH: 1.4,
}

// Text heights (cap-height + descender per font size)
const TH = {
  title: 2.8,
  body: 2.1,
  ingH: 2.3,
  warn: 1.94,
  warnH: 1.94,
}

// Line spacing (top-to-top distance between consecutive lines)
const LS = {
  body: 2.5,
  warn: 2.1,
}

// Adaptive title sizing (try largest first, fall back for long names)
const TITLE_SIZES = [
  { pt: 8,   bl: 2.0, th: 2.8, ls: 3.1 },
  { pt: 7,   bl: 1.75, th: 2.5, ls: 2.75 },
  { pt: 6.5, bl: 1.6, th: 2.3, ls: 2.55 },
]

// Layout dimensions (mm)
const LABEL_W = 55          // label width
const MARGIN = 2.5          // content margin
const PITTO_SIZE = 6.1      // pittogramma icon
const QR_SIZE = 13           // QR code (EU minimum)
const BARCODE_COL_W = 14    // barcode column width — wider for max barcode size
const BLEED = 5             // bleed area for crop marks

// Separator line
const SEP_LW = 0.20 * 0.3528 // 0.20pt → mm
const SEP_COLOR = [190, 192, 194]

// ═══════════════════════════════════════════════════════
// TRANSLATIONS
// ═══════════════════════════════════════════════════════

const TRANSLATIONS = {
  it: {
    desc: 'Bevanda alcolica fermentata di riso (SAKE)',
    alc: 'Alcool', vol: 'Vol.', content: 'Contenuto',
    ing: 'Ingredienti', alg: 'Allergeni',
    origin: 'Prodotto e confezionato in', imp: 'Importato da:',
    warn: 'Avvertenze',
    pregnancy: 'Sconsigliato in gravidanza.',
    minor: 'Vietata la vendita ai minori di 18 anni.',
    storage: 'Conservare in luogo fresco e asciutto e al riparo dalla luce.',
    lot: 'Lotto: vedi sulla confezione',
    lotPrefix: 'Lotto:',
    code: 'Cod.',
    website: 'sakecompany.com',
    qrNutrition: 'Info nutrizionali nel QR',
  },
  de: {
    desc: 'Fermentiertes alkoholisches Reisgetränk (SAKE)',
    alc: 'Alkohol', vol: 'Vol.', content: 'Inhalt',
    ing: 'Zutaten', alg: 'Allergene',
    origin: 'Hergestellt und verpackt in', imp: 'Importiert von:',
    warn: 'Hinweise',
    pregnancy: 'In der Schwangerschaft nicht empfohlen.',
    minor: 'Verkauf an Minderjährige unter 18 Jahren verboten.',
    storage: 'Kühl und trocken lagern, vor Licht schützen.',
    lot: 'Los: siehe Verpackung',
    lotPrefix: 'Los:',
    code: 'Art.-Nr.',
    website: 'sakecompany.com',
    qrNutrition: 'Nährwertangaben im QR',
  },
  fr: {
    desc: 'Boisson alcoolique fermentée de riz (SAKE)',
    alc: 'Alcool', vol: 'Vol.', content: 'Contenu',
    ing: 'Ingrédients', alg: 'Allergènes',
    origin: 'Produit et conditionné au', imp: 'Importé par:',
    warn: 'Avertissements',
    pregnancy: 'Déconseillé pendant la grossesse.',
    minor: 'Vente interdite aux mineurs de moins de 18 ans.',
    storage: 'Conserver dans un endroit frais et sec, à l\'abri de la lumière.',
    lot: 'Lot : voir emballage',
    lotPrefix: 'Lot :',
    code: 'Réf.',
    website: 'sakecompany.com',
    qrNutrition: 'Info nutritionnelles dans le QR',
  },
  es: {
    desc: 'Bebida alcohólica fermentada de arroz (SAKE)',
    alc: 'Alcohol', vol: 'Vol.', content: 'Contenido',
    ing: 'Ingredientes', alg: 'Alérgenos',
    origin: 'Producido y envasado en', imp: 'Importado por:',
    warn: 'Advertencias',
    pregnancy: 'No recomendado durante el embarazo.',
    minor: 'Prohibida la venta a menores de 18 años.',
    storage: 'Conservar en lugar fresco y seco, protegido de la luz.',
    lot: 'Lote: ver envase',
    lotPrefix: 'Lote:',
    code: 'Cód.',
    website: 'sakecompany.com',
    qrNutrition: 'Info nutricional en el QR',
  },
  ja: {
    desc: '日本酒',
    alc: 'アルコール', vol: '', content: '内容量',
    ing: '原材料', alg: 'アレルゲン',
    origin: '製造・瓶詰', imp: '輸入者:',
    warn: '注意事項',
    pregnancy: '妊娠中・授乳中の方にはお勧めしません。',
    minor: '18歳未満の方への販売は禁止されています。',
    storage: '直射日光を避け、涼しく乾燥した場所に保管してください。',
    lot: 'ロット：パッケージ参照',
    lotPrefix: 'ロット：',
    code: 'コード',
    website: 'sakecompany.com',
    qrNutrition: '栄養成分表示はQRコードに記載',
  },
}

// ═══════════════════════════════════════════════════════
// COUNTRY NAME TRANSLATIONS
// Maps country names to their translations per language.
// Accepts both English keys (canonical) and Italian keys
// (legacy data), so existing records continue to work.
// ═══════════════════════════════════════════════════════

export const COUNTRY_NAMES = {
  'Japan': {
    it: 'Giappone',
    de: 'Japan',
    fr: 'Japon',
    es: 'Japón',
    ja: '日本',
  },
  'Giappone': {
    it: 'Giappone',
    de: 'Japan',
    fr: 'Japon',
    es: 'Japón',
    ja: '日本',
  },
}

// ═══════════════════════════════════════════════════════
// NORMALIZE — maps raw product/store fields to uniform label obj
// ═══════════════════════════════════════════════════════

function normalizeLabel(raw) {
  return {
    ...raw,
    name: raw.name || raw.productName || '',
    code: raw.code || raw.productCode || '',
    slug: raw.slug || raw.productSlug || '',
    qr: raw.qr || raw.qrDataUrl || '',
    importer: raw.importer || (raw.importerName ? {
      name: raw.importerName,
      address: raw.importerAddress || '',
    } : null),
    countryOfOrigin: raw.countryOfOrigin || 'Japan',
    legalDescription: raw.legalDescription || '',
    ingredients: raw.ingredients || null,
    allergens: raw.allergens || null,
    bottlesPerBox: raw.bottlesPerBox || null,
    lotNumber: raw.lotNumber || '',
    // Tipologia + Finiture support
    // category is already the composed value ("Tokubetsu Honjozo Koshu Nama")
    // isTypeModified drives the MODIFIED badge in the category line
    isTypeModified: raw.isTypeModified || false,
    finiture: raw.finiture || '',
  }
}

// ═══════════════════════════════════════════════════════
// MAIN GENERATOR — single function, two passes (measure + render)
// ═══════════════════════════════════════════════════════

export const generateLabelPDF = async (rawLabel, options = {}) => {
  const label = normalizeLabel(rawLabel)
  const [jpFont, pittogrammaData] = await Promise.all([
    loadJapaneseFont(),
    loadPittogramma(),
  ])

  // Barcode: generate pre-rotated vertical image
  let barcodeImg = null
  if (label.barcode) {
    barcodeImg = generateVerticalBarcodePdfDataUrl(label.barcode)
  }

  const W = options.widthMm || LABEL_W
  const M = MARGIN
  const TEXT_BUFFER = 2                              // safety buffer: jsPDF underestimates text width (reduced from 3 to allow single-line origin text)
  const CW = W - M * 2 - TEXT_BUFFER                // content width with safety margin
  const BC_W = BARCODE_COL_W                         // ALWAYS reserve barcode column — layout identical with or without EAN
  const TW = CW - BC_W                              // text width (always narrowed to keep layout consistent)
  const lang = label.language || 'it'
  const t = TRANSLATIONS[lang] || TRANSLATIONS.it
  const descText = label.legalDescription || t.desc
  const warnings = [t.pregnancy, t.minor, t.storage]
  // Ingredients/allergens: fallback chain — selected lang → English → Italian → any available
  const pickText = (obj) => {
    if (!obj) return ''
    return obj[lang] || obj.en || obj.it || Object.values(obj).find(v => v && typeof v === 'string' && v.trim()) || ''
  }
  const ingText = pickText(label.ingredients)
  const algText = pickText(label.allergens)
  const hasCJK = (text) => /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)

  // ─── PASS 1: MEASURE HEIGHT ──────────────────────────
  const tmp = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, 200] })
  let cy = M

  // Title (adaptive)
  cy += 1.4
  const titleText = (label.labelTitle || label.name || '').toUpperCase()
  const titleAvailW = CW - PITTO_SIZE - 4          // gap between title and pittogramma
  let titleStyle = TITLE_SIZES[0]
  let nameLines
  for (let i = 0; i < TITLE_SIZES.length; i++) {
    titleStyle = TITLE_SIZES[i]
    tmp.setFontSize(titleStyle.pt)
    nameLines = tmp.splitTextToSize(titleText, titleAvailW)
    if (nameLines.length <= 2) break
  }
  // Hard clamp: guarantee max 2 title lines (ellipsis if truncated)
  if (nameLines.length > 2) {
    nameLines = nameLines.slice(0, 2)
    const last = nameLines[1].replace(/\s+$/, '')
    nameLines[1] = last.length > 2 ? last.slice(0, -1).replace(/\s+$/, '') + '\u2026' : last + '\u2026'
  }
  cy += nameLines.length * titleStyle.ls

  // Category
  if (label.category) cy += TH.body

  // Sep1
  cy += 1.6

  // Description (full width, above barcode zone)
  cy += 0.5
  tmp.setFontSize(FS.body)
  const descLines = tmp.splitTextToSize(descText, CW)
  cy += TH.body
  if (descLines.length > 1) cy += (descLines.length - 1) * LS.body

  // ── BARCODE ZONE START ──
  const bcStartY = cy

  // Ingredients header + text
  if (ingText) {
    cy += 0.3
    cy += TH.ingH
    cy += 0.1
    tmp.setFontSize(FS.body)
    const ingLines = tmp.splitTextToSize(ingText, TW)
    cy += TH.body
    if (ingLines.length > 1) cy += (ingLines.length - 1) * LS.body
  }

  // Allergens
  if (algText) {
    tmp.setFontSize(FS.body)
    const algLines = tmp.splitTextToSize(t.alg + ': ' + algText.toUpperCase(), TW)
    cy += LS.body * algLines.length
  }

  // Alcohol
  if (label.alcoholPct) {
    cy += LS.body - TH.body
    cy += TH.body
  }

  // Volume
  if (label.volumeMl) {
    cy += LS.body - TH.body
    cy += TH.body
  }

  // Sep3
  cy += 1.0

  // Origin + Importer
  if (label.countryOfOrigin || label.importer?.name) {
    cy += 0.4
    tmp.setFontSize(FS.body)
    if (label.countryOfOrigin) {
      const countryName = COUNTRY_NAMES[label.countryOfOrigin]?.[lang] || label.countryOfOrigin
      const oLines = tmp.splitTextToSize(`${t.origin} ${countryName}`, CW)
      cy += TH.body
      if (oLines.length > 1) cy += (oLines.length - 1) * LS.body
    }
    if (label.importer?.name) {
      cy += LS.body - TH.body
      cy += TH.body
    }
    // Address merged with website (sakecompany.com joins last line)
    if (label.importer?.address) {
      const addrWithSite = `${label.importer.address}, ${t.website}`
      const aLines = tmp.splitTextToSize(addrWithSite, TW)
      cy += LS.body - TH.body
      cy += TH.body
      if (aLines.length > 1) cy += (aLines.length - 1) * LS.body
    } else {
      // No address → website alone
      cy += LS.body - TH.body
      cy += TH.body
    }
    // "Per:" line — ALWAYS reserved (empty if no perText) so label height is stable
    cy += LS.body - TH.body
    cy += TH.body
  }

  // ── BARCODE ZONE END ──
  cy += 0.8
  const bcEndY = cy

  // Footer sep + spacing
  cy += 0.5 // space for separator before footer

  // Footer (QR/BoxIcon left + Avvertenze right)
  const footerWarnX = M + QR_SIZE + 2.5
  const footerWarnW = W - M - footerWarnX - 5  // 5mm safety buffer (jsPDF underestimates text width)

  tmp.setFontSize(FS.warn)
  let warnH = 0.5 + TH.warnH
  warnH += tmp.splitTextToSize(warnings.join(' '), footerWarnW).length * LS.warn
  if (t.qrNutrition && !label._isBoxLabel) {
    warnH += tmp.splitTextToSize(t.qrNutrition, footerWarnW).length * LS.warn
  }
  const qrColH = QR_SIZE + 2.0
  cy += Math.max(qrColH, warnH)
  cy += TH.body  // Cod. + Lotto row

  // Extra bottom padding for barcode labels: text column is narrower → more wrapping → taller content
  // that gets too close to the bottom crop marks. Add padding to balance top/bottom spacing.
  const extraBottom = barcodeImg ? 1.5 : 0
  const H = Math.max(cy + M + extraBottom, 40)

  // ─── PASS 2: RENDER ──────────────────────────────────
  const OX = BLEED
  const OY = BLEED
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W + BLEED * 2, H + BLEED * 2] })
  const hasJpFont = registerJpFont(doc, jpFont)
  let y = M

  // Helper functions
  const setFont = (size, style = 'normal') => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
  }
  const setJpFont = (size) => {
    doc.setFontSize(size)
    if (hasJpFont) doc.setFont('NotoSansJP', 'normal')
    else doc.setFont('helvetica', 'normal')
  }
  const drawSep = () => {
    doc.setDrawColor(...SEP_COLOR)
    doc.setLineWidth(SEP_LW)
    doc.line(OX + M, OY + y, OX + W - M, OY + y)
  }
  const drawText = (text, baselineOffset) => {
    doc.text(text, OX + M, OY + y + baselineOffset)
  }

  // ── PITTOGRAMMA (top-right corner) ──
  if (pittogrammaData) {
    try {
      doc.addImage(pittogrammaData, 'PNG',
        OX + W - M - PITTO_SIZE - 4, OY + M + 1.0,
        PITTO_SIZE, PITTO_SIZE)
    } catch (e) { console.warn('[LabelPrinter] Pittogramma error:', e) }
  }

  // ── TITLE ──
  y += 1.4
  doc.setTextColor(0)
  setFont(titleStyle.pt, 'bold')
  let nameR = doc.splitTextToSize(titleText, titleAvailW)
  // Hard clamp: guarantee max 2 title lines (ellipsis if truncated)
  if (nameR.length > 2) {
    nameR = nameR.slice(0, 2)
    const last = nameR[1].replace(/\s+$/, '')
    nameR[1] = last.length > 2 ? last.slice(0, -1).replace(/\s+$/, '') + '\u2026' : last + '\u2026'
  }
  drawText(nameR, titleStyle.bl)
  y += nameR.length * titleStyle.ls

  // ── CATEGORY (composed tipologia + finiture) ──
  // category already contains: "Tokubetsu Honjozo Koshu Nama" (composed in useGenerateLabel)
  // isTypeModified → small asterisk + "MOD." tag printed after the category text
  if (label.category) {
    doc.setTextColor(100)
    setFont(FS.category, 'italic')
    let catLine = label.category
    if (label._isBoxLabel && label.bottlesPerBox) {
      catLine += ` · ${label.bottlesPerBox} ${label.bottlesPerBox === 1 ? 'bottiglia' : 'bottiglie'}`
    }
    drawText(catLine, BL.body)

    // MODIFIED badge: small asterisk + "MOD" in accent color, right after the category text
    if (label.isTypeModified) {
      const catW = doc.getTextWidth(catLine)
      const badgeX = OX + M + catW + 1.0  // 1mm gap after category text
      const badgeY = OY + y + BL.body
      doc.setFontSize(4.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(99, 91, 255)  // accent purple — matches the admin UI brand colour
      doc.text('MOD.', badgeX, badgeY)
      doc.setTextColor(100)
      setFont(FS.category, 'italic')  // restore for any following draws
    }

    y += TH.body
    doc.setTextColor(0)
  }

  // ── SEP 1 ──
  y += 1.6
  drawSep()

  // ── DESCRIPTION (full width, above barcode zone) ──
  y += 0.5
  setFont(FS.body, 'normal')
  const descR = doc.splitTextToSize(descText, CW)
  drawText(descR, BL.body)
  y += TH.body
  if (descR.length > 1) y += (descR.length - 1) * LS.body

  // ── BARCODE ZONE START ──
  const renderBcStartY = y

  // ── INGREDIENTS ──
  if (ingText) {
    y += 0.3
    setFont(FS.ingHeader, 'bold')
    drawText(t.ing + ':', BL.ingH)
    y += TH.ingH

    y += 0.1
    if (hasCJK(ingText) && hasJpFont) setJpFont(FS.body)
    else setFont(FS.body, 'normal')
    const ingR = doc.splitTextToSize(ingText, TW)
    drawText(ingR, BL.body)
    y += TH.body
    if (ingR.length > 1) y += (ingR.length - 1) * LS.body
  }

  // ── ALLERGENS ──
  if (algText) {
    y += LS.body - TH.body
    if (hasCJK(algText) && hasJpFont) setJpFont(FS.body)
    else setFont(FS.body, 'bold')
    const algLine = t.alg + ': ' + algText.toUpperCase()
    const algR = doc.splitTextToSize(algLine, TW)
    drawText(algR, BL.body)
    y += TH.body
    if (algR.length > 1) y += (algR.length - 1) * LS.body
  }

  // ── ALCOHOL ──
  setFont(FS.body, 'normal')
  if (label.alcoholPct) {
    y += LS.body - TH.body
    drawText(`${t.alc}: ${label.alcoholPct}% ${t.vol}`, BL.body)
    y += TH.body
  }

  // ── VOLUME ──
  if (label.volumeMl) {
    y += LS.body - TH.body
    drawText(`${t.content}: ${label.volumeMl}ml`, BL.body)
    y += TH.body
  }

  // ── SEP 3 ──
  y += 1.0
  drawSep()

  // ── ORIGIN + IMPORTER ──
  if (label.countryOfOrigin || label.importer?.name) {
    y += 0.4
    setFont(FS.body, 'bold')

    if (label.countryOfOrigin) {
      const countryName = COUNTRY_NAMES[label.countryOfOrigin]?.[lang] || label.countryOfOrigin
      const originText = `${t.origin} ${countryName}`
      const oR = doc.splitTextToSize(originText, CW)
      drawText(oR, BL.body)
      y += TH.body
      if (oR.length > 1) y += (oR.length - 1) * LS.body
    }

    // "Importato da:" in grey, company name in black
    if (label.importer?.name) {
      y += LS.body - TH.body
      const impPrefix = t.imp + ' '
      doc.setTextColor(130)
      setFont(FS.body, 'normal')
      doc.text(impPrefix, OX + M, OY + y + BL.body)
      const prefixW = doc.getTextWidth(impPrefix)
      doc.setTextColor(0)
      setFont(FS.body, 'normal')
      doc.text(label.importer.name, OX + M + prefixW, OY + y + BL.body)
      y += TH.body
    }

    // Address merged with website — sakecompany.com joins last line
    if (label.importer?.address) {
      y += LS.body - TH.body
      setFont(FS.body, 'normal')
      const addrWithSite = `${label.importer.address}, ${t.website}`
      const aR = doc.splitTextToSize(addrWithSite, TW)
      drawText(aR, BL.body)
      y += TH.body
      if (aR.length > 1) y += (aR.length - 1) * LS.body
    } else {
      // No address → website alone
      y += LS.body - TH.body
      setFont(FS.body, 'normal')
      drawText(t.website, BL.body)
      y += TH.body
    }

    // "Per:" line — ALWAYS reserved. Empty row if no perText, so label height is stable.
    y += LS.body - TH.body
    if (label.perText) {
      const perPrefix = 'Per: '
      doc.setTextColor(130)
      setFont(FS.body, 'normal')
      doc.text(perPrefix, OX + M, OY + y + BL.body)
      const perPrefixW = doc.getTextWidth(perPrefix)
      doc.setTextColor(0)
      setFont(FS.body, 'normal')
      // Truncate if too wide to prevent wrapping — safety net
      let perDisplay = label.perText
      const availW = TW - perPrefixW
      if (doc.getTextWidth(perDisplay) > availW) {
        // Truncate character by character until it fits, add ellipsis
        while (perDisplay.length > 1 && doc.getTextWidth(perDisplay + '…') > availW) {
          perDisplay = perDisplay.slice(0, -1)
        }
        perDisplay = perDisplay + '…'
      }
      doc.text(perDisplay, OX + M + perPrefixW, OY + y + BL.body)
    }
    y += TH.body
  }

  // ── BARCODE ZONE END ──
  y += 0.8
  const renderBcEndY = y

  // ── BARCODE IMAGE (vertical, right column) — maximize size, preserve aspect ──
  if (barcodeImg) {
    try {
      const bcAvailH = renderBcEndY - renderBcStartY - 1
      const bcMaxW = BC_W - 1.5  // tight margin to maximize horizontal space
      const aspect = barcodeImg.height / barcodeImg.width  // h/w of source

      // Try max width first
      let bcW = bcMaxW
      let bcH = bcW * aspect

      // If too tall, scale down BOTH dimensions to preserve aspect (no stretching)
      if (bcH > bcAvailH) {
        bcH = bcAvailH
        bcW = bcH / aspect
      }

      const bcX = OX + W - M - bcW + 0.3  // align right edge with content area
      const bcY = OY + renderBcStartY + 0.5 + (bcAvailH - bcH) / 2
      doc.addImage(barcodeImg.dataUrl, 'PNG', bcX, bcY, bcW, bcH)
    } catch (e) { console.warn('[LabelPrinter] Barcode error:', e) }
  }

  // ── SEP (before footer) ──
  drawSep()

  // ── FOOTER: QR/Box icon (left) + Avvertenze (right) ──
  const qrY = OY + y + 0.8
  const wX = OX + M + QR_SIZE + 2.5
  const wW = W - M - (M + QR_SIZE + 2.5) - 5  // 5mm safety buffer

  // QR code or Box icon
  if (label._isBoxLabel) {
    // Box label: draw box icon (loaded PNG or canvas-generated fallback)
    let boxDrawn = false
    if (label._boxIconDataUrl) {
      try {
        const fmt = label._boxIconDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
        doc.addImage(label._boxIconDataUrl, fmt, OX + M, qrY, QR_SIZE, QR_SIZE)
        boxDrawn = true
      } catch (e) { console.warn('[LabelPrinter] Box icon addImage failed:', e) }
    }
    if (!boxDrawn) {
      // Draw a simple box icon directly with jsPDF shapes
      const bx = OX + M, by = qrY, bs = QR_SIZE
      doc.setDrawColor(80)
      doc.setLineWidth(0.3)
      doc.setFillColor(240, 240, 240)
      // Box body
      doc.rect(bx + bs * 0.1, by + bs * 0.3, bs * 0.8, bs * 0.6, 'FD')
      // Box lid (trapezoid via lines)
      doc.setFillColor(220, 220, 220)
      doc.triangle(bx + bs * 0.1, by + bs * 0.3, bx + bs * 0.25, by + bs * 0.1, bx + bs * 0.9, by + bs * 0.3, 'FD')
      doc.triangle(bx + bs * 0.25, by + bs * 0.1, bx + bs * 0.75, by + bs * 0.1, bx + bs * 0.9, by + bs * 0.3, 'FD')
      // Center line
      doc.setLineDash([0.5, 0.3])
      doc.line(bx + bs * 0.5, by + bs * 0.3, bx + bs * 0.5, by + bs * 0.9)
      doc.setLineDash([])
    }
  } else if (label.qr) {
    try { doc.addImage(label.qr, 'PNG', OX + M, qrY, QR_SIZE, QR_SIZE) }
    catch { doc.rect(OX + M, qrY, QR_SIZE, QR_SIZE) }
  } else {
    doc.setDrawColor(...SEP_COLOR)
    doc.setLineWidth(SEP_LW)
    doc.rect(OX + M, qrY, QR_SIZE, QR_SIZE)
    doc.setFontSize(4)
    doc.text('QR CODE', OX + M + 4, qrY + 8)
  }

  // Avvertenze
  let wy = qrY
  setFont(FS.warnHeader, 'bold')
  doc.text(t.warn + ':', wX, wy + BL.warnH)
  wy += TH.warnH + (LS.warn - TH.warn)

  setFont(FS.warn, 'normal')
  const allWarnText = warnings.join(' ')
  const warnLines = doc.splitTextToSize(allWarnText, wW)
  doc.text(warnLines, wX, wy + BL.warn)
  wy += warnLines.length * LS.warn

  // "Info nutrizionali nel QR" — only on bottle labels (box has no QR)
  if (t.qrNutrition && !label._isBoxLabel) {
    const nutLines = doc.splitTextToSize(t.qrNutrition, wW)
    doc.text(nutLines, wX, wy + BL.warn)
    wy += nutLines.length * LS.warn
  }

  // ── BOTTOM ROW: Cod. + Lotto ──
  const bottomRowY = Math.max(qrY + QR_SIZE + 2.0, wy + 1.0)
  setFont(FS.cod, 'normal')
  doc.setTextColor(0)
  doc.text(`${t.code} ${label.code || ''}`, OX + M, bottomRowY)
  doc.setTextColor(100)
  const lotDisplay = label.lotNumber
    ? `${t.lotPrefix} ${label.lotNumber}`
    : t.lot
  doc.text(lotDisplay, wX, bottomRowY)
  doc.setTextColor(0)

  // ── CROP MARKS ──
  const cmLen = 3, cmGap = 0.8, cmLw = 0.15
  doc.setDrawColor(160, 160, 160)
  doc.setLineWidth(cmLw)
  const cL = OX + M - cmGap
  const cR = OX + W - M + cmGap
  const cT = OY + M - cmGap
  const cB = OY + H - M + cmGap
  // Top-left
  doc.line(cL - cmLen, cT, cL, cT)
  doc.line(cL, cT - cmLen, cL, cT)
  // Top-right
  doc.line(cR, cT, cR + cmLen, cT)
  doc.line(cR, cT - cmLen, cR, cT)
  // Bottom-left
  doc.line(cL - cmLen, cB, cL, cB)
  doc.line(cL, cB, cL, cB + cmLen)
  // Bottom-right
  doc.line(cR, cB, cR + cmLen, cB)
  doc.line(cR, cB, cR, cB + cmLen)

  return doc
}

// ═══════════════════════════════════════════════════════
// BOX ICON FALLBACK (programmatic)
// ═══════════════════════════════════════════════════════

function generateBoxIconDataUrl(size = 200) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const p = size * 0.1
  const w = size - p * 2
  const h = size - p * 2
  const cx = size / 2
  const topH = h * 0.25

  ctx.strokeStyle = '#444'
  ctx.lineWidth = size * 0.025
  ctx.fillStyle = '#f5f5f5'

  ctx.fillRect(p, p + topH, w, h - topH)
  ctx.strokeRect(p, p + topH, w, h - topH)

  ctx.beginPath()
  ctx.moveTo(p, p + topH)
  ctx.lineTo(p + w * 0.15, p)
  ctx.lineTo(p + w * 0.85, p)
  ctx.lineTo(p + w, p + topH)
  ctx.closePath()
  ctx.fillStyle = '#e8e8e8'
  ctx.fill()
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, p)
  ctx.lineTo(cx, p + topH)
  ctx.stroke()

  ctx.setLineDash([size * 0.03, size * 0.02])
  ctx.beginPath()
  ctx.moveTo(cx, p + topH)
  ctx.lineTo(cx, p + h)
  ctx.stroke()
  ctx.setLineDash([])

  return canvas.toDataURL('image/png')
}

// ═══════════════════════════════════════════════════════
// PUBLIC API — download functions
// ═══════════════════════════════════════════════════════

/**
 * Download bottle label PDF
 */
export const downloadLabelPDF = async (rawLabel, options) => {
  const label = normalizeLabel(rawLabel)
  const doc = await generateLabelPDF(label, options)
  const safeName = (label.name || 'prodotto').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')
  doc.save(`${label.code || 'label'}-${safeName}-BOTTIGLIA.pdf`)
}

/**
 * Download box label PDF — box icon instead of QR, box EAN barcode
 */
export const downloadBoxLabelPDF = async (rawLabel, options) => {
  const label = normalizeLabel(rawLabel)
  let boxIconDataUrl = await loadBoxIcon()
  if (!boxIconDataUrl) boxIconDataUrl = generateBoxIconDataUrl(300)
  const boxLabel = {
    ...label,
    barcode: label.barcodeBox || null,  // only box EAN, no fallback
    _isBoxLabel: true,
    _boxIconDataUrl: boxIconDataUrl,
  }
  const doc = await generateLabelPDF(boxLabel, options)
  const safeName = (label.name || 'prodotto').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')
  doc.save(`${label.code || 'label'}-${safeName}-BOX.pdf`)
}

/**
 * Download both bottle + box labels
 */
export const downloadBothLabelsPDF = async (label, options) => {
  await downloadLabelPDF(label, options)
  if (label.barcodeBox) {
    await downloadBoxLabelPDF(label, options)
  }
}

/**
 * Download batch — one label per product
 */
export const downloadBatchPDF = async (labels, options = {}) => {
  if (!labels.length) return
  for (const label of labels) {
    await downloadLabelPDF(label, options)
  }
}

export default { generateLabelPDF, downloadLabelPDF, downloadBoxLabelPDF, downloadBothLabelsPDF, downloadBatchPDF }
