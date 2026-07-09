/**
 * Category Detector Service
 * Auto-detects detailed product categories from product name, Airtable type,
 * and Shopify product_type. Provides accurate Italian labels for EU e-label display.
 *
 * Priority: Shopify product_type > keyword detection > Airtable category
 */

/**
 * Keyword-based sub-category detection for "Ai frutti" / "Fruit Sake" products.
 * Matches against product name to determine the specific fruit/flavor.
 */
const FRUIT_KEYWORDS = [
  { keywords: ['umeshu', 'ume '],         label: 'Umeshu',            labelIt: 'Umeshu (liquore di prugna)' },
  { keywords: ['yuzu'],                   label: 'Yuzushu',           labelIt: 'Yuzushu (liquore di yuzu)' },
  { keywords: ['mango'],                  label: 'Mango Sake',        labelIt: 'Sake al mango' },
  { keywords: ['peach', 'momo', 'momoko'],label: 'Peach Sake',        labelIt: 'Sake alla pesca' },
  { keywords: ['pear', 'nashi'],          label: 'Pear Sake',         labelIt: 'Sake alla pera' },
  { keywords: ['sumomo', 'plum', 'prugna'],label: 'Sumomo Sake',      labelIt: 'Sake alla prugna' },
  { keywords: ['melon'],                  label: 'Melon Sake',        labelIt: 'Sake al melone' },
  { keywords: ['watermelon', 'anguria'],  label: 'Watermelon Sake',   labelIt: 'Sake all\'anguria' },
  { keywords: ['grape', 'uva'],           label: 'Grape Sake',        labelIt: 'Sake all\'uva' },
  { keywords: ['ginger', 'zenzero'],      label: 'Ginger Sake',       labelIt: 'Sake allo zenzero' },
  { keywords: ['shiso'],                  label: 'Shiso Sake',        labelIt: 'Sake allo shiso' },
  { keywords: ['ichigo', 'strawberry', 'fragola'], label: 'Strawberry Sake', labelIt: 'Sake alla fragola' },
  { keywords: ['sakura', 'cherry'],       label: 'Sakura Sake',       labelIt: 'Sake al fiore di ciliegio' },
  { keywords: ['matcha'],                 label: 'Matcha Sake',       labelIt: 'Sake al matcha' },
  { keywords: ['rose', 'rosa'],           label: 'Rosé Sake',         labelIt: 'Rosé Sake' },
]

/**
 * Keyword-based detection for spirit sub-types
 */
const SPIRIT_KEYWORDS = [
  { keywords: ['shochu', 'shōchū'],      label: 'Shochu',            labelIt: 'Shochu' },
  { keywords: ['gin'],                    label: 'Gin',               labelIt: 'Gin' },
  { keywords: ['whisky', 'whiskey'],      label: 'Whisky',            labelIt: 'Whisky' },
  { keywords: ['rum'],                    label: 'Rum',               labelIt: 'Rum' },
  { keywords: ['awamori'],               label: 'Awamori',           labelIt: 'Awamori' },
  { keywords: ['vodka'],                  label: 'Vodka',             labelIt: 'Vodka' },
]

/**
 * Shopify product_type → canonical display label
 */
const SHOPIFY_TYPE_MAP = {
  // Sake types
  'Daiginjo':           'Daiginjo',
  'Ginjo':              'Ginjo',
  'Junmai':             'Junmai',
  'Junmai Daiginjo':    'Junmai Daiginjo',
  'Junmai Ginjo':       'Junmai Ginjo',
  'Junmai Genshu':      'Junmai Genshu',
  'Honjozo':            'Honjozo',
  'Tokubetsu Honjozo':  'Tokubetsu Honjozo',
  'Tokubetsu Junmai':   'Tokubetsu Junmai',
  'Futsushu':           'Futsushu',
  // Fruit / liqueur
  'Ai frutti':          'Sake ai frutti',    // will be refined by keyword detection
  'Fruit Sake':         'Sake ai frutti',    // will be refined by keyword detection
  // Spirits
  'Shochu':             'Shochu',
  'Gin':                'Gin',
  'whisky':             'Whisky',
  'Whisky':             'Whisky',
  'Awamori':            'Awamori',
  'Rum':                'Rum',
  'Vodka':              'Vodka',
  // Wine
  'vino':               'Vino',
  // Beer
  'Birra':              'Birra',
}

