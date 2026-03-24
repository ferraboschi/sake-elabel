/**
 * Ingredient Translator Service
 * Auto-translates sake/spirit ingredients between IT, EN, DE, FR, ES, JA.
 *
 * Sake ingredients are standardized — this dictionary covers 95%+ of cases.
 * The translator works by:
 * 1. Splitting ingredient text by commas or Japanese delimiter (、)
 * 2. Matching each term against the dictionary (fuzzy, case-insensitive)
 * 3. Returning the translated terms joined in the target language
 * 4. Any unmatched terms are kept as-is (preserving original)
 */

// Each entry: { canonical, it, en, de, fr, es, ja }
const DICTIONARY = [
  // === Base sake ingredients ===
  { canonical: 'rice',
    it: 'riso', en: 'rice', de: 'Reis', fr: 'riz', es: 'arroz', ja: '米' },
  { canonical: 'malted_rice',
    it: 'riso maltato (koji)', en: 'malted rice (koji)', de: 'Malzreis (Koji)', fr: 'riz malté (koji)', es: 'arroz malteado (koji)', ja: '米麹' },
  { canonical: 'water',
    it: 'acqua', en: 'water', de: 'Wasser', fr: 'eau', es: 'agua', ja: '水' },
  { canonical: 'alcohol',
    it: 'alcol', en: 'alcohol', de: 'Alkohol', fr: 'alcool', es: 'alcohol', ja: '醸造アルコール' },
  { canonical: 'pure_alcohol',
    it: 'alcol puro', en: 'pure alcohol', de: 'reiner Alkohol', fr: 'alcool pur', es: 'alcohol puro', ja: '醸造アルコール' },
  { canonical: 'brewers_alcohol',
    it: 'alcol da distillazione', en: "brewer's alcohol", de: 'Destillationsalkohol', fr: 'alcool de distillation', es: 'alcohol destilado', ja: '醸造アルコール' },

  // === Sugars ===
  { canonical: 'sugar',
    it: 'zucchero', en: 'sugar', de: 'Zucker', fr: 'sucre', es: 'azúcar', ja: '砂糖' },
  { canonical: 'fructose',
    it: 'fruttosio', en: 'fructose', de: 'Fruktose', fr: 'fructose', es: 'fructosa', ja: '果糖' },
  { canonical: 'glucose',
    it: 'glucosio', en: 'glucose', de: 'Glukose', fr: 'glucose', es: 'glucosa', ja: 'ブドウ糖' },
  { canonical: 'glucose_fructose_syrup',
    it: 'sciroppo di glucosio-fruttosio', en: 'glucose-fructose syrup', de: 'Glukose-Fruktose-Sirup', fr: 'sirop de glucose-fructose', es: 'jarabe de glucosa-fructosa', ja: '果糖ブドウ糖液糖' },
  { canonical: 'liquid_sugar',
    it: 'zucchero liquido', en: 'liquid sugar', de: 'Flüssigzucker', fr: 'sucre liquide', es: 'azúcar líquido', ja: '液糖' },

  // === Fruit ingredients ===
  { canonical: 'yuzu_juice',
    it: 'succo di yuzu', en: 'yuzu juice', de: 'Yuzu-Saft', fr: 'jus de yuzu', es: 'jugo de yuzu', ja: 'ゆず果汁' },
  { canonical: 'yuzu_peel',
    it: 'scorza di yuzu', en: 'yuzu peel', de: 'Yuzu-Schale', fr: 'zeste de yuzu', es: 'cáscara de yuzu', ja: 'ゆず果皮' },
  { canonical: 'plum',
    it: 'prugna', en: 'plum', de: 'Pflaume', fr: 'prune', es: 'ciruela', ja: '梅' },
  { canonical: 'ume_plum',
    it: 'prugna giapponese (ume)', en: 'Japanese plum (ume)', de: 'japanische Pflaume (Ume)', fr: 'prune japonaise (ume)', es: 'ciruela japonesa (ume)', ja: '梅' },
  { canonical: 'peach',
    it: 'pesca', en: 'peach', de: 'Pfirsich', fr: 'pêche', es: 'melocotón', ja: '桃' },
  { canonical: 'mango',
    it: 'mango', en: 'mango', de: 'Mango', fr: 'mangue', es: 'mango', ja: 'マンゴー' },
  { canonical: 'pear',
    it: 'pera', en: 'pear', de: 'Birne', fr: 'poire', es: 'pera', ja: '梨' },
  { canonical: 'strawberry',
    it: 'fragola', en: 'strawberry', de: 'Erdbeere', fr: 'fraise', es: 'fresa', ja: 'いちご' },
  { canonical: 'grape',
    it: 'uva', en: 'grape', de: 'Traube', fr: 'raisin', es: 'uva', ja: 'ぶどう' },
  { canonical: 'melon',
    it: 'melone', en: 'melon', de: 'Melone', fr: 'melon', es: 'melón', ja: 'メロン' },
  { canonical: 'watermelon',
    it: 'anguria', en: 'watermelon', de: 'Wassermelone', fr: 'pastèque', es: 'sandía', ja: 'スイカ' },
  { canonical: 'ginger',
    it: 'zenzero', en: 'ginger', de: 'Ingwer', fr: 'gingembre', es: 'jengibre', ja: '生姜' },
  { canonical: 'shiso',
    it: 'shiso', en: 'shiso', de: 'Shiso', fr: 'shiso', es: 'shiso', ja: 'しそ' },
  { canonical: 'sakura',
    it: 'fiore di ciliegio', en: 'cherry blossom', de: 'Kirschblüte', fr: 'fleur de cerisier', es: 'flor de cerezo', ja: '桜' },
  { canonical: 'matcha',
    it: 'matcha', en: 'matcha', de: 'Matcha', fr: 'matcha', es: 'matcha', ja: '抹茶' },
  { canonical: 'lemon_juice',
    it: 'succo di limone', en: 'lemon juice', de: 'Zitronensaft', fr: 'jus de citron', es: 'jugo de limón', ja: 'レモン果汁' },

  // === Additives & acids ===
  { canonical: 'citric_acid',
    it: 'acido citrico', en: 'citric acid', de: 'Zitronensäure', fr: 'acide citrique', es: 'ácido cítrico', ja: 'クエン酸' },
  { canonical: 'lactic_acid',
    it: 'acido lattico', en: 'lactic acid', de: 'Milchsäure', fr: 'acide lactique', es: 'ácido láctico', ja: '乳酸' },
  { canonical: 'flavoring',
    it: 'aromi', en: 'flavoring', de: 'Aromen', fr: 'arômes', es: 'aromas', ja: '香料' },
  { canonical: 'natural_flavoring',
    it: 'aromi naturali', en: 'natural flavoring', de: 'natürliche Aromen', fr: 'arômes naturels', es: 'aromas naturales', ja: '天然香料' },
  { canonical: 'coloring',
    it: 'colorante', en: 'coloring', de: 'Farbstoff', fr: 'colorant', es: 'colorante', ja: '着色料' },
  { canonical: 'preservative',
    it: 'conservante', en: 'preservative', de: 'Konservierungsmittel', fr: 'conservateur', es: 'conservante', ja: '保存料' },
  { canonical: 'antioxidant',
    it: 'antiossidante', en: 'antioxidant', de: 'Antioxidationsmittel', fr: 'antioxydant', es: 'antioxidante', ja: '酸化防止剤' },
  { canonical: 'sulfites',
    it: 'solfiti', en: 'sulfites', de: 'Sulfite', fr: 'sulfites', es: 'sulfitos', ja: '亜硫酸塩' },
  { canonical: 'carbon_dioxide',
    it: 'anidride carbonica', en: 'carbon dioxide', de: 'Kohlendioxid', fr: 'dioxyde de carbone', es: 'dióxido de carbono', ja: '炭酸ガス' },

  // === Spirit-specific ===
  { canonical: 'barley',
    it: 'orzo', en: 'barley', de: 'Gerste', fr: 'orge', es: 'cebada', ja: '大麦' },
  { canonical: 'sweet_potato',
    it: 'patata dolce', en: 'sweet potato', de: 'Süßkartoffel', fr: 'patate douce', es: 'batata', ja: 'さつまいも' },
  { canonical: 'buckwheat',
    it: 'grano saraceno', en: 'buckwheat', de: 'Buchweizen', fr: 'sarrasin', es: 'trigo sarraceno', ja: 'そば' },
  { canonical: 'brown_sugar',
    it: 'zucchero di canna', en: 'brown sugar', de: 'Rohrzucker', fr: 'sucre de canne', es: 'azúcar moreno', ja: '黒糖' },
  { canonical: 'juniper',
    it: 'ginepro', en: 'juniper', de: 'Wacholder', fr: 'genévrier', es: 'enebro', ja: 'ジュニパー' },
  { canonical: 'corn',
    it: 'mais', en: 'corn', de: 'Mais', fr: 'maïs', es: 'maíz', ja: 'とうもろこし' },
  { canonical: 'wheat',
    it: 'grano', en: 'wheat', de: 'Weizen', fr: 'blé', es: 'trigo', ja: '小麦' },
  { canonical: 'malt',
    it: 'malto', en: 'malt', de: 'Malz', fr: 'malt', es: 'malta', ja: '麦芽' },

  // === Sake-specific ===
  { canonical: 'koji_mold',
    it: 'koji (Aspergillus oryzae)', en: 'koji mold (Aspergillus oryzae)', de: 'Koji-Schimmelpilz (Aspergillus oryzae)', fr: 'moisissure koji (Aspergillus oryzae)', es: 'moho koji (Aspergillus oryzae)', ja: '麹菌' },
  { canonical: 'yeast',
    it: 'lievito', en: 'yeast', de: 'Hefe', fr: 'levure', es: 'levadura', ja: '酵母' },
  { canonical: 'lactic_acid_bacteria',
    it: 'batteri lattici', en: 'lactic acid bacteria', de: 'Milchsäurebakterien', fr: 'bactéries lactiques', es: 'bacterias lácticas', ja: '乳酸菌' },
  { canonical: 'nigori',
    it: 'sedimenti di riso', en: 'rice sediment', de: 'Reissediment', fr: 'sédiment de riz', es: 'sedimento de arroz', ja: '澱' },

  // === Wine ===
  { canonical: 'grapes',
    it: 'uve', en: 'grapes', de: 'Trauben', fr: 'raisins', es: 'uvas', ja: 'ぶどう' },
  { canonical: 'must',
    it: 'mosto', en: 'must', de: 'Most', fr: 'moût', es: 'mosto', ja: '果汁' },
]

