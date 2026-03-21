/**
 * Label Printer Service — BACK LABEL (retro etichetta)
 *
 * EU Regulation 1169/2011 font requirements:
 *   - x-height >= 1.2mm (packaging > 80cm²)
 *   - x-height >= 0.9mm (packaging <= 80cm²)
 *
 * QR code: minimum 13×13mm (EU e-label requirement)
 * Target label: 55mm × dynamic height
 *
 * LAYOUT v3 — pixel-precise match to design PDF
 * All measurements extracted via PyMuPDF from S093-1800-hiyashibori-gold.pdf
 */

import { jsPDF } from 'jspdf'
import { generateVerticalBarcodePdfDataUrl } from './barcodeGenerator'

// ---- CJK Font Loader (Noto Sans JP) ----
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
    console.log('[LabelPrinter] Noto Sans JP loaded')
    return cachedFontBase64
  } catch (err) {
    console.warn('[LabelPrinter] CJK font unavailable, JP text may not render:', err.message)
    return null
  }
}

// ---- Pittogramma Loader ----
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
    console.log('[LabelPrinter] Pittogramma loaded')
    return cachedPittogramma
  } catch (err) {
    console.warn('[LabelPrinter] Pittogramma unavailable:', err.message)
    return null
  }
}

function registerJpFont(doc, fontBase64) {
  if (!fontBase64) return false
  doc.addFileToVFS('NotoSansJP-Regular.ttf', fontBase64)
  doc.addFont('NotoSansJP-Regular.ttf', 'NotoSansJP', 'normal')
  return true
}

// ============================================================
// FONT SIZES — from design PDF (extracted via PyMuPDF)
// EU Reg 1169/2011: x-height >= 0.9mm for packages <= 80cm²
// Helvetica x-height ≈ 0.52 × font_size_mm
//   5pt → x-height 0.92mm (borderline)
//   5.5pt → x-height 1.01mm (safe)
//   6pt → x-height 1.10mm (safe)
// ============================================================
const F = {
  title: 8,         // Product name — Helvetica Bold (auto-reduced for long names)
  subtitle: 6,      // Category — Helvetica Regular (italic in rendering)
  ingHeader: 6.5,   // "Ingredienti:" — Helvetica Bold
  body: 6,          // Body text — Helvetica Regular
  warnHeader: 5.5,  // "Avvertenze:" — Helvetica Bold
  warn: 5.5,        // Warning lines — min 5.5pt for legal compliance (x-height 1.01mm)
  cod: 5.5,         // "Cod." — same minimum
}

// Title font sizes for adaptive scaling
const TITLE_SIZES = [
  { pt: 8,   bl: 2.0, th: 2.8, ls: 3.1 },   // default
  { pt: 7,   bl: 1.75, th: 2.5, ls: 2.75 },  // 2-line fallback
  { pt: 6.5, bl: 1.6, th: 2.3, ls: 2.55 },   // 3-line fallback
]

// ============================================================
// BASELINE OFFSETS — distance from text TOP to jsPDF baseline
// These depend on font size (for Helvetica: ~ascender ratio 0.72)
// ============================================================
const BL = {
  title: 2.0,    // 8pt (overridden by adaptive title)
  body: 1.5,     // 6pt
  ingH: 1.6,     // 6.5pt
  warn: 1.35,    // 5.5pt (was 1.2 for 5pt)
  warnH: 1.4,    // 5.5pt
}

// ============================================================
// TEXT HEIGHTS — approximate cap-height + descender for each size
// ============================================================
const TH = {
  title: 2.8,    // 8pt (overridden by adaptive title)
  body: 2.1,     // 6pt
  ingH: 2.3,     // 6.5pt
  warn: 1.94,    // 5.5pt (was 1.76 for 5pt)
  warnH: 1.94,   // 5.5pt
}

// ============================================================
// SEPARATOR — from design PDF
// ============================================================
const SEP_WIDTH_PT = 0.20  // line width in points
const SEP_R = 190, SEP_G = 192, SEP_B = 194  // line color

