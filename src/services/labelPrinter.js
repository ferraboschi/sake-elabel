/**
 * Label Printer Service — BACK LABEL (retro etichetta)
 *
 * EU Regulation 1169/2011 font requirements:
 *   - x-height >= 1.2mm (packaging > 80cm²)
 *   - x-height >= 0.9mm (packaging <= 80cm²)
 *   - Helvetica x-height ≈ 0.52 × font-size
 *   - 1.2mm x-height → 6.5pt minimum font
 *   - 0.9mm x-height → 5pt minimum font
 *
 * QR code: minimum 13×13mm (EU e-label requirement)
 * Target label: ~55mm × dynamic height
 *
 * NOTE: Nutrition and disposal info are NOT on the back label.
 *       They are accessed via QR code → e-label web page.
 *
 * Layout:
 * ┌──────────────────────────────────┐
 * │ Product Name (EN)                │
 * │ 日本語名                          │
 * │ Daiginjo · 精米歩合 50%          │
 * │──────────────────────────────────│
 * │ Bevanda alcolica fermentata      │
 * │ di riso (SAKE)                   │
 * │──────────────────────────────────│
 * │ Alcool: 16% Vol.                 │
 * │ Contenuto: 720ml                 │
 * │──────────────────────────────────│
 * │ Ingredienti: riso, malto di      │
 * │ riso, alcol, acqua               │
 * │──────────────────────────────────│
 * │ Prodotto e confez. in Giappone   │
 * │ Importato da: Sake Company srl   │
 * │ Via Bianca di Savoia 17, MI      │
 * │──────────────────────────────────│
 * │ Avvertenze:                      │
 * │ Sconsigliato in gravidanza...    │
 * │ Vietata la vendita ai minori...  │
 * │ Conservare in luogo fresco...    │
 * │──────────────────────────────────│
 * │ Lotto: vedi confezione           │
 * │──────────────────────────────────│
 * │ [QR 15mm]    S093-0720           │
 * │              Konishi Shuzo       │
 * │              小西酒造（株）       │
 * │              EAN: 45275380...    │
 * └──────────────────────────────────┘
 */

import { jsPDF } from 'jspdf'

// Font sizes (pt) — EU compliant minimums
const FONT = {
  title: 7.5,       // Product name EN — prominent
  titleJp: 7,       // Product name JP
  subtitle: 6,      // Type, seimaibuai
  body: 6.5,        // Description, ingredients — 1.2mm x-height
  bodySmall: 5.5,   // Warnings, importer — 0.9mm compliant
  caption: 5,       // Product code, EAN, lot — 0.9mm minimum
}

const TRANSLATIONS = {
  it: {
    desc: 'Bevanda alcolica fermentata di riso (SAKE)',
    alc: 'Alcool', vol: 'Vol.', content: 'Contenuto',
    ing: 'Ingredienti', alg: 'Allergeni',
    origin: 'Prodotto e confezionato in', imp: 'Importato da',
    warn: 'Avvertenze',
    pregnancy: 'Sconsigliato in gravidanza e allattamento.',
    minor: 'Vietata la vendita ai minori di 18 anni.',
    storage: 'Conservare in luogo fresco e asciutto, al riparo dalla luce.',
    lot: 'Lotto: vedi sulla confezione',
    code: 'Cod',
  },
  de: {
    desc: 'Fermentiertes alkoholisches Reisgetränk (SAKE)',
    alc: 'Alkohol', vol: 'Vol.', content: 'Inhalt',
    ing: 'Zutaten', alg: 'Allergene',
    origin: 'Hergestellt und verpackt in', imp: 'Importiert von',
    warn: 'Hinweise',
    pregnancy: 'In Schwangerschaft und Stillzeit nicht empfohlen.',
    minor: 'Verkauf an Minderjährige unter 18 Jahren verboten.',
    storage: 'Kühl und trocken lagern, vor Licht schützen.',
    lot: 'Los: siehe Verpackung',
    code: 'Art.-Nr',
  },
  fr: {
    desc: 'Boisson alcoolique fermentée de riz (SAKE)',
    alc: 'Alcool', vol: 'Vol.', content: 'Contenu',
    ing: 'Ingrédients', alg: 'Allergènes',
    origin: 'Produit et conditionné au', imp: 'Importé par',
    warn: 'Avertissements',
    pregnancy: 'Déconseillé pendant la grossesse et l\'allaitement.',
    minor: 'Vente interdite aux mineurs de moins de 18 ans.',
    storage: 'Conserver dans un endroit frais et sec, à l\'abri de la lumière.',
    lot: 'Lot : voir emballage',
    code: 'Réf',
  },
  es: {
    desc: 'Bebida alcohólica fermentada de arroz (SAKE)',
    alc: 'Alcohol', vol: 'Vol.', content: 'Contenido',
    ing: 'Ingredientes', alg: 'Alérgenos',
    origin: 'Producido y envasado en', imp: 'Importado por',
    warn: 'Advertencias',
    pregnancy: 'No recomendado durante el embarazo y la lactancia.',
    minor: 'Prohibida la venta a menores de 18 años.',
    storage: 'Conservar en lugar fresco y seco, protegido de la luz.',
    lot: 'Lote: ver envase',
    code: 'Cód',
  },
  ja: {
    desc: '日本酒',
    alc: 'アルコール', vol: '', content: '内容量',
    ing: '原材料', alg: 'アレルゲン',
    origin: '製造・瓶詰', imp: '輸入者',
    warn: '注意事項',
    pregnancy: '妊娠中・授乳中の方にはお勧めしません。',
    minor: '18歳未満の方への販売は禁止されています。',
    storage: '直射日光を避け、涼しく乾燥した場所に保管してください。',
    lot: 'ロット：パッケージ参照',
    code: 'コード',
  },
}