// Build lookup indexes: { lang: { normalizedTerm: entry } }
const LANGS = ['it', 'en', 'de', 'fr', 'es', 'ja']
const INDEX = {}
for (const lang of LANGS) {
  INDEX[lang] = {}
  for (const entry of DICTIONARY) {
    const term = (entry[lang] || '').toLowerCase().trim()
    if (term) INDEX[lang][term] = entry
  }
}

/**
 * Detect the language of an ingredient text.
 * Returns the most likely language code.
 */
function detectLanguage(text) {
  if (!text) return 'it'

  // Check for Japanese characters (hiragana, katakana, kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) return 'ja'

  // Check for German-specific characters/patterns
  if (/ü|ö|ä|ß|Zucker|Reis|Wasser|Alkohol/i.test(text)) return 'de'

  // Check for French patterns
  if (/ê|è|ë|ç|maltée?|jus de|sucre|alcool/i.test(text)) return 'fr'

  // Check for Spanish patterns
  if (/ñ|arroz|azúcar|agua|alcohol destilado/i.test(text)) return 'es'

  // Check for English patterns
  if (/\brice\b|\bwater\b|\bmalted\b|\byeast\b|\bsugar\b/i.test(text)) return 'en'

  // Default to Italian
  return 'it'
}

/**
 * Split ingredient text into individual terms.
 * Handles both Western commas and Japanese delimiter (、)
 */
