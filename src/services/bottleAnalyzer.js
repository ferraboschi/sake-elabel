/**
 * Bottle Image Analyzer
 * Analyzes product images to auto-detect bottle color and suggest disposal codes
 *
 * Uses canvas-based color sampling to determine the dominant color of the bottle
 * and maps it to the correct glass recycling code:
 *   - GL 70: Vetro incolore (clear/transparent)
 *   - GL 71: Vetro verde (green)
 *   - GL 72: Vetro marrone (brown/amber)
 *
 * Also detects cap type from image when possible.
 */

/**
 * Analyze a product image URL and return bottle characteristics
 * @param {string} imageUrl - URL of the product image
 * @returns {Promise<Object>} Analysis result
 */
export const analyzeBottleImage = async (imageUrl) => {
  if (!imageUrl) return { bottleColor: null, materialCode: null, confidence: 0 }

  try {
    const img = await loadImage(imageUrl)
    const colors = sampleBottleColors(img)
    const result = classifyBottleColor(colors)
    return result
  } catch (err) {
    console.warn('Bottle analysis failed:', err.message)
    return { bottleColor: null, materialCode: null, confidence: 0 }
  }
}

/**
 * Load image into an HTML Image element (works in browser)
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Sample colors from the central area of the image (where the bottle body usually is)
 * Returns array of [r, g, b] values
 */
function sampleBottleColors(img) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Resize for performance
  const targetWidth = 200
  const scale = targetWidth / img.width
  canvas.width = targetWidth
  canvas.height = Math.round(img.height * scale)

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // Sample the central vertical strip (where the bottle body is)
  const centerX = Math.round(canvas.width * 0.5)
  const stripWidth = Math.round(canvas.width * 0.15) // 15% wide strip
  const startY = Math.round(canvas.height * 0.2) // skip top 20% (cap/neck)
  const endY = Math.round(canvas.height * 0.8) // skip bottom 20%

  const colors = []
  for (let y = startY; y < endY; y += 3) {
    for (let x = centerX - stripWidth; x < centerX + stripWidth; x += 3) {
      const pixel = ctx.getImageData(x, y, 1, 1).data
      // Skip white/near-white (background) but KEEP dark pixels (they matter for black bottles)
      const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3
      if (brightness > 8 && brightness < 240) {
        colors.push([pixel[0], pixel[1], pixel[2]])
      }
    }
  }

  return colors
}

/**
 * Classify bottle color from sampled pixels
 * Uses HSL-based analysis for better color discrimination
 */
function classifyBottleColor(colors) {
  if (colors.length < 10) {
    return { bottleColor: null, materialCode: null, confidence: 0, reason: 'Campioni insufficienti' }
  }

  // Convert to HSL and analyze
  const hslColors = colors.map(rgbToHsl)

  // Calculate averages
  const avgHue = circularMean(hslColors.map(c => c[0]))
  const avgSat = average(hslColors.map(c => c[1]))
  const avgLight = average(hslColors.map(c => c[2]))

  // Count pixels in each bottle color category
  let clearCount = 0
  let greenCount = 0
  let brownCount = 0
  let darkCount = 0

  for (const [h, s, l] of hslColors) {
    if (l > 0.65 && s < 0.2) {
      // High lightness, low saturation = clear/transparent glass
      clearCount++
    } else if (s > 0.1 && h >= 60 && h <= 180 && l < 0.5) {
      // Green hue range with decent saturation
      greenCount++
    } else if (s > 0.1 && ((h >= 15 && h < 60) || (h >= 0 && h < 15 && s > 0.3)) && l < 0.5) {
      // Brown/amber hue range
      brownCount++
    } else if (l < 0.2) {
      // Very dark - could be any dark bottle
      darkCount++
    }
  }

  const total = colors.length
  const clearPct = clearCount / total
  const greenPct = greenCount / total
  const brownPct = brownCount / total
  const darkPct = darkCount / total

  // Decision logic — check dark first to avoid misclassifying black bottles as green
  let bottleColor, materialCode, confidence

  if (darkPct > 0.35) {
    // Dark/black bottle — per EU standards, black glass = GL 72 (brown glass category)
    bottleColor = 'Nera'
    materialCode = 'GL 72'
    confidence = Math.min(0.95, darkPct + 0.2)
  } else if (greenPct > 0.30 && greenPct > brownPct * 1.5 && greenPct > darkPct) {
    // Clearly green — require stronger signal to avoid dark-bottle false positives
    bottleColor = 'Verde'
    materialCode = 'GL 71'
    confidence = Math.min(0.95, greenPct + 0.3)
  } else if (brownPct > 0.25 || (brownPct > greenPct && brownPct > clearPct && brownPct > 0.15)) {
    bottleColor = 'Marrone'
    materialCode = 'GL 72'
    confidence = Math.min(0.95, brownPct + 0.3)
  } else if (clearPct > 0.3 || (clearPct > greenPct && clearPct > brownPct)) {
    bottleColor = 'Trasparente'
    materialCode = 'GL 70'
    confidence = Math.min(0.95, clearPct + 0.2)
  } else if (darkPct > greenPct && darkPct > 0.15) {
    // Moderately dark — still likely a dark bottle
    bottleColor = 'Nera'
    materialCode = 'GL 72'
    confidence = 0.5
  } else {
    // Fallback: sake bottles are often transparent or brown
    bottleColor = 'Trasparente'
    materialCode = 'GL 70'
    confidence = 0.3
  }

  return {
    bottleColor,
    materialCode,
    confidence: Math.round(confidence * 100),
    analysis: {
      clearPct: Math.round(clearPct * 100),
      greenPct: Math.round(greenPct * 100),
      brownPct: Math.round(brownPct * 100),
      darkPct: Math.round(darkPct * 100),
      avgHue: Math.round(avgHue),
      avgSat: Math.round(avgSat * 100),
      avgLight: Math.round(avgLight * 100),
      sampleCount: colors.length,
    }
  }
}

/**
 * Batch analyze multiple products
 * @param {Array} products - Products with photo URLs
 * @returns {Promise<Map>} slug → analysis result
 */
export const batchAnalyzeBottles = async (products) => {
  const results = new Map()

  for (const product of products) {
    if (product.photo) {
      try {
        const analysis = await analyzeBottleImage(product.photo)
        results.set(product.slug, analysis)
      } catch {
        results.set(product.slug, { bottleColor: null, materialCode: null, confidence: 0 })
      }
    }
  }

  return results
}

// === UTILITY FUNCTIONS ===

function rgbToHsl(rgb) {
  const [r, g, b] = rgb.map(c => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60

  return [h, s, l]
}

function average(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function circularMean(angles) {
  const rads = angles.map(a => (a * Math.PI) / 180)
  const sinSum = rads.reduce((s, r) => s + Math.sin(r), 0)
  const cosSum = rads.reduce((s, r) => s + Math.cos(r), 0)
  let mean = (Math.atan2(sinSum / angles.length, cosSum / angles.length) * 180) / Math.PI
  if (mean < 0) mean += 360
  return mean
}

export default { analyzeBottleImage, batchAnalyzeBottles }
