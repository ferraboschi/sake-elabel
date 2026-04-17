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
 * Label: 55mm wide − 5 (margins) − 3 (buffer) − 6.1 (pittogramma) − 4 (spacing) = 36.9mm
 */
export function estimateTitleLines(title) {
  if (!title) return 0
  const upper = title.toUpperCase()
  const maxWidthMm = 36.9
  let lines = 1
  const words = upper.split(/\s+/)
  let currentLineWidth = 0

  for (let i = 0; i < words.length; i++) {
    let wordWidth = 0
    for (const ch of words[i]) {
      if ('MWmw'.includes(ch)) wordWidth += 2.9
      else if ('IIJL1l|!'.includes(ch)) wordWidth += 1.1
      else if ('ABCDEFGHKNOPQRSTUVXYZ'.includes(ch)) wordWidth += 2.0
      else wordWidth += 1.85
    }
    const spaceWidth = i > 0 ? 1.1 : 0
    if (currentLineWidth + spaceWidth + wordWidth > maxWidthMm && currentLineWidth > 0) {
      lines++
      currentLineWidth = wordWidth
    } else {
      currentLineWidth += spaceWidth + wordWidth
    }
  }
  return lines
}