function splitIngredients(text) {
  if (!text) return []
  // Japanese uses 、 as delimiter
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) {
    return text.split(/[、,]/).map(t => t.trim()).filter(Boolean)
  }
  return text.split(/[,;]/).map(t => t.trim()).filter(Boolean)
}

/**
 * Try to match an ingredient term to a dictionary entry.
 * Uses fuzzy matching (lowercase, trimmed, partial match).
 */
function matchTerm(term, sourceLang) {
  const normalized = term.toLowerCase().trim()
  if (!normalized) return null

  // Exact match in source language
  if (INDEX[sourceLang]?.[normalized]) {
    return INDEX[sourceLang][normalized]
  }

  // Partial match: check if the normalized term contains or is contained by a dictionary term
  const langIndex = INDEX[sourceLang] || {}
  for (const [dictTerm, entry] of Object.entries(langIndex)) {
    if (normalized.includes(dictTerm) || dictTerm.includes(normalized)) {
      return entry
    }
  }

  // Try all languages as fallback
  for (const lang of LANGS) {
    if (lang === sourceLang) continue
    if (INDEX[lang]?.[normalized]) return INDEX[lang][normalized]
  }

  return null
}

/**
 * Translate ingredients text from any language to the target language.
 *
 * @param {string} text - Ingredient text (e.g. "Riso, riso maltato (koji), acqua")
 * @param {string} targetLang - Target language code (it, en, de, fr, es, ja)
 * @param {string} [sourceLang] - Source language (auto-detected if not provided)
 * @returns {{ text: string, sourceLang: string, translated: boolean }}
 */
