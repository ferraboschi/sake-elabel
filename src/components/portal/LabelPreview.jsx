import React, { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { COUNTRY_NAMES } from '../../services/labelPrinter'

/**
 * Live preview of the back label, replicating labelPrinter.js layout.
 *
 * Props:
 *   name, category, legalDescription, ingredients,
 *   alcoholPct, volumeMl, code, barcode, countryOfOrigin,
 *   importer: { name, address }, perText, lang,
 *   isBox, bottlesPerBox
 */

const TRANSLATIONS = {
  it: { desc: 'Bevanda alcolica fermentata di riso (SAKE)', alc: 'Alcool', content: 'Contenuto', ing: 'Ingredienti:', origin: 'Prodotto e confezionato in', imp: 'Importato da:', warn: 'Avvertenze:', warnings: ['Sconsigliato in gravidanza.', 'Vietata la vendita ai minori di 18 anni.', 'Conservare in luogo fresco e asciutto e al riparo dalla luce.'], lot: 'Lotto: vedi sulla confezione', code: 'Cod.', website: 'sakecompany.com', qr: 'Info nutrizionali nel QR', bottles: 'bottiglie' },
  de: { desc: 'Fermentiertes alkoholisches Reisgetränk (SAKE)', alc: 'Alkohol', content: 'Inhalt', ing: 'Zutaten:', origin: 'Hergestellt und verpackt in', imp: 'Importiert von:', warn: 'Hinweise:', warnings: ['In der Schwangerschaft nicht empfohlen.', 'Verkauf an Minderjährige unter 18 Jahren verboten.', 'Kühl und trocken lagern, vor Licht schützen.'], lot: 'Los: siehe Verpackung', code: 'Art.-Nr.', website: 'sakecompany.com', qr: 'Nährwertangaben im QR', bottles: 'Flaschen' },
  fr: { desc: 'Boisson alcoolique fermentée de riz (SAKE)', alc: 'Alcool', content: 'Contenu', ing: 'Ingrédients:', origin: 'Produit et conditionné au', imp: 'Importé par:', warn: 'Avertissements:', warnings: ['Déconseillé pendant la grossesse.', 'Vente interdite aux mineurs de moins de 18 ans.', "Conserver dans un endroit frais et sec, à l'abri de la lumière."], lot: 'Lot : voir emballage', code: 'Réf.', website: 'sakecompany.com', qr: 'Info nutritionnelles dans le QR', bottles: 'bouteilles' },
  es: { desc: 'Bebida alcohólica fermentada de arroz (SAKE)', alc: 'Alcohol', content: 'Contenido', ing: 'Ingredientes:', origin: 'Producido y envasado en', imp: 'Importado por:', warn: 'Advertencias:', warnings: ['No recomendado durante el embarazo.', 'Prohibida la venta a menores de 18 años.', 'Conservar en lugar fresco y seco, protegido de la luz.'], lot: 'Lote: ver envase', code: 'Cód.', website: 'sakecompany.com', qr: 'Info nutricional en el QR', bottles: 'botellas' },
  ja: { desc: '日本酒', alc: 'アルコール', content: '内容量', ing: '原材料:', origin: '製造・瓶詰', imp: '輸入者:', warn: '注意事項:', warnings: ['妊娠中の方にはお勧めしません。', '18歳未満の方への販売は禁止。', '直射日光を避け涼しく保管。'], lot: 'ロット：パッケージ参照', code: 'コード', website: 'sakecompany.com', qr: '栄養成分はQRコード参照', bottles: '本' },
}

const S = {
  label: { background: 'white', border: '1.5px solid #1a1a1a', borderRadius: '1px', padding: '10px 8px', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", position: 'relative', fontSize: '7px', lineHeight: 1.35, color: '#111', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  cropMark: (pos) => ({ position: 'absolute', width: 10, height: 10, ...({ tl: { top: -5, left: -5, borderTop: '1px solid #bbb', borderLeft: '1px solid #bbb' }, tr: { top: -5, right: -5, borderTop: '1px solid #bbb', borderRight: '1px solid #bbb' }, bl: { bottom: -5, left: -5, borderBottom: '1px solid #bbb', borderLeft: '1px solid #bbb' }, br: { bottom: -5, right: -5, borderBottom: '1px solid #bbb', borderRight: '1px solid #bbb' } }[pos]) }),
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: '10.5px', fontWeight: 800, lineHeight: 1.15, letterSpacing: '0.2px', textTransform: 'uppercase' },
  category: { fontSize: '7.5px', fontStyle: 'italic', color: '#555', marginTop: 1 },
  pitto: { width: 26, height: 26, border: '1.8px solid #1a3a5c', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 },
  sep: { borderTop: '0.5px solid #ccc', margin: '5px 0' },
  body: { display: 'grid', gridTemplateColumns: '1fr 42px', gap: 4 },
  footer: { display: 'grid', gridTemplateColumns: '30px 1fr', gap: 5 },
  footerLine: { display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: '5.5px', color: '#999' },
}

export default function LabelPreview({
  name = '', category = '', legalDescription = '',
  ingredients = '', alcoholPct = '', volumeMl = '', code = '',
  barcode = '', countryOfOrigin = 'Japan',
  importer = null, perText = '', lang = 'it',
  isBox = false, bottlesPerBox = '',
}) {
  const barcodeRef = useRef(null)
  const t = TRANSLATIONS[lang] || TRANSLATIONS.it
  const desc = legalDescription || t.desc

  // Render barcode only if present — maximize size within column
  useEffect(() => {
    if (!barcodeRef.current) return
    if (!barcode) {
      while (barcodeRef.current.firstChild) barcodeRef.current.removeChild(barcodeRef.current.firstChild)
      return
    }
    try {
      JsBarcode(barcodeRef.current, barcode, {
        format: barcode.length === 13 ? 'EAN13' : barcode.length === 14 ? 'ITF14' : 'CODE128',
        width: 1.2,    // bar width — wider for readability
        height: 80,     // tall bars — will be constrained by container
        displayValue: true,
        fontSize: 8,
        margin: 0,
        textMargin: 2,
        flat: true,
      })
    } catch { /* invalid barcode */ }
  }, [barcode])

  const titleLines = name.toUpperCase().replace(/\s+/g, ' ').trim()
  const categoryLine = isBox && bottlesPerBox
    ? `${category} · ${bottlesPerBox} ${t.bottles}`
    : category

  return (
    <div style={S.label}>
      {/* Crop marks */}
      <div style={S.cropMark('tl')} /><div style={S.cropMark('tr')} />
      <div style={S.cropMark('bl')} /><div style={S.cropMark('br')} />

      {/* Title + Pittogramma */}
      <div style={S.titleRow}>
        <div>
          <div style={S.title}>{titleLines || '—'}</div>
          {categoryLine && <div style={S.category}>{categoryLine}</div>}
        </div>
        <div style={S.pitto}>🍶</div>
      </div>

      <div style={S.sep} />

      {/* Body: text + barcode column */}
      <div style={S.body}>
        <div>
          <div style={{ fontSize: '6.5px', color: '#555', lineHeight: 1.35 }}>{desc}</div>

          {ingredients && (
            <>
              <div style={{ fontSize: '7.5px', fontWeight: 700, marginTop: 3 }}>{t.ing}</div>
              <div style={{ fontSize: '6.8px', lineHeight: 1.3 }}>{ingredients}</div>
            </>
          )}

          {alcoholPct && <div style={{ fontSize: '6.8px', marginTop: 3 }}>{t.alc}: {alcoholPct}% Vol.</div>}
          {volumeMl && <div style={{ fontSize: '6.8px' }}>{t.content}: {volumeMl}ml</div>}

          <div style={S.sep} />

          {countryOfOrigin && (
            <div style={{ fontSize: '6.5px', fontWeight: 600, marginBottom: 2 }}>{t.origin} {COUNTRY_NAMES[countryOfOrigin]?.[lang] || countryOfOrigin}</div>
          )}

          {importer?.name && (
            <>
              <div style={{ fontSize: '6px', color: '#999' }}>{t.imp}</div>
              <div style={{ fontSize: '7px', fontWeight: 600 }}>{importer.name}</div>
              {/* Address + website merged on same line */}
              <div style={{ fontSize: '6px', color: '#555', lineHeight: 1.3 }}>
                {importer.address ? `${importer.address}, ${t.website}` : t.website}
              </div>
            </>
          )}

          {/* "Per:" line — always reserved (empty if no perText) so label height stays stable */}
          <div style={{ fontSize: '6.5px', marginTop: 1, minHeight: '8px' }}>
            {perText && <><span style={{ color: '#999' }}>Per: </span>{perText}</>}
          </div>
        </div>

        {/* Barcode column — fills full height of body section, empty when no barcode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {barcode ? (
            <svg ref={barcodeRef} style={{
              width: '100%',
              height: '100%',
              maxWidth: 42,
              transform: 'rotate(90deg)',
              transformOrigin: 'center',
            }} />
          ) : null}
        </div>
      </div>

      <div style={S.sep} />

      {/* Footer: QR (bottle) or Box icon (box) + Warnings */}
      <div style={S.footer}>
        {isBox ? (
          /* Box icon — same image used in the real PDF */
          <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={(import.meta.env.BASE_URL || '/') + 'icons/BOX.png'} alt="Box"
              style={{ width: 28, height: 28, objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.textContent = '📦' }}
            />
          </div>
        ) : (
          /* QR code placeholder */
          <div style={{ width: 30, height: 30, background: '#f5f5f5', border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 22, height: 22, background: 'repeating-conic-gradient(#222 0% 25%, #fff 0% 50%) 50% / 3px 3px' }} />
          </div>
        )}
        <div>
          <div style={{ fontSize: '6.8px', fontWeight: 700 }}>{t.warn}</div>
          <div style={{ fontSize: '5.8px', color: '#333', lineHeight: 1.35 }}>{t.warnings.join(' ')}</div>
          {!isBox && <div style={{ fontSize: '5.5px', color: '#888', marginTop: 1 }}>{t.qr}</div>}
        </div>
      </div>

      <div style={S.footerLine}>
        <span>{t.code} {code || '—'}</span>
        <span>{t.lot}</span>
      </div>
    </div>
  )
}