/**
 * Generate compact print-ready back label PDF
 * @param {Object} label - Product + QR + importer data
 * @param {Object} options - Override defaults
 */
export const generateLabelPDF = (label, options = {}) => {
  const W = options.widthMm || 55
  const M = 2.5
  const CW = W - M * 2
  const lang = label.language || 'it'
  const t = TRANSLATIONS[lang] || TRANSLATIONS.it
  const qrSize = 15

  // Helper to measure text height
  const measureLines = (doc, text, maxW) => {
    if (!text) return 0
    return doc.splitTextToSize(text, maxW).length
  }

  // --- Phase 1: measure total height ---
  const tmpDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, 200] })
  let calcY = M

  // Product header: name EN
  tmpDoc.setFontSize(FONT.title)
  const nameLines = tmpDoc.splitTextToSize(label.name || '', CW)
  calcY += nameLines.length * 3 + 0.5

  // Name JP
  if (label.nameJp) calcY += 3

  // Type + seimaibuai
  if (label.category) calcY += 2.5

  calcY += 1 // separator

  // Description (Bevanda alcolica...)
  tmpDoc.setFontSize(FONT.body)
  const descLines = tmpDoc.splitTextToSize(t.desc, CW)
  calcY += descLines.length * 2.2 + 1.5

  // Alcohol + Volume
  calcY += 5 + 1

  // Ingredients
  const ingText = label.ingredients?.[lang] || ''
  if (ingText) {
    tmpDoc.setFontSize(FONT.body)
    calcY += 2.5 + measureLines(tmpDoc, ingText, CW) * 2.2 + 0.5
  }
  const algText = label.allergens?.[lang] || ''
  if (algText) calcY += 2.5
  if (ingText || algText) calcY += 1

  // Origin + Importer
  if (label.countryOfOrigin || label.importer?.name) {
    if (label.countryOfOrigin) calcY += 2.5
    if (label.importer?.name) calcY += 2.5
    if (label.importer?.address) {
      tmpDoc.setFontSize(FONT.caption)
      calcY += measureLines(tmpDoc, label.importer.address, CW) * 1.8
    }
    calcY += 1
  }

  // Warnings
  calcY += 2.5 // header
  tmpDoc.setFontSize(FONT.caption)
  const warnings = [t.pregnancy, t.minor, t.storage]
  warnings.forEach(w => {
    calcY += measureLines(tmpDoc, w, CW) * 1.8 + 0.3
  })
  calcY += 1.5

  // Lot
  calcY += 2.5 + 1

  // Footer with QR
  calcY += Math.max(qrSize, 12) + 1

  const H = Math.max(calcY + M, 40)

  // --- Phase 2: render ---
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] })
  let y = M

  const font = (size, style = 'normal') => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
  }

  const line = () => {
    doc.setDrawColor(180)
    doc.setLineWidth(0.15)
    doc.line(M, y, W - M, y)
    y += 1
  }

  // === PRODUCT HEADER ===
  // Name EN — bold, full width
  font(FONT.title, 'bold')
  const renderedNameLines = doc.splitTextToSize(label.name || '', CW)
  doc.text(renderedNameLines, M, y + 2.5)
  y += renderedNameLines.length * 3 + 0.5

  // Name JP
  if (label.nameJp) {
    font(FONT.titleJp, 'normal')
    doc.text(label.nameJp, M, y + 2)
    y += 3
  }

  // Type + Seimaibuai on same line
  if (label.category) {
    font(FONT.subtitle, 'italic')
    doc.setTextColor(80)
    let typeLine = label.category
    if (label.seimaibuai) typeLine += `  ·  精米歩合 ${label.seimaibuai}%`
    doc.text(typeLine, M, y + 1.8)
    y += 2.5
    doc.setTextColor(0)
  }

  line()

  // === PRODUCT DESCRIPTION ===
  font(FONT.body, 'italic')
  doc.setTextColor(60)
  const descLinesR = doc.splitTextToSize(t.desc, CW)
  doc.text(descLinesR, M, y + 2)
  y += descLinesR.length * 2.2 + 0.5
  doc.setTextColor(0)

  line()

  // === ALCOHOL + VOLUME ===
  font(FONT.body, 'normal')
  if (label.alcoholPct) {
    doc.text(`${t.alc}: ${label.alcoholPct}% ${t.vol}`, M, y + 2)
    y += 2.5
  }
  if (label.volumeMl) {
    doc.text(`${t.content}: ${label.volumeMl}ml`, M, y + 2)
    y += 2.5
  }
  line()

  // === INGREDIENTS ===
  if (ingText) {
    font(FONT.body, 'bold')
    doc.text(t.ing + ':', M, y + 2)
    y += 3

    font(FONT.body, 'normal')
    const ingLines = doc.splitTextToSize(ingText, CW)
    doc.text(ingLines, M, y + 1.5)
    y += ingLines.length * 2.2 + 0.5
  }

  // Allergens — bold uppercase per EU
  if (algText) {
    font(FONT.body, 'bold')
    const algLine = t.alg + ': ' + algText.toUpperCase()
    const algLines = doc.splitTextToSize(algLine, CW)
    doc.text(algLines, M, y + 1.8)
    y += algLines.length * 2.2 + 0.5
  }

  if (ingText || algText) line()

  // === ORIGIN + IMPORTER ===
  if (label.countryOfOrigin) {
    font(FONT.bodySmall, 'normal')
    doc.text(`${t.origin} ${label.countryOfOrigin}`, M, y + 1.8)
    y += 2.5
  }

  if (label.importer?.name) {
    font(FONT.bodySmall, 'bold')
    doc.text(`${t.imp}: ${label.importer.name}`, M, y + 1.8)
    y += 2.5

    if (label.importer.address) {
      font(FONT.caption, 'normal')
      const addrLines = doc.splitTextToSize(label.importer.address, CW)
      doc.text(addrLines, M, y + 1.3)
      y += addrLines.length * 1.8
    }
  }

  if (label.countryOfOrigin || label.importer?.name) line()

  // === WARNINGS ===
  font(FONT.bodySmall, 'bold')
  doc.text(t.warn + ':', M, y + 1.8)
  y += 2.8

  font(FONT.caption, 'normal')
  warnings.forEach((warn) => {
    const warnLines = doc.splitTextToSize(warn, CW)
    doc.text(warnLines, M, y + 1.3)
    y += warnLines.length * 1.8 + 0.3
  })
  y += 0.5
  line()

  // === LOT ===
  font(FONT.caption, 'normal')
  doc.setTextColor(80)
  doc.text(t.lot, M, y + 1.5)
  y += 2.5
  doc.setTextColor(0)
  line()

  // === FOOTER: QR left + info right ===
  const qrX = M
  const qrY = y + 0.5

  // QR code
  if (label.qr) {
    try { doc.addImage(label.qr, 'PNG', qrX, qrY, qrSize, qrSize) }
    catch { doc.rect(qrX, qrY, qrSize, qrSize) }
  } else {
    doc.setDrawColor(150)
    doc.rect(qrX, qrY, qrSize, qrSize)
    doc.setFontSize(4)
    doc.text('QR CODE', qrX + 3.5, qrY + 8)
  }

  // Info right of QR
  const infoX = qrX + qrSize + 2
  const infoW = W - M - infoX
  let iy = qrY + 1.5

  // Product code
  if (label.code) {
    font(FONT.caption, 'bold')
    doc.text(`${t.code}: ${label.code}`, infoX, iy)
    iy += 2
  }

  // Winery EN
  if (label.winery) {
    font(FONT.caption, 'normal')
    doc.text(label.winery, infoX, iy)
    iy += 1.8
  }

  // Winery JP
  if (label.wineryJp) {
    font(FONT.caption, 'normal')
    doc.text(label.wineryJp, infoX, iy)
    iy += 1.8
  }

  // EAN
  if (label.barcode) {
    font(FONT.caption, 'normal')
    doc.setTextColor(100)
    doc.text(`EAN: ${label.barcode}`, infoX, iy)
    doc.setTextColor(0)
  }

  return doc
}

/**
 * Download single label PDF
 */
export const downloadLabelPDF = (label, options) => {
  const doc = generateLabelPDF(label, options)
  doc.save(`etichetta-${label.code || label.slug}-${label.language}.pdf`)
}

/**
 * Download batch — one label per page
 */
export const downloadBatchPDF = (labels, options = {}) => {
  if (!labels.length) return
  labels.forEach((label, i) => {
    setTimeout(() => downloadLabelPDF(label, options), i * 200)
  })
}

export default { generateLabelPDF, downloadLabelPDF, downloadBatchPDF }