export function translateIngredients(text, targetLang, sourceLang) {
  if (!text || !text.trim()) return { text: '', sourceLang: 'it', translated: false }

  const detectedLang = sourceLang || detectLanguage(text)

  // If source and target are the same, no translation needed
  if (detectedLang === targetLang) {
    return { text, sourceLang: detectedLang, translated: false }
  }

  const terms = splitIngredients(text)
  let anyTranslated = false

  const translatedTerms = terms.map(term => {
    const match = matchTerm(term, detectedLang)
    if (match && match[targetLang]) {
      anyTranslated = true
      return match[targetLang]
    }
    return term // Keep original if not found
  })

  // Join with appropriate separator
  const separator = targetLang === 'ja' ? '、' : ', '
  return {
    text: translatedTerms.join(separator),
    sourceLang: detectedLang,
    translated: anyTranslated,
  }
}

/**
 * Translate all ingredient fields from the source language to all other languages.
 * Returns an object with all language translations.
 *
 * @param {Object} ingredients - Current ingredients: { it: '...', en: '...', de: '...', fr: '...', es: '...', ja: '...' }
 * @returns {Object} Updated ingredients with auto-translations where missing
 */
export function autoFillIngredients(ingredients) {
  if (!ingredients) return ingredients

  // Find the first language that has content
  let sourceText = ''
  let sourceLang = 'it'
  for (const lang of LANGS) {
    const val = ingredients[lang]?.trim()
    if (val) {
      sourceText = val
      sourceLang = detectLanguage(val)
      break
    }
  }

  if (!sourceText) return ingredients

  const result = { ...ingredients }

  for (const lang of LANGS) {
    const existing = result[lang]?.trim()

    if (existing) {
      // LANGUAGE MISMATCH FIX: if a field contains text in the wrong language
      // (e.g. Japanese text stored under the 'it' key by a Japanese supplier),
      // detect and replace it with the correct translation.
      const detectedLang = detectLanguage(existing)
      if (detectedLang !== lang) {
        const { text, translated } = translateIngredients(existing, lang, detectedLang)
        if (translated && text) result[lang] = text
      }
      continue
    }

    const { text } = translateIngredients(sourceText, lang, sourceLang)
    if (text) result[lang] = text
  }

  return result
}

export default { translateIngredients, autoFillIngredients, detectLanguage }
