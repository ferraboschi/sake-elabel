/**
 * Shared constants used across the app
 */

export const LANG_OPTIONS = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
]

export const ALL_LANGUAGES = ['it', 'en', 'de', 'fr', 'es', 'ja']

/**
 * Estimate how many lines a title would need on the PDF label.
* Label: 55mm wide − 5 (margins) − 2 (buffer) − 6.1 (pittogramma) − 4 (spacing) = 37.9mm
*/
export function estimateTitleLines(title) {
    if (!title) return 0
  const upper = title.toUpperCase()
  const maxWidthMm = 37.9
  let lines = 1
  const words = upper.split(/\s+/)
  let currentLineWidth = 0

  for (let i = 0; i < words.length; i++) {
    let wordWidth = 0
    for (const ch of words[i]) {
      if ('MWmw'.includes(ch)) wordWidth += 2.2
      else if ('IIJL1l|!'.includes(ch)) wordWidth += 0.7
      else if ('ABCDEFGHKNOPQRSTUVXYZ'.includes(ch)) wordWidth += 1.6
      else wordWidth += 1.5
    }
    const spaceWidth = i > 0 ? 0.7 : 0
    if (currentLineWidth + spaceWidth + wordWidth > maxWidthMm && currentLineWidth > 0) {
      lines++
      currentLineWidth = wordWidth
    } else {
      currentLineWidth += spaceWidth + wordWidth
    }
  }
  return lines
}

/**
 * Get the maximum number of characters that fit in N lines on the PDF label.
 * Uses conservative estimates based on average character width.
 */
export function getMaxCharsFor2Lines(n = 2) {
  // Average character width for uppercase Latin (typical product names): ~1.7mm
  // Available width for title on PDF: 37.9mm (from estimateTitleLines maxWidthMm)
  // Conservative estimate: assume average char width of 1.7mm
  const avgCharWidthMm = 1.7
  const maxWidthMm = 37.9
  const spaceWidthMm = 0.7

  // Characters per line: floor(maxWidth / avgCharWidth)
  const charsPerLine = Math.floor(maxWidthMm / avgCharWidthMm)

  // Return total for n lines
  return charsPerLine * n  // Returns ~44 for 2 lines
}
