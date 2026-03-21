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

  // Accept EAN-13 (13 digits) or EAN-8 (8 digits)
  if (!/^\d{8}$|^\d{13}$/.test(clean)) return null

  try {
    const canvas = document.createElement('canvas')

    JsBarcode(canvas, clean, {
      format: clean.length === 13 ? 'EAN13' : 'EAN8',
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
  if (!/^\d{8}$|^\d{13}$/.test(clean)) return null

  try {
    const canvas = document.createElement('canvas')

    JsBarcode(canvas, clean, {
      format: clean.length === 13 ? 'EAN13' : 'EAN8',
      width: 3,        // wider bars for higher DPI
      height: 80,       // taller for readability
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
  if (!/^\d{8}$|^\d{13}$/.test(clean)) return null

  try {
    // Step 1: Generate barcode at high resolution for crisp text
    const srcCanvas = document.createElement('canvas')

    JsBarcode(srcCanvas, clean, {
      format: clean.length === 13 ? 'EAN13' : 'EAN8',
      width: 4,          // wider bars for high-res
      height: 100,        // taller for readability
      displayValue: true,
      fontSize: 24,       // large font for crisp numbers after rotation
      font: 'monospace',  // monospace for clean digit rendering
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

export default { isValidEAN13, generateBarcodeDataUrl, generateBarcodePdfDataUrl, generateVerticalBarcodePdfDataUrl }