/**
 * Match a product-type string against the spirit keywords (word-boundary,
 * so "Ginjo" doesn't match "gin"). Covers Airtable variants like
 * "Japanese Whisky", "Japanese craft gin", "Japanese rum", "Japanese vodka".
 * Returns the canonical spirit label, or null.
 */
function spiritFromTypeString(type) {
  const typeLower = (type || '').toLowerCase()
  if (!typeLower) return null
  for (const rule of SPIRIT_KEYWORDS) {
    if (rule.keywords.some(kw => new RegExp(`\\b${kw.trim()}\\b`).test(typeLower))) {
      return rule.label
    }
  }
  return null
}

/**
 * Detect the most specific product category/type for display on the e-label.
 *
 * @param {string} productName  - Product name (e.g. "Kodakara Yuzu")
 * @param {string} airtableCategory - Category from Airtable Product Type field
 * @param {string} shopifyType  - product_type from Shopify (via shopifyPhotos.json)
 * @returns {string} The most specific category label for display
 */
export function detectDetailedCategory(productName, airtableCategory = '', shopifyType = '') {
  const nameLower = (productName || '').toLowerCase()

  // 1. Determine the base type (prefer Shopify, fall back to Airtable)
  const baseType = shopifyType || airtableCategory || ''

  // 2. Map to canonical label; unmapped types that name a spirit
  //    ("Japanese Whisky", "Japanese craft gin", …) resolve to that spirit
  let displayLabel = SHOPIFY_TYPE_MAP[baseType]
    || (!CATEGORY_DESCRIPTIONS[baseType] && spiritFromTypeString(baseType))
    || baseType

  // 3. For fruit/liqueur products, try to detect specific fruit from name
  const isFruit = ['Ai frutti', 'Fruit Sake', 'Sake ai frutti'].includes(baseType)
                || ['Ai frutti', 'Fruit Sake', 'Sake ai frutti'].includes(displayLabel)
  if (isFruit) {
    for (const rule of FRUIT_KEYWORDS) {
      if (rule.keywords.some(kw => nameLower.includes(kw))) {
        return rule.label  // Return specific fruit type (e.g. "Umeshu", "Yuzushu")
      }
    }
    return 'Sake ai frutti'  // Generic fruit sake if no specific match
  }

  // 4. For generic "Spirit" category, try to detect specific spirit
  const isSpirit = ['Spirit', 'Spirits'].includes(baseType)
  if (isSpirit) {
    for (const rule of SPIRIT_KEYWORDS) {
      if (rule.keywords.some(kw => nameLower.includes(kw))) {
        return rule.label
      }
    }
    return 'Spirit'
  }

  // 5. Return the mapped display label
  return displayLabel || airtableCategory || ''
}

/**
 * Category → legal description mapping (multi-language)
 * Used for the "denominazione legale" line on the e-label
 */
const CATEGORY_DESCRIPTIONS = {
  // Sake types (all variants)
  _sake: {
    it: 'Bevanda alcolica fermentata di riso (SAKE)',
    de: 'Fermentiertes alkoholisches Reisgetränk (SAKE)',
    fr: 'Boisson alcoolique fermentée de riz (SAKE)',
    es: 'Bebida alcohólica fermentada de arroz (SAKE)',
    ja: '日本酒',
  },
  // Fruit-based (Umeshu, Yuzushu, all fruit sakes)
  _fruit: {
    it: 'Bevanda alcolica a base di frutta',
    de: 'Alkoholisches Fruchtgetränk',
    fr: 'Boisson alcoolique à base de fruits',
    es: 'Bebida alcohólica a base de fruta',
    ja: '果実酒',
  },
  // Generic distilled spirit — safety net for products still tagged "Spirit"
  // without a recognizable sub-type. NEVER falls back to the sake wording.
  _spirit: {
    it: 'Bevanda spiritosa distillata',
    de: 'Destillierte Spirituose',
    fr: 'Boisson spiritueuse distillée',
    es: 'Bebida espirituosa destilada',
    ja: '蒸留酒',
  },
  // Shochu
  Shochu: {
    it: 'Distillato giapponese di cereali',
    de: 'Japanisches Getreidedestillat',
    fr: 'Distillat japonais de céréales',
    es: 'Destilado japonés de cereales',
    ja: '焼酎',
  },
  // Awamori
  Awamori: {
    it: 'Distillato giapponese di riso',
    de: 'Japanisches Reisdestillat',
    fr: 'Distillat japonais de riz',
    es: 'Destilado japonés de arroz',
    ja: '泡盛',
  },
  // Gin
  Gin: {
    it: 'Gin',
    de: 'Gin',
    fr: 'Gin',
    es: 'Gin',
    ja: 'ジン',
  },
  // Whisky
  Whisky: {
    it: 'Whisky giapponese',
    de: 'Japanischer Whisky',
    fr: 'Whisky japonais',
    es: 'Whisky japonés',
    ja: 'ウイスキー',
  },
  // Rum
  Rum: {
    it: 'Rum',
    de: 'Rum',
    fr: 'Rhum',
    es: 'Ron',
    ja: 'ラム',
  },
  // Vodka
  Vodka: {
    it: 'Vodka',
    de: 'Wodka',
    fr: 'Vodka',
    es: 'Vodka',
    ja: 'ウォッカ',
  },
  // Wine
  Vino: {
    it: 'Vino',
    de: 'Wein',
    fr: 'Vin',
    es: 'Vino',
    ja: 'ワイン',
  },
  // Beer
  Birra: {
    it: 'Birra',
    de: 'Bier',
    fr: 'Bière',
    es: 'Cerveza',
    ja: 'ビール',
  },
}

