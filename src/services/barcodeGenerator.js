/**
 * Barcode Generator Service
 * Generates EAN-13 barcode images using JsBarcode → Canvas → PNG data URL
 *
 * Usage:
 *   const dataUrl = generateBarcodeDataUrl('4904670211222')
 *   // Returns a PNG data URL or null if invalid/unavailable
 */

import JsBarcode from 'jsbarcode'

/**
 * Validate EAN-13 code (13 digits with valid check digit)
 */
export function isValidEAN13(code) {
  if (!code || typeof code !== 'string') return false
  const clean = code.replace(/\s/g, '')
  if (!/^\d{13}$/.test(clean)) return false

  // Verify check digit
  const digits = clean.split('').map(Number)
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0)
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === digits[12]
}

/**
 * Detect barcode format from code length
 * @returns {'ITF14' | 'EAN13' | 'EAN8' | null}
 */
export function detectBarcodeFormat(code) {
  if (!code) return null
  const clean = String(code).replace(/\s/g, '')
  if (/^\d{14}$/.test(clean)) return 'ITF14'
  if (/^\d{13}$/.test(clean)) return 'EAN13'
  if (/^\d{8}$/.test(clean)) return 'EAN8'
  return null
}

/**
 * Generate a barcode PNG data URL from an EAN-13 code
 * Returns null if the code is invalid or generation fails
 *
 * @param {string} ean - EAN-13 code (13 digits)
 * @param {object} options - JsBarcode options override
 * @returns {string|null} PNG data URL or null
 */
export function generateBarcodeDataUrl(ean, options = {}) {
  if (!ean) return null
  const clean = String(ean).replace(/\s/g, '')
  const fmt = detectBarcodeFormat(clean)
  if (!fmt) return null

  try {
    const canvas = document.createElement('canvas')

    JsBarcode(canvas, clean, {
      format: fmt,
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 12,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
      ...options,
    })

    return canvas.toDataURL('image/png')
  } catch (err) {
    console.warn('[BarcodeGenerator] Failed to generate barcode:', err.message)
    return null
  }
}

/**
 * Generate a barcode optimized for PDF embedding (higher resolution)
 * The barcode is rendered at a higher DPI for crisp printing
 *
 * @param {string} ean - EAN-13 code
 * @returns {string|null} PNG data URL or null
 */
export function generateBarcodePdfDataUrl(ean) {
  if (!ean) return null
  const clean = String(ean).replace(/\s/g, '')
  const fmt = detectBarcodeFormat(clean)
  if (!fmt) return null

  try {
    const canvas = document.createElement('canvas')

    JsBarcode(canvas, clean, {
      format: fmt,
      width: fmt === 'ITF14' ? 4 : 3,  // ITF-14 needs wider bars for corrugated cardboard
      height: fmt === 'ITF14' ? 100 : 80,
      displayValue: true,
      fontSize: 16,
      font: 'helvetica',
      margin: 6,
      background: '#ffffff',
      lineColor: '#000000',
    })

    return canvas.toDataURL('image/png')
  } catch (err) {
    console.warn('[BarcodeGenerator] Failed to generate barcode for PDF:', err.message)
    return null
  }
}

/**
 * Generate a barcode pre-rotated 90° clockwise for vertical placement in PDFs
 * This avoids complex PDF rotation transforms — the image itself is already vertical
 *
 * @param {string} ean - EAN-13 code
 * @returns {{ dataUrl: string, width: number, height: number }|null}
 *   Returns the rotated PNG data URL and its dimensions (in px), or null
 */
export function generateVerticalBarcodePdfDataUrl(ean) {
  if (!ean) return null
  const clean = String(ean).replace(/\s/g, '')
  let fmt = detectBarcodeFormat(clean)

  // If EAN13 but checksum invalid, fall back to CODE128 so barcode still prints
  if (fmt === 'EAN13' && !isValidEAN13(clean)) {
    console.warn(`[BarcodeGenerator] EAN13 checksum invalid for "${clean}", falling back to CODE128`)
    fmt = 'CODE128'
  }
  // Any other invalid format → CODE128 fallback if it contains alphanumerics
  if (!fmt && /^[\x20-\x7E]+$/.test(clean)) {
    fmt = 'CODE128'
  }
  if (!fmt) return null

  try {
    // Step 1: Generate barcode at high resolution for crisp text
    const srcCanvas = document.createElement('canvas')

    const barWidth = fmt === 'ITF14' ? 6 : fmt === 'CODE128' ? 4 : 5
    const barHeight = fmt === 'ITF14' ? 130 : 110

    JsBarcode(srcCanvas, clean, {
      format: fmt,
      width: barWidth,
      height: barHeight,
      displayValue: true,
      fontSize: 24,       // large font for crisp numbers after rotation
      font: 'monospace',
      textMargin: 4,
      margin: 8,
      background: '#ffffff',
      lineColor: '#000000',
    })

    // Step 2: Rotate 90° COUNTER-clockwise (270° CW) so numbers face the right edge (border)
    const srcW = srcCanvas.width
    const srcH = srcCanvas.height
    const rotCanvas = document.createElement('canvas')
    rotCanvas.width = srcH   // swapped
    rotCanvas.height = srcW  // swapped
    const ctx = rotCanvas.getContext('2d')
    // 90° counter-clockwise: translate down, rotate -90°
    ctx.translate(0, srcW)
    ctx.rotate(-Math.PI / 2)
    ctx.drawImage(srcCanvas, 0, 0)

    return {
      dataUrl: rotCanvas.toDataURL('image/png'),
      width: rotCanvas.width,   // px
      height: rotCanvas.height, // px
    }
  } catch (err) {
    console.warn('[BarcodeGenerator] Failed to generate vertical barcode:', err.message)
    return null
  }
}

export default { isValidEAN13, detectBarcodeFormat, generateBarcodeDataUrl, generateBarcodePdfDataUrl, generateVerticalBarcodePdfDataUrl }