// ============================================================
// LAYOUT — from design PDF
// ============================================================
const PITTO_SIZE = 6.1     // pittogramma icon 6.1×6.1mm
const QR_SIZE = 15         // QR code 15×15mm

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
    code: 'Cod.',
    website: 'sakecompany.com',
    qrNutrition: 'Indicazioni nutrizionali nel QR',
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
    code: 'Art.-Nr.',
    website: 'sakecompany.com',
    qrNutrition: 'Nährwertangaben im QR-Code',
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
    code: 'Réf.',
    website: 'sakecompany.com',
    qrNutrition: 'Informations nutritionnelles dans le QR',
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
    code: 'Cód.',
    website: 'sakecompany.com',
    qrNutrition: 'Información nutricional en el QR',
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
    code: 'コード',
    website: 'sakecompany.com',
    qrNutrition: '栄養成分表示はQRコードに記載',
  },
}

/**
 * Generate compact print-ready back label PDF (v3 — pixel-precise)
 *
 * y cursor tracks the TOP EDGE of where the next element will be placed.
 * Text is drawn at y + baseline_offset.
 * After text, y advances by text_height.
 * Before separator, y advances by the measured gap from the design.
 * After separator, y advances by the measured gap to next text top.
 */
export const generateLabelPDF = async (label, options = {}) => {
  const [jpFont, pittogrammaData] = await Promise.all([
    loadJapaneseFont(),
    loadPittogramma(),
  ])

  // Generate barcode image if EAN code is available (pre-rotated vertical)
  let barcodeImg = null
  if (label.barcode) {
    barcodeImg = generateVerticalBarcodePdfDataUrl(label.barcode)
  }

  const W = options.widthMm || 55
  const M = 2.5
  const CW = W - M * 2  // 50mm content width
  // Barcode column: when barcode present, reserve space on the right
  const BARCODE_COL_W = barcodeImg ? 12 : 0  // 12mm column for barcode
  const CW_BC = CW - BARCODE_COL_W  // narrowed content width when barcode present
  const lang = label.language || 'it'
  const t = TRANSLATIONS[lang] || TRANSLATIONS.it
  // Legal description: custom from label > default translation
  const descText = label.legalDescription || t.desc
  const warnings = [t.pregnancy, t.minor, t.storage]
  const BODY_LS = 2.5   // body line spacing (top-to-top)
  const WARN_LS = 2.1   // warning line spacing
  const ingText = label.ingredients?.[lang] || ''
  const algText = label.allergens?.[lang] || ''

  // -------------------------------------------------------
  // Phase 1: measure total height (dry run)
  // -------------------------------------------------------
  const tmp = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, 200] })
  let cy = M  // cursor y = top edge

  // -- Box label banner (if applicable) --
  if (label._isBoxLabel) {
    cy += 4.5  // banner height (background bar + text + gap)
  }

  // -- Title (adaptive sizing) --
  cy += 1.4  // margin to title top (design: 3.9 - 2.5 = 1.4)
  const titleText = (label.labelTitle || label.name || '').toUpperCase()
  const titleAvailW = CW - PITTO_SIZE - 2
  let titleStyle = TITLE_SIZES[0]  // start with 8pt
  let nameLines

  for (let i = 0; i < TITLE_SIZES.length; i++) {
    titleStyle = TITLE_SIZES[i]
    tmp.setFontSize(titleStyle.pt)
    nameLines = tmp.splitTextToSize(titleText, titleAvailW)
    if (nameLines.length <= 2) break  // fits in 2 lines, use this size
  }
  cy += nameLines.length * titleStyle.ls

  // -- Category --
  // After title, cy is already at category top (8pt line spacing 3.1 = title height 2.8 + 0.3 leading)
  if (label.category) {
    cy += TH.body  // category text height
  }

  // -- Sep1 --
  cy += 1.6  // category bottom to sep1 (reduced)

  // -- Description (left-aligned) --
  cy += 0.5  // sep1 to desc top
  tmp.setFontSize(F.body)
  const descLines = tmp.splitTextToSize(descText, CW)
  cy += TH.body  // first line height
  if (descLines.length > 1) cy += (descLines.length - 1) * BODY_LS

  // -- Ingredients section (use CW_BC if barcode present) --
  const bcStartY = cy  // track where barcode column starts
  if (ingText) {
    cy += 0.3  // desc to "Ingredienti:" top (no sep2)
    cy += TH.ingH  // header height
    cy += 0.1  // header bottom to ingredient text top

    tmp.setFontSize(F.body)
    const ingLines = tmp.splitTextToSize(ingText, CW_BC)
    cy += TH.body  // first ingredient line
    if (ingLines.length > 1) cy += (ingLines.length - 1) * BODY_LS
  }

  // Allergens
  if (algText) {
    tmp.setFontSize(F.body)
    const algLines = tmp.splitTextToSize(t.alg + ': ' + algText.toUpperCase(), CW_BC)
    cy += BODY_LS * algLines.length // includes gap from prev
  }

  // Alcohol + Volume (same section, same spacing)
  if (label.alcoholPct) {
    cy += BODY_LS - TH.body  // gap from previous text bottom to this text top
    cy += TH.body
  }
  if (label.volumeMl) {
    cy += BODY_LS - TH.body
    cy += TH.body
  }

  // -- Sep3 --
  cy += 1.0  // last text bottom to sep3 (reduced)

  // -- Origin + Importer section --
  if (label.countryOfOrigin || label.importer?.name) {
    cy += 0.4  // sep3 to origin text top (reduced)

    tmp.setFontSize(F.body)
    if (label.countryOfOrigin) {
      const originText = `${t.origin} ${label.countryOfOrigin}`
      const oLines = tmp.splitTextToSize(originText, CW_BC)
      cy += TH.body
      if (oLines.length > 1) cy += (oLines.length - 1) * BODY_LS
    }
    // "Importato da: Sake Company srl" on same line
    if (label.importer?.name) {
      cy += BODY_LS - TH.body
      const impLine = `${t.imp} ${label.importer.name}`
      const impLines = tmp.splitTextToSize(impLine, CW_BC)
      cy += TH.body
      if (impLines.length > 1) cy += (impLines.length - 1) * BODY_LS
    }
    if (label.importer?.address) {
      const aLines = tmp.splitTextToSize(label.importer.address, CW_BC)
      cy += BODY_LS - TH.body
      cy += TH.body
      if (aLines.length > 1) cy += (aLines.length - 1) * BODY_LS
    }
    // Website
    cy += BODY_LS - TH.body
    cy += TH.body
  }

  // -- end barcode column --
  cy += 0.8  // origin section to footer
  const bcEndY = cy  // track where barcode column ends

  // -- Footer (QR + Avvertenze) --
  const fWarnX = M + QR_SIZE + 2.5
  const fWarnW = W - M - fWarnX

  tmp.setFontSize(F.warn)
  let warnH = WARN_LS  // avvertenze header line
  warnings.forEach(w => {
    warnH += tmp.splitTextToSize(w, fWarnW).length * WARN_LS
  })
  warnH += WARN_LS * 0.3 + WARN_LS  // qrNutrition line
  const qrColH = label._isBoxLabel ? QR_SIZE + 4.5 : QR_SIZE + 2.0  // space for QR + bottom row
  const footerH = Math.max(qrColH, warnH)
  cy += footerH
  cy += TH.body  // bottom row (Cod. + Lotto)

  const H = Math.max(cy + M, 40)

  // -------------------------------------------------------
  // Phase 2: render (page includes bleed area for crop marks)
  // -------------------------------------------------------
  const BLEED = 5  // extra space around label for crop marks
  const OX = BLEED  // x offset for all content
  const OY = BLEED  // y offset for all content
  const PW = W + BLEED * 2
  const PH = H + BLEED * 2
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PW, PH] })
  const hasJpFont = registerJpFont(doc, jpFont)
  let y = M  // cursor: top edge of next element

  const hFont = (size, style = 'normal') => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
  }
  const jpFontSet = (size) => {
    doc.setFontSize(size)
    if (hasJpFont) doc.setFont('NotoSansJP', 'normal')
    else doc.setFont('helvetica', 'normal')
  }
  const sep = () => {
    doc.setDrawColor(SEP_R, SEP_G, SEP_B)
    doc.setLineWidth(SEP_WIDTH_PT * 0.3528) // pt → mm
    doc.line(OX + M, OY + y, OX + W - M, OY + y)
  }
  // Draw text at top position y, returns nothing (caller advances y)
  const txt = (text, bl) => {
    doc.text(text, OX + M, OY + y + bl)
  }
  const txtAt = (text, x, bl) => {
    doc.text(text, OX + x, OY + y + bl)
  }

  // =================================================================
  // RENDER
  // =================================================================

  // --- Box label banner ---
  if (label._isBoxLabel) {
    doc.setFillColor(60, 60, 60)
    doc.rect(OX + M, OY + M, CW, 3.5, 'F')
    doc.setTextColor(255)
    hFont(6, 'bold')
    doc.text('ETICHETTA BOX', OX + M + CW / 2, OY + M + 2.3, { align: 'center' })
    doc.setTextColor(0)
    y += 4.5
  }

  // --- Pittogramma (top-right) ---
  if (pittogrammaData) {
    try {
      doc.addImage(pittogrammaData, 'PNG',
        OX + W - M - PITTO_SIZE, OY + M + 1.0,
        PITTO_SIZE, PITTO_SIZE)
    } catch (e) {
      console.warn('[LabelPrinter] Could not add pittogramma:', e)
    }
  }

  // --- Title: product name (adaptive size from Phase 1) ---
  y += 1.4  // margin to title top
  hFont(titleStyle.pt, 'bold')
  const nameR = doc.splitTextToSize(titleText, titleAvailW)
  txt(nameR, titleStyle.bl)
  y += nameR.length * titleStyle.ls

  // --- Category ---
  if (label.category) {
    doc.setTextColor(100)
    hFont(F.subtitle, 'italic')
    const catText = label.seimaibuai
      ? `${label.category}  ·  ${label.seimaibuai}%`
      : label.category
    txt(catText, BL.body)
    y += TH.body
    doc.setTextColor(0)
  }

  // --- Sep1 ---
  y += 1.6
  sep()

  // --- Description (left-aligned) ---
  y += 0.5
  hFont(F.body, 'normal')
  const descR = doc.splitTextToSize(descText, CW)
  txt(descR, BL.body)
  y += TH.body
  if (descR.length > 1) y += (descR.length - 1) * BODY_LS

  // --- Ingredients section (narrowed if barcode present) ---
  const renderBcStartY = y  // remember barcode column start
  if (ingText) {
    y += 0.3
    hFont(F.ingHeader, 'bold')
    txt(t.ing + ':', BL.ingH)
    y += TH.ingH

    y += 0.1
    hFont(F.body, 'normal')
    const ingR = doc.splitTextToSize(ingText, CW_BC)
    txt(ingR, BL.body)
    y += TH.body
    if (ingR.length > 1) y += (ingR.length - 1) * BODY_LS
  }

  // Allergens
  if (algText) {
    y += BODY_LS - TH.body
    hFont(F.body, 'bold')
    const algLine = t.alg + ': ' + algText.toUpperCase()
    const algR = doc.splitTextToSize(algLine, CW_BC)
    txt(algR, BL.body)
    y += TH.body
    if (algR.length > 1) y += (algR.length - 1) * BODY_LS
  }

  // Alcohol
  hFont(F.body, 'normal')
  if (label.alcoholPct) {
    y += BODY_LS - TH.body
    txt(`${t.alc}: ${label.alcoholPct}% ${t.vol}`, BL.body)
    y += TH.body
  }

  // Volume
  if (label.volumeMl) {
    y += BODY_LS - TH.body
    txt(`${t.content}: ${label.volumeMl}ml`, BL.body)
    y += TH.body
  }

  // --- Sep3 ---
  y += 1.0
  sep()

  // --- Origin + Importer ---
  if (label.countryOfOrigin || label.importer?.name) {
    y += 0.4
    hFont(F.body, 'bold')

    if (label.countryOfOrigin) {
      const originText = `${t.origin} ${label.countryOfOrigin}`
      const oR = doc.splitTextToSize(originText, CW_BC)
      txt(oR, BL.body)
      y += TH.body
      if (oR.length > 1) y += (oR.length - 1) * BODY_LS
    }

    // "Importato da: Sake Company srl" — "Importato da:" in grey, name in black
    if (label.importer?.name) {
      y += BODY_LS - TH.body
      const impPrefix = t.imp + ' '
      // Draw prefix in grey
      doc.setTextColor(130)
      hFont(F.body, 'normal')
      doc.text(impPrefix, OX + M, OY + y + BL.body)
      // Measure prefix width and draw name in black after it
      const prefixW = doc.getTextWidth(impPrefix)
      doc.setTextColor(0)
      hFont(F.body, 'normal')
      doc.text(label.importer.name, OX + M + prefixW, OY + y + BL.body)
      y += TH.body
    }

    if (label.importer?.address) {
      y += BODY_LS - TH.body
      hFont(F.body, 'normal')
      const aR = doc.splitTextToSize(label.importer.address, CW_BC)
      txt(aR, BL.body)
      y += TH.body
      if (aR.length > 1) y += (aR.length - 1) * BODY_LS
    }

    // Website
    y += BODY_LS - TH.body
    hFont(F.body, 'normal')
    txt(t.website, BL.body)
    y += TH.body
  }

  // --- end of barcode column ---
  y += 0.8
  const renderBcEndY = y  // barcode column ends here

  // --- EAN Barcode (right column, pre-rotated vertical image) ---
  if (barcodeImg) {
    try {
      // Place the pre-rotated vertical barcode in the right column
      const bcX = OX + W - M - BARCODE_COL_W + 0.5
      const bcAvailH = renderBcEndY - renderBcStartY - 2
      const bcW = BARCODE_COL_W - 1  // image width in mm
      // Maintain aspect ratio from the pre-rotated image
      const aspect = barcodeImg.height / barcodeImg.width  // rotated: width=srcH, height=srcW
      let bcH = bcW * aspect
      // Clamp to available height
      if (bcH > bcAvailH) bcH = bcAvailH
      // Center vertically in the available space
      const bcY = OY + renderBcStartY + 1 + (bcAvailH - bcH) / 2
      doc.addImage(barcodeImg.dataUrl, 'PNG', bcX, bcY, bcW, bcH)
    } catch (e) {
      console.warn('[LabelPrinter] Could not add barcode:', e)
    }
  }

  // --- Footer: QR left + Avvertenze right ---
  const qrY = OY + y + 0.8
  const wX = OX + M + QR_SIZE + 2.5
  const wW = W - M - (M + QR_SIZE + 2.5)

  // QR code (or box icon for box labels)
  if (label._isBoxLabel && label._boxIconDataUrl) {
    // Box label: show box icon instead of QR code
    try { doc.addImage(label._boxIconDataUrl, 'PNG', OX + M, qrY, QR_SIZE, QR_SIZE) }
    catch { doc.rect(OX + M, qrY, QR_SIZE, QR_SIZE) }
  } else if (label.qr) {
    try { doc.addImage(label.qr, 'PNG', OX + M, qrY, QR_SIZE, QR_SIZE) }
    catch { doc.rect(OX + M, qrY, QR_SIZE, QR_SIZE) }
  } else {
    doc.setDrawColor(SEP_R, SEP_G, SEP_B)
    doc.setLineWidth(SEP_WIDTH_PT * 0.3528)
    doc.rect(OX + M, qrY, QR_SIZE, QR_SIZE)
    doc.setFontSize(4)
    doc.text('QR CODE', OX + M + 4, qrY + 8)
  }

  // Box label indicator text
  if (label._isBoxLabel) {
    hFont(4.5, 'bold')
    doc.setTextColor(120)
    doc.text('BOX', OX + M + QR_SIZE / 2, qrY + QR_SIZE + 2.5, { align: 'center' })
    doc.setTextColor(0)
  }

  // Avvertenze — cap top of "A" aligned with QR top edge
  let wy = qrY
  hFont(F.warnHeader, 'bold')
  doc.text(t.warn + ':', wX, wy)
  wy += WARN_LS

  hFont(F.warn, 'normal')
  warnings.forEach(warn => {
    const wR = doc.splitTextToSize(warn, wW)
    doc.text(wR, wX, wy + BL.warn)
    wy += wR.length * WARN_LS
  })

  // QR nutrition info text (inside Avvertenze column)
  if (t.qrNutrition) {
    wy += WARN_LS * 0.3
    hFont(F.warn, 'normal')
    doc.text(t.qrNutrition, wX, wy + BL.warn)
    wy += WARN_LS
  }

  // --- Bottom row: Cod. left (under QR) + Lotto right ---
  const bottomRowY = qrY + QR_SIZE + 2.0
  hFont(F.cod, 'normal')
  doc.setTextColor(0)
  doc.text(`${t.code} ${label.code || ''}`, OX + M, bottomRowY)

  doc.setTextColor(100)
  hFont(F.cod, 'normal')
  doc.text(t.lot, wX, bottomRowY)
  doc.setTextColor(0)

  // --- Crop marks (light L-shaped at 4 corners) ---
  // Marks are placed at the corners of the content area (margin edges)
  const CM_LEN = 3      // length of each L arm in mm
  const CM_GAP = 0.8    // gap between mark and content edge
  const CM_LW = 0.15    // line width in mm (very light)
  doc.setDrawColor(160, 160, 160)  // light grey
  doc.setLineWidth(CM_LW)

  const cL = OX + M - CM_GAP          // left edge
  const cR = OX + W - M + CM_GAP      // right edge
  const cT = OY + M - CM_GAP          // top edge
  const cB = OY + H - M + CM_GAP      // bottom edge

  // Top-left L
  doc.line(cL - CM_LEN, cT, cL, cT)  // horizontal →
  doc.line(cL, cT - CM_LEN, cL, cT)  // vertical ↓

  // Top-right L
  doc.line(cR, cT, cR + CM_LEN, cT)  // horizontal →
  doc.line(cR, cT - CM_LEN, cR, cT)  // vertical ↓

  // Bottom-left L
  doc.line(cL - CM_LEN, cB, cL, cB)  // horizontal →
  doc.line(cL, cB, cL, cB + CM_LEN)  // vertical ↓

  // Bottom-right L
  doc.line(cR, cB, cR + CM_LEN, cB)  // horizontal →
  doc.line(cR, cB, cR, cB + CM_LEN)  // vertical ↓

  return doc
}

