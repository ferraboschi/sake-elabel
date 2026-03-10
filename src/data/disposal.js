export const disposalMaterials = {
  glass: {
    it: "Bottiglia di Vetro",
    de: "Glasflasche",
    fr: "Bouteille en Verre",
    es: "Botella de Vidrio",
    ja: "ガラス瓶",
    collection: {
      it: "Raccolta Vetro",
      de: "Glassammlung",
      fr: "Collecte Verre",
      es: "Recogida Vidrio",
      ja: "ガラス回収"
    }
  },
  aluminum: {
    it: "Tappo in Alluminio",
    de: "Aluminium-Verschluss",
    fr: "Bouchon Aluminium",
    es: "Tapón de Aluminio",
    ja: "アルミキャップ",
    collection: {
      it: "Raccolta Metalli",
      de: "Metallsammlung",
      fr: "Collecte Métaux",
      es: "Recogida Metales",
      ja: "金属回収"
    }
  },
  cork: {
    it: "Tappo di Sughero",
    de: "Korkenverschluss",
    fr: "Bouchon Liège",
    es: "Tapón de Corcho",
    ja: "コルク栓",
    collection: {
      it: "Rifiuti Generici",
      de: "Restabfall",
      fr: "Déchets Généraux",
      es: "Residuos Generales",
      ja: "一般廃棄物"
    }
  },
  plastic: {
    it: "Capsula PVC",
    de: "PVC-Kapsel",
    fr: "Capsule PVC",
    es: "Cápsula PVC",
    ja: "PVCカプセル",
    collection: {
      it: "Raccolta Plastica",
      de: "Kunststoffsammlung",
      fr: "Collecte Plastique",
      es: "Recogida Plástico",
      ja: "プラスチック回収"
    }
  },
  paper: {
    it: "Etichetta di Carta",
    de: "Papieretikett",
    fr: "Étiquette Papier",
    es: "Etiqueta de Papel",
    ja: "紙ラベル",
    collection: {
      it: "Raccolta Carta",
      de: "Papiersammlung",
      fr: "Collecte Papier",
      es: "Recogida Papel",
      ja: "紙回収"
    }
  }
}

export const getMaterialName = (materialType, lang) => {
  const material = disposalMaterials[materialType]
  return material ? material[lang] || material['it'] : materialType
}

export const getMaterialCollection = (materialType, lang) => {
  const material = disposalMaterials[materialType]
  return material ? material.collection[lang] || material.collection['it'] : 'Rifiuti Generici'
}
