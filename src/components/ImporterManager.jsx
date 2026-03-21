import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  REGION_CODE_LABELS,
  REGION_CODE_TO_IMPORTER_COUNTRY,
  PRIMARY_REGIONS,
  isPrimaryRegion,
  getCustomImporters,
  addCustomImporter,
  updateCustomImporter,
  removeCustomImporter,
  updateDefaultImporter,
  getEffectiveDefault,
} from '../data/importers'

const ImporterManager = () => {
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', address: '', lang: 'it', regionCode: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', lang: 'it', regionCode: 'ITA' })
  const [version, setVersion] = useState(0)

  const reload = () => setVersion(v => v + 1)

  // Get the importer for a region — only returns data if:
  // 1. It's a primary region (ITA, DEU, FRA, ESP) with its own default, OR
  // 2. A custom importer was explicitly added for this region
  const getImporterForRegion = (regionCode) => {
    // First check custom importers for this specific region
    const custom = getCustomImporters().find(i => i.regionCode === regionCode)
    if (custom) return { ...custom, _default: false }

    // Only return default importer for PRIMARY regions
    if (isPrimaryRegion(regionCode)) {
      const countryKey = PRIMARY_REGIONS[regionCode]
      const eff = getEffectiveDefault(countryKey)
      if (eff && eff.name) return { ...eff, _default: true, _country: countryKey }
    }

    return null
  }

  const isComplete = (imp) => imp && imp.name && imp.name.trim() && imp.address && imp.address.trim()

  const handleSaveEdit = (imp) => {
    if (imp._default) {
      updateDefaultImporter(imp._country, {
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        lang: editForm.lang,
      })
    } else {
      updateCustomImporter(imp.id, {
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        lang: editForm.lang,
        regionCode: editForm.regionCode || imp.regionCode,
      })
    }
    setEditingId(null)
    reload()
  }

  const handleDelete = (imp) => {
    if (imp._default) return
    if (!window.confirm(`Eliminare l'importatore "${imp.name}"?`)) return
    removeCustomImporter(imp.id)
    reload()
  }

  const handleAdd = () => {
    if (!addForm.name.trim()) return
    const regionInfo = REGION_CODE_LABELS[addForm.regionCode] || { label: addForm.regionCode, lang: 'it' }
    const importerCountry = REGION_CODE_TO_IMPORTER_COUNTRY[addForm.regionCode] || regionInfo.label
    const codeMap = {
      Italia: 'IT', Deutschland: 'DE', France: 'FR', 'España': 'ES', Japan: 'JP',
      Svizzera: 'CH', Lussemburgo: 'LU', 'Paesi Bassi': 'NL', Austria: 'AT',
      'Regno Unito': 'GB', Belgio: 'BE', Albania: 'AL',
    }
    addCustomImporter({
      name: addForm.name.trim(),
      address: addForm.address.trim(),
      lang: addForm.lang,
      regionCode: addForm.regionCode,
      country: regionInfo.label,
      code: codeMap[regionInfo.label] || codeMap[importerCountry] || 'IT',
    })
    setAddForm({ name: '', address: '', lang: 'it', regionCode: 'ITA' })
    setShowAdd(false)
    reload()
  }

  const regionCodes = Object.keys(REGION_CODE_LABELS)
  const langLabels = { it: 'Italiano', de: 'Deutsch', fr: 'Français', es: 'Español', ja: '日本語' }

  // Separate configured vs unconfigured
  const configuredRegions = regionCodes.filter(rc => getImporterForRegion(rc))
  const unconfiguredRegions = regionCodes.filter(rc => !getImporterForRegion(rc))
  const completeCount = configuredRegions.filter(rc => isComplete(getImporterForRegion(rc))).length
  const incompleteCount = configuredRegions.length - completeCount

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <button onClick={() => navigate('/')} style={s.backBtn}>← Dashboard</button>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
              Gestione Importatori / 輸入業者管理
            </h1>
          </div>
          <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0 0' }}>
            Registra gli importatori per ogni paese di vendita
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          style={s.btnPrimary}
        >
          + Nuovo importatore
        </button>
      </div>

      {/* Summary bar */}
      <div style={s.summaryBar}>
        <span>
          <span style={{ fontWeight: 700, color: '#4caf50' }}>{completeCount}</span> configurati
        </span>
        <span style={{ color: '#ccc' }}>|</span>
        <span>
          <span style={{ fontWeight: 700, color: '#f57c00' }}>{incompleteCount}</span> incompleti
        </span>
        <span style={{ color: '#ccc' }}>|</span>
        <span>
          <span style={{ fontWeight: 700, color: '#aaa' }}>{unconfiguredRegions.length}</span> non configurati
        </span>
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: '12px' }}>
          Solo i completi appaiono nella scelta importatore
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={s.addCard}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: 0, marginBottom: '16px' }}>
            Nuovo importatore / 新規輸入業者
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={s.label}>Paese di vendita / 販売国</label>
              <select
                value={addForm.regionCode}
                onChange={e => {
                  const rc = e.target.value
                  const info = REGION_CODE_LABELS[rc]
                  setAddForm(prev => ({ ...prev, regionCode: rc, lang: info?.lang || 'it' }))
                }}
                style={{ ...s.select, width: '100%' }}
              >
                {regionCodes.map(rc => (
                  <option key={rc} value={rc}>
                    {REGION_CODE_LABELS[rc].label} ({rc})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Lingua etichetta / ラベル言語</label>
              <select
                value={addForm.lang}
                onChange={e => setAddForm(prev => ({ ...prev, lang: e.target.value }))}
                style={{ ...s.select, width: '100%' }}
              >
                {Object.entries(langLabels).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={s.label}>Nome importatore / 輸入業者名</label>
            <input
              type="text"
              placeholder="Es: Swiss Sake Import AG"
              value={addForm.name}
              onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
              style={s.input}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={s.label}>Indirizzo / 住所</label>
            <input
              type="text"
              placeholder="Es: Bahnhofstrasse 10, 8001 Zürich - Svizzera"
              value={addForm.address}
              onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
              style={s.input}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleAdd} style={s.btnPrimary}>Salva</button>
            <button onClick={() => setShowAdd(false)} style={s.btnSecondary}>Annulla</button>
          </div>
        </div>
      )}

      {/* Configured importers */}
      {configuredRegions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Importatori configurati
          </h2>
          {configuredRegions.map(rc => {
            const regionInfo = REGION_CODE_LABELS[rc]
            const imp = getImporterForRegion(rc)
            const complete = isComplete(imp)
            const editKey = imp?._default ? `default-${imp._country}` : imp?.id

            return (
              <div key={rc} style={s.card(complete)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    {/* Region header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 600 }}>{regionInfo.label}</span>
                      <span style={s.regionBadge}>{rc}</span>
                      <span style={{ fontSize: '11px', color: '#aaa' }}>
                        {langLabels[regionInfo.lang] || regionInfo.lang}
                      </span>
                      <span style={s.statusBadge(complete)}>
                        {complete ? 'Completo' : 'Incompleto'}
                      </span>
                    </div>

                    {editingId === editKey ? (
                      /* Edit mode */
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <div>
                            <label style={s.labelSmall}>Nome / 名前</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Nome importatore"
                              style={s.input}
                            />
                          </div>
                          <div>
                            <label style={s.labelSmall}>Lingua / 言語</label>
                            <select
                              value={editForm.lang}
                              onChange={e => setEditForm(prev => ({ ...prev, lang: e.target.value }))}
                              style={{ ...s.select, width: '100%' }}
                            >
                              {Object.entries(langLabels).map(([code, label]) => (
                                <option key={code} value={code}>{label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label style={s.labelSmall}>Indirizzo / 住所</label>
                          <input
                            type="text"
                            value={editForm.address}
                            onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="Indirizzo completo"
                            style={{ ...s.input, marginBottom: '10px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleSaveEdit(imp)} style={s.btnPrimary}>Salva</button>
                          <button onClick={() => setEditingId(null)} style={s.btnSecondary}>Annulla</button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{imp.name}</div>
                        <div style={{ fontSize: '13px', color: imp.address ? '#666' : '#d32f2f', marginTop: '2px' }}>
                          {imp.address || '⚠ Indirizzo mancante — compila per renderlo disponibile'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                    {editingId !== editKey && (
                      <button
                        onClick={() => {
                          setEditingId(editKey)
                          setEditForm({
                            name: imp.name || '',
                            address: imp.address || '',
                            lang: imp.lang || regionInfo.lang || 'it',
                            regionCode: rc,
                          })
                        }}
                        style={s.btnEdit}
                      >
                        Modifica
                      </button>
                    )}
                    {!imp._default && editingId !== editKey && (
                      <button onClick={() => handleDelete(imp)} style={s.btnDanger}>
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Unconfigured regions — collapsed */}
      {unconfiguredRegions.length > 0 && (
        <div>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
            Paesi non configurati
          </h2>
          {unconfiguredRegions.map(rc => {
            const regionInfo = REGION_CODE_LABELS[rc]
            return (
              <div key={rc} style={s.cardCollapsed}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#888' }}>{regionInfo.label}</span>
                    <span style={s.regionBadge}>{rc}</span>
                    <span style={{ fontSize: '11px', color: '#bbb' }}>
                      {langLabels[regionInfo.lang] || regionInfo.lang}
                    </span>
                    <span style={s.statusEmpty}>Non configurato</span>
                  </div>
                  <button
                    onClick={() => {
                      setAddForm({ name: '', address: '', lang: regionInfo.lang || 'it', regionCode: rc })
                      setShowAdd(true)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    style={s.btnAddSmall}
                  >
                    + Configura
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------- Styles ---------- */
const s = {
  backBtn: {
    background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 16px',
    cursor: 'pointer', fontSize: '13px', color: '#555',
  },
  summaryBar: {
    display: 'flex', gap: '16px', marginBottom: '20px', padding: '12px 16px',
    background: '#f8f8f8', borderRadius: '10px', fontSize: '13px', alignItems: 'center',
  },
  addCard: {
    background: '#fff', border: '2px solid #635bff', borderRadius: '12px',
    padding: '20px', marginBottom: '20px',
  },
  card: (complete) => ({
    background: '#fff',
    border: complete ? '1px solid #c8e6c9' : '1px solid #ffe0b2',
    borderLeft: complete ? '4px solid #4caf50' : '4px solid #f57c00',
    borderRadius: '10px',
    padding: '16px 20px', marginBottom: '10px',
  }),
  cardCollapsed: {
    background: '#fafafa', border: '1px solid #eee',
    borderLeft: '4px solid #e0e0e0',
    borderRadius: '10px', padding: '12px 20px', marginBottom: '6px',
  },
  regionBadge: {
    display: 'inline-block', background: '#f0f0f0', borderRadius: '6px',
    padding: '2px 8px', fontSize: '11px', fontWeight: 600, color: '#444',
  },
  statusBadge: (complete) => ({
    display: 'inline-block', borderRadius: '6px', padding: '2px 10px',
    fontSize: '11px', fontWeight: 600,
    background: complete ? '#e8f5e9' : '#fff3e0',
    color: complete ? '#2e7d32' : '#e65100',
  }),
  statusEmpty: {
    display: 'inline-block', borderRadius: '6px', padding: '2px 10px',
    fontSize: '11px', fontWeight: 600, background: '#f5f5f5', color: '#bbb',
  },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#555',
  },
  labelSmall: {
    display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '3px', color: '#555',
  },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '14px', boxSizing: 'border-box',
  },
  select: {
    padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px',
    fontSize: '14px', background: '#fff',
  },
  btnPrimary: {
    background: '#635bff', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '8px',
    padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
  },
  btnEdit: {
    background: '#fff', color: '#635bff', border: '1px solid #d4d2ff', borderRadius: '8px',
    padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
  },
  btnDanger: {
    background: '#fff', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '8px',
    padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
  },
  btnAddSmall: {
    background: '#fff', color: '#635bff', border: '1px solid #d4d2ff', borderRadius: '8px',
    padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
  },
}

export default ImporterManager
