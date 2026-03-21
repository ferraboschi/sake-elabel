import React from 'react'
import { LANG_OPTIONS } from '../../config/constants'
import { getImportersForRegion, REGION_CODE_LABELS } from '../../data/importers'

/**
 * Stripe-styled top configuration bar.
 * Language + Country + Importer selectors.
 */
const selectStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #d8dee4',
  borderRadius: '6px', fontSize: '14px', color: '#0a2540',
  background: '#fff', outline: 'none', transition: 'border-color 0.15s',
}

const labelStyle = {
  display: 'block', fontWeight: 500, marginBottom: '5px',
  fontSize: '13px', color: '#596780', letterSpacing: '0.01em',
}

const TopBar = ({
  selectedLanguage, setSelectedLanguage,
  selectedRegion, setSelectedRegion,
  selectedImporterId, setSelectedImporterId,
  allowedRegionCodes,
  importerVersion,
}) => {
  // Force re-read when importerVersion changes
  void importerVersion
  const importersForRegion = getImportersForRegion(selectedRegion, { onlyComplete: true })
  const regionCodes = allowedRegionCodes || Object.keys(REGION_CODE_LABELS)

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
      padding: '16px 20px', background: '#fff', borderRadius: '8px',
      border: '1px solid #e3e8ee', marginBottom: '20px',
    }}>
      {/* Language */}
      <div>
        <label style={labelStyle}>
          Lingua etichetta <span style={{ color: '#8898aa', fontWeight: 400 }}>/ ラベル言語</span>
        </label>
        <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} style={selectStyle}>
          {LANG_OPTIONS.map(l => (
            <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
          ))}
        </select>
      </div>

      {/* Country */}
      <div>
        <label style={labelStyle}>
          Paese destinazione <span style={{ color: '#8898aa', fontWeight: 400 }}>/ 仕向地</span>
        </label>
        {regionCodes.length > 0 ? (
          <select
            value={regionCodes.includes(selectedRegion) ? selectedRegion : ''}
            onChange={e => setSelectedRegion(e.target.value)}
            style={selectStyle}
          >
            {!regionCodes.includes(selectedRegion) && (
              <option value="" disabled>— Seleziona paese —</option>
            )}
            {regionCodes.map(code => (
              <option key={code} value={code}>{REGION_CODE_LABELS[code]?.label || code}</option>
            ))}
          </select>
        ) : (
          <div style={{
            padding: '9px 12px', borderRadius: '6px',
            background: '#fef3cd', border: '1px solid #ffc107',
            fontSize: '13px', color: '#856404',
          }}>
            Nessun paese autorizzato
          </div>
        )}
      </div>

      {/* Importer */}
      <div>
        <label style={labelStyle}>
          Importatore <span style={{ color: '#8898aa', fontWeight: 400 }}>/ 輸入業者</span>
        </label>
        {importersForRegion.length > 0 ? (
          <select value={selectedImporterId} onChange={e => setSelectedImporterId(e.target.value)} style={selectStyle}>
            {importersForRegion.map(imp => (
              <option key={imp.id} value={imp.id}>{imp.name}</option>
            ))}
          </select>
        ) : (
          <div style={{
            padding: '9px 12px', borderRadius: '6px',
            background: '#fef3cd', border: '1px solid #ffc107',
            fontSize: '13px', color: '#856404',
          }}>
            Nessun importatore disponibile
          </div>
        )}
      </div>
    </div>
  )
}

export default TopBar