/**
 * Generate a simple box icon as a data URL (SVG → Canvas → PNG)
 */
function generateBoxIconDataUrl(size = 200) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Draw a box/package icon
  const p = size * 0.1  // padding
  const w = size - p * 2
  const h = size - p * 2
  const cx = size / 2
  const topH = h * 0.25  // top flap height

  ctx.strokeStyle = '#444'
  ctx.lineWidth = size * 0.025
  ctx.fillStyle = '#f5f5f5'

  // Main box body
  ctx.fillRect(p, p + topH, w, h - topH)
  ctx.strokeRect(p, p + topH, w, h - topH)

  // Top flap (trapezoid)
  ctx.beginPath()
  ctx.moveTo(p, p + topH)
  ctx.lineTo(p + w * 0.15, p)
  ctx.lineTo(p + w * 0.85, p)
  ctx.lineTo(p + w, p + topH)
  ctx.closePath()
  ctx.fillStyle = '#e8e8e8'
  ctx.fill()
  ctx.stroke()

  // Center line on top flap
  ctx.beginPath()
  ctx.moveTo(cx, p)
  ctx.lineTo(cx, p + topH)
  ctx.stroke()

  // Vertical center line on box body
  ctx.setLineDash([size * 0.03, size * 0.02])
  ctx.beginPath()
  ctx.moveTo(cx, p + topH)
  ctx.lineTo(cx, p + h)
  ctx.stroke()
  ctx.setLineDash([])

  // "BOX" text
  ctx.fillStyle = '#333'
  ctx.font = `bold ${size * 0.15}px Helvetica, Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('BOX', cx, p + topH + (h - topH) * 0.55)

  return canvas.toDataURL('image/png')
}

/**
 * Download single label PDF (bottle label)
 */
export const downloadLabelPDF = async (label, options) => {
  const doc = await generateLabelPDF(label, options)
  const safeName = (label.name || 'prodotto').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-')
  doc.save(`${label.code || 'label'}-${safeName}-BOTTIGLIA.pdf`)
}

/**
 * Download box label PDF — replaces QR with box icon, uses box EAN
 */
export const downloadBoxLabelPDF = async (label, options) => {
  const boxIconDataUrl = generateBoxIconDataUrl(300)
  const boxLabel = {
    ...label,
    barcode: label.barcodeBox || label.barcode,  // use box EAN
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
 * Download batch — one label per page
 */
export const downloadBatchPDF = async (labels, options = {}) => {
  if (!labels.length) return
  for (const label of labels) {
    await downloadLabelPDF(label, options)
  }
}

export default { generateLabelPDF, downloadLabelPDF, downloadBoxLabelPDF, downloadBothLabelsPDF, downloadBatchPDF }
