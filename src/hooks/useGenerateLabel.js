import { useState } from 'react'
import QRCode from 'qrcode'
import { saveLabels } from '../services/labelStore'
import { downloadLabelPDF, downloadBoxLabelPDF } from '../services/labelPrinter'
import { saveSnapshot } from '../services/printSnapshot'
import { detectDetailedCategory, getDefaultLegalDescription } from '../services/categoryDetector'
import { useAuth } from '../contexts/AuthContext'

/**
 * Hook for label generation (QR code + PDF download)
 */
export function useGenerateLabel() {
  const { user } = useAuth()
  const [generating, setGenerating] = useState(false)

  const generateQR = async (slug, language, country) => {
    const url = `https://label.sakecompany.com/${slug}?lang=${language}&country=${country}`
    const canvas = await QRCode.toCanvas(document.createElement('canvas'), url, {
      width: 400, errorCorrectionLevel: 'H', margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    })
    return canvas.toDataURL('image/png')
  }

  const generate = async (productsToGenerate, { selectedLanguage, selectedCountry, importer, reviewEdits = {} }) => {
    setGenerating(true)
    const labels = []

    for (const product of productsToGenerate) {
      try {
        const qr = await generateQR(product.slug, selectedLanguage, selectedCountry)
        const re = reviewEdits[product.slug] || {}
        const detailedCategory = re.category || detectDetailedCategory(
          product.name, product.category || '', product.shopifyType || ''
        )
        const legalDesc = re.legalDescription
          || product.legalDescription
          || getDefaultLegalDescription(detailedCategory, selectedLanguage)
        const ingOverride = re.ingredients ? { ...product.ingredients, [selectedLanguage]: re.ingredients } : product.ingredients
        const algOverride = re.allergens !== undefined ? { ...product.allergens, [selectedLanguage]: re.allergens } : product.allergens

        // ── Tipologia + Finiture ──────────────────────────────────────────────
        // Product_Type_Current: session override of the base product type.
        // Empty   → use detailedCategory (auto-detected)
        // "Nessuna" → omit tipologia from PDF (show only finiture if present)
        // Any text → use as tipologia (renders MODIFIED badge in PDF)
        const rawTypeCurrent = (re.productTypeCurrent || '').trim()
        const isTypeOverridden = rawTypeCurrent !== '' && rawTypeCurrent !== detailedCategory

        // Resolve effective base type for PDF
        let effectiveBaseType
        if (rawTypeCurrent === 'Nessuna') {
          effectiveBaseType = ''               // omit entirely
        } else if (rawTypeCurrent !== '') {
          effectiveBaseType = rawTypeCurrent   // use override
        } else {
          effectiveBaseType = detailedCategory || product.category || ''
        }

        // Finiture: space-separated finishing words (Koshu, Nama, Genshu …)
        const finitureTokens = (re.finiture || '').trim().split(/\s+/).filter(Boolean)
        const finitureStr = finitureTokens.join(' ')

        // Composed category line for PDF: "Tokubetsu Honjozo Koshu Nama"
        const composedCategory = [effectiveBaseType, finitureStr].filter(Boolean).join(' ')

        const label = {
          ...product,
          category: composedCategory || detailedCategory || product.category,
          // Pass metadata so labelPrinter can render the MODIFIED badge
          productTypeCurrent: rawTypeCurrent,
          productTypeOriginal: detailedCategory || product.category || '',
          isTypeModified: isTypeOverridden,
          finiture: finitureStr,
          legalDescription: legalDesc,
          alcoholPct: re.alcoholPct ? parseFloat(re.alcoholPct) : product.alcoholPct,
          volumeMl: re.volumeMl ? parseInt(re.volumeMl) : product.volumeMl,
          countryOfOrigin: re.countryOfOrigin || product.countryOfOrigin,
          barcodeBox: re.eanBox || product.barcodeBox || '',
          ingredients: ingOverride,
          allergens: algOverride,
          qr,
          language: selectedLanguage,
          country: selectedCountry,
          importer,
          generatedAt: new Date().toISOString(),
        }
        labels.push(label)
      } catch (err) {
        console.error(`QR failed for ${product.name}:`, err)
      }
    }

    // Save to archive
    saveLabels(labels.map(l => ({ ...l, generatedBy: user?.username || 'unknown' })))

    // Download PDFs
    for (const label of labels) {
      try {
        await downloadLabelPDF(label)
        await new Promise(r => setTimeout(r, 200))
        saveSnapshot(label, selectedLanguage).catch(err => console.warn('[Snapshot]', err.message))
        if (label.barcodeBox) {
          await downloadBoxLabelPDF(label)
          await new Promise(r => setTimeout(r, 200))
        }
      } catch (err) {
        console.error(`PDF download failed for ${label.name}:`, err)
      }
    }

    setGenerating(false)
    return labels
  }

  return { generate, generating, generateQR }
}