// Categories that map to fruit description
const FRUIT_CATEGORIES = [
  'Umeshu', 'Yuzushu', 'Mango Sake', 'Peach Sake', 'Pear Sake',
  'Sumomo Sake', 'Melon Sake', 'Watermelon Sake', 'Grape Sake',
  'Ginger Sake', 'Shiso Sake', 'Strawberry Sake', 'Sakura Sake',
  'Matcha Sake', 'Rosé Sake', 'Sake ai frutti', 'Fruit Sake', 'Ai frutti',
]

// Categories that map to sake description
const SAKE_CATEGORIES = [
  'Daiginjo', 'Ginjo', 'Junmai', 'Junmai Daiginjo', 'Junmai Ginjo',
  'Junmai Genshu', 'Honjozo', 'Tokubetsu Honjozo', 'Tokubetsu Junmai',
  'Futsushu', 'Sake',
]

/**
 * Get the default legal description for a product based on its detected category.
 *
 * @param {string} detectedCategory - The category from detectDetailedCategory()
 * @param {string} lang - Language code (it, de, fr, es, ja)
 * @returns {string} The default legal description for this category and language
 */
export function getDefaultLegalDescription(detectedCategory, lang = 'it') {
  if (!detectedCategory) return CATEGORY_DESCRIPTIONS._sake[lang] || CATEGORY_DESCRIPTIONS._sake.it

  // Check fruit categories
  if (FRUIT_CATEGORIES.includes(detectedCategory)) {
    return CATEGORY_DESCRIPTIONS._fruit[lang] || CATEGORY_DESCRIPTIONS._fruit.it
  }

  // Check sake categories
  if (SAKE_CATEGORIES.includes(detectedCategory)) {
    return CATEGORY_DESCRIPTIONS._sake[lang] || CATEGORY_DESCRIPTIONS._sake.it
  }

  // Check direct match (Shochu, Gin, Whisky, Rum, etc.)
  if (CATEGORY_DESCRIPTIONS[detectedCategory]) {
    return CATEGORY_DESCRIPTIONS[detectedCategory][lang] || CATEGORY_DESCRIPTIONS[detectedCategory].it
  }

  // Spirits must NEVER get the rice-fermentation wording: resolve any
  // spirit-like category ("Spirit", "Japanese Whisky", …) to its own
  // denomination, or to the generic distilled-spirit one.
  if (['Spirit', 'Spirits'].includes(detectedCategory)) {
    return CATEGORY_DESCRIPTIONS._spirit[lang] || CATEGORY_DESCRIPTIONS._spirit.it
  }
  const spiritLabel = spiritFromTypeString(detectedCategory)
  if (spiritLabel && CATEGORY_DESCRIPTIONS[spiritLabel]) {
    return CATEGORY_DESCRIPTIONS[spiritLabel][lang] || CATEGORY_DESCRIPTIONS[spiritLabel].it
  }

  // Fallback to sake description
  return CATEGORY_DESCRIPTIONS._sake[lang] || CATEGORY_DESCRIPTIONS._sake.it
}

