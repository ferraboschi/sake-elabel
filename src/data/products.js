export const products = {
  "minami-sanriku-merlot-yama-sauvignon": {
    code: "W003-0750",
    name: "Minami Sanriku Winery Merlot/Yama Sauvignon",
    nameJp: "南三陸ワイナリー メルロー/ヤマソーヴィニヨン",
    winery: "Minami Sanriku Winery",
    wineryJp: "南三陸ワイナリー",
    category: "Vino fermo",
    grapeVariety: "Merlot, Yama Sauvignon",
    countryOfOrigin: "Japan",
    alcoholPct: 10.5,
    volumeMl: 750,
    sizes: [
      { ml: 750, code: "W003-0750" },
      { ml: 375, code: "W003-0375" }
    ],
    vintage: null,
    nutrition: {
      energy_kj: 280,
      energy_kcal: 67,
      fat: 0,
      saturated_fat: 0,
      carbs: 2.5,
      sugars: 1.0,
      protein: 0.1,
      salt: 0
    },
    ingredients: {
      it: "Uva (Merlot, Yama Sauvignon), antiossidante: anidride solforosa",
      de: "Trauben (Merlot, Yama Sauvignon), Antioxidationsmittel: Schwefeldioxid",
      fr: "Raisins (Merlot, Yama Sauvignon), antioxydant: anhydride sulfureux",
      es: "Uvas (Merlot, Yama Sauvignon), antioxidante: dióxido de azufre",
      ja: "ブドウ（メルロー、ヤマ・ソーヴィニヨン）、酸化防止剤：亜硫酸塩"
    },
    allergens: {
      it: "solfiti",
      de: "Sulfite",
      fr: "sulfites",
      es: "sulfitos",
      ja: "亜硫酸塩"
    },
    bottleColor: "Trasparente",
    bottleMaterialCode: "GL 72",
    capType: "Alluminio",
    capMaterialCode: "C/ALU 90",
    hasCapsule: false,
    capsuleMaterialCode: null,
    hasPaperLabel: true,
    photo: null
  },
  "kakurei-honjozo": {
    code: "AK006-0720",
    name: "Kakurei Honjozo",
    nameJp: "鶴齢 本醸造",
    winery: "Aoki Shuzo",
    wineryJp: "青木酒造株式会社",
    category: "Sake - Honjozo",
    grapeVariety: "Koshiibuki rice",
    countryOfOrigin: "Japan",
    alcoholPct: 15,
    volumeMl: 720,
    sizes: [{ ml: 720, code: "AK006-0720" }],
    vintage: null,
    nutrition: {
      energy_kj: 460,
      energy_kcal: 109,
      fat: 0,
      saturated_fat: 0,
      carbs: 3.8,
      sugars: 0,
      protein: 0.4,
      salt: 0
    },
    ingredients: {
      it: "Riso (Koshiibuki), koji di riso, alcol distillato",
      de: "Reis (Koshiibuki), Reis-Koji, destillierter Alkohol",
      fr: "Riz (Koshiibuki), koji de riz, alcool distillé",
      es: "Arroz (Koshiibuki), koji de arroz, alcohol destilado",
      ja: "米（こしいぶき）、米麹、醸造アルコール"
    },
    allergens: {
      it: null,
      de: null,
      fr: null,
      es: null,
      ja: null
    },
    bottleColor: "Trasparente",
    bottleMaterialCode: "GL 72",
    capType: "Alluminio",
    capMaterialCode: "C/ALU 90",
    hasCapsule: false,
    capsuleMaterialCode: null,
    hasPaperLabel: true,
    photo: null
  }
}

export const getProductSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