/**
 * Default ingredients by product category and language.
 * Used to pre-fill the ingredients field for known product types.
 */
const CATEGORY_INGREDIENTS = {
  // Pure rice sake (no added alcohol)
  _junmai: {
    it: 'riso, riso maltato (koji), acqua',
    en: 'rice, malted rice (koji), water',
    de: 'Reis, Malzreis (Koji), Wasser',
    fr: 'riz, riz malté (koji), eau',
    es: 'arroz, arroz malteado (koji), agua',
    ja: '米、米麹、水',
  },
  // Sake with added distilled alcohol
  _aruten: {
    it: 'riso, riso maltato (koji), acqua, alcol distillato',
    en: 'rice, malted rice (koji), water, distilled alcohol',
    de: 'Reis, Malzreis (Koji), Wasser, destillierter Alkohol',
    fr: 'riz, riz malté (koji), eau, alcool distillé',
    es: 'arroz, arroz malteado (koji), agua, alcohol destilado',
    ja: '米、米麹、水、醸造アルコール',
  },
  // Umeshu
  Umeshu: {
    it: 'alcol puro, prugne ume, zucchero',
    en: 'pure alcohol, ume plums, sugar',
    de: 'reiner Alkohol, Ume-Pflaumen, Zucker',
    fr: 'alcool pur, prunes ume, sucre',
    es: 'alcohol puro, ciruelas ume, azúcar',
    ja: '醸造アルコール、梅、砂糖',
  },
  // Yuzushu
  Yuzushu: {
    it: 'sake, succo di yuzu, fruttosio',
    en: 'sake, yuzu juice, fructose',
    de: 'Sake, Yuzu-Saft, Fruktose',
    fr: 'saké, jus de yuzu, fructose',
    es: 'sake, zumo de yuzu, fructosa',
    ja: '日本酒、柚子果汁、果糖',
  },
  // Shochu
  Shochu: {
    it: 'orzo, riso maltato (koji), acqua',
    en: 'barley, malted rice (koji), water',
    de: 'Gerste, Malzreis (Koji), Wasser',
    fr: 'orge, riz malté (koji), eau',
    es: 'cebada, arroz malteado (koji), agua',
    ja: '麦、米麹、水',
  },
  // Awamori
  Awamori: {
    it: 'riso indica, koji nero, acqua',
    en: 'indica rice, black koji, water',
    de: 'Indica-Reis, schwarzer Koji, Wasser',
    fr: 'riz indica, koji noir, eau',
    es: 'arroz indica, koji negro, agua',
    ja: '米、黒麹、水',
  },
}

// Junmai-family categories (no added alcohol)
const JUNMAI_CATEGORIES = [
  'Junmai', 'Junmai Daiginjo', 'Junmai Ginjo', 'Junmai Genshu', 'Tokubetsu Junmai',
]

// Aruten (added alcohol) categories
const ARUTEN_CATEGORIES = [
  'Daiginjo', 'Ginjo', 'Honjozo', 'Tokubetsu Honjozo', 'Futsushu',
]

/**
 * Get default ingredients for a product based on its detected category.
 *
 * @param {string} detectedCategory - The category from detectDetailedCategory()
 * @param {string} lang - Language code (it, en, de, fr, es, ja)
 * @returns {string} Default ingredients text, or empty string if unknown
 */
export function getDefaultIngredients(detectedCategory, lang = 'it') {
  if (!detectedCategory) return ''

  // Junmai family (pure rice)
  if (JUNMAI_CATEGORIES.includes(detectedCategory)) {
    return CATEGORY_INGREDIENTS._junmai[lang] || CATEGORY_INGREDIENTS._junmai.it
  }

  // Aruten family (added alcohol)
  if (ARUTEN_CATEGORIES.includes(detectedCategory)) {
    return CATEGORY_INGREDIENTS._aruten[lang] || CATEGORY_INGREDIENTS._aruten.it
  }

  // Direct match (Umeshu, Yuzushu, Shochu, Awamori)
  if (CATEGORY_INGREDIENTS[detectedCategory]) {
    return CATEGORY_INGREDIENTS[detectedCategory][lang] || CATEGORY_INGREDIENTS[detectedCategory].it
  }

  // Generic fruit sake — no default (too varied)
  return ''
}

export default { detectDetailedCategory, getDefaultLegalDescription, getDefaultIngredients }
