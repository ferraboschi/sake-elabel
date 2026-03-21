import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  REGION_CODE_LABELS,
  REGION_CODE_TO_IMPORTER_COUNTRY,
  defaultImporters,
  getCustomImporters,
  addCustomImporter,
  updateCustomImporter,
  removeCustomImporter,
  getAllImporters,
} from '../data/importers'

/**
 * Importer Manager — CRUD for importers per region.
 * Each region (ITA, CHE, DEU, etc.) can have one or more importers.
 * The user can add/edit/remove importers and assign them to regions.
 */
const ImporterManager = () => {
  const navigate = useNavigate()
  const [importers, setImporters] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', address: '', lang: 'it', regionCode: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', lang: 'it', regionCode: 'ITA' })

  // Load all importers
  const reload = () => {
    const all = []
    // Defaults
    for (const [country, imp] of Object.entries(defaultImporters)) {
      if (imp.name) all.push({ ...imp, _default: true, _country: country })
    }
    // Custom
    const custom = getCustomImporters()
    for (const c of custom) {
      all.push({ ...c, _default: false })
    }
    setImporters(all)
  }

  useEffect(() => { reload() }, [])

  // Which regions use this importer?
  const getRegionsForImporter = (imp) => {
    const regions = []
    for (const [code, countryKey] of Object.entries(REGION_CODE_TO_IMPORTER_COUNTRY)) {
      if (imp._default && imp._country === countryKey) regions.push(code)
      if (!imp._default && (imp.regionCode === code || imp.country === countryKey)) regions.push(code)
    }
    return [...new Set(regions)]
  }

  // Get the importer assigned to a region
  const getImporterForRegion = (regionCode) => {
    // First check custom
    const custom = getCustomImporters().find(i => i.regionCode === regionCode)
    if (custom) return custom
    // Then default
    const countryKey = REGION_CODE_TO_IMPORTER_COUNTRY[regionCode]
    if (countryKey && defaultImporters[countryKey]?.name) {
      return { ...defaultImporters[countryKey], _default: true }
    }
    return null
  }

  const handleSaveEdit = (imp) => {
    if (imp._default) {
      // Can't edit defaults — but we could override via localStorage
      // For now, defaults are read-only
      return
    }
    updateCustomImporter(imp.id, {
      name: editForm.name.trim(),
      address: editForm.address.trim(),
      lang: editForm.lang,
      regionCode: editForm.regionCode || imp.regionCode,
    })
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

  // Group importers by region for display
  const regionCodes = Object.keys(REGION_CODE_LABELS)

  const styles = {
    container: { maxWidth: '800px', margin: '0 auto', padding: '24px 16px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' },
    backBtn: {
      background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 16px',
      cursor: 'pointer', fontSize: '13px', color: '#555',
    },
    card: {
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px',
      padding: '18px 20px', marginBottom: '12px',
    },
    regionBadge: {
      display: 'inline-block', background: '#f0f0f0', borderRadius: '6px',
      padding: '3px 10px', fontSize: '12px', fontWeight: 600, marginRight: '6px', color: '#444',
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
      background: '#222', color: '#fff', border: 'none', borderRadius: '8px',
      padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    },
    btnSecondary: {
      background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '8px',
      padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
    },
    btnDanger: {
      background: '#fff', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '8px',
      padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
    },
    langSelect: {
      padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px',
      fontSize: '13px', background: '#fff',
    },
  }

  const langLabels = { it: 'Italiano', de: 'Deutsch', fr: 'Français', es: 'Español', ja: '日本語' }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <button onClick={() => navigate('/')} style={styles.backBtn}>← Dashboard</button>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>Gestione Importatori</h1>
          </div>
          <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0 0' }}>
            Registra gli importatori per ogni paese di vendita
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={styles.btnPrimary}>
          + Nuovo importatore
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ ...styles.card, border: '2px solid #1565c0', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: 0, marginBottom: '16px' }}>
            Nuovo importatore
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#555' }}>
                Paese di vendita
              </label>
              <select
                value={addForm.regionCode}
                onChange={e => {
                  const rc = e.target.value
                  const info = REGION_CODE_LABELS[rc]
                  setAddForm(prev => ({ ...prev, regionCode: rc, lang: info?.lang || 'it' }))
                }}
                style={{ ...styles.select, width: '100%' }}
              >
                {regionCodes.map(rc => (
                  <option key={rc} value={rc}>
                    {REGION_CODE_LABELS[rc].label} ({rc})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#555' }}>
                Lingua etichetta
              </label>
              <select
                value={addForm.lang}
                onChange={e => setAddForm(prev => ({ ...prev, lang: e.target.value }))}
                style={{ ...styles.select, width: '100%' }}
              >
                {Object.entries(langLabels).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#555' }}>
              Nome importatore
            </label>
            <input
              type="text"
              placeholder="Es: Swiss Sake Import AG"
              value={addForm.name}
              onChange={e => setAddForm(prev => ({ ...prev, name: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#555' }}>
              Indirizzo
            </label>
            <input
              type="text"
              placeholder="Es: Bahnhofstrasse 10, 8001 Zürich - Svizzera"
              value={addForm.address}
              onChange={e => setAddForm(prev => ({ ...prev, address: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleAdd} style={styles.btnPrimary}>Salva</button>
            <button onClick={() => setShowAdd(false)} style={styles.btnSecondary}>Annulla</button>
          </div>
        </div>
      )}

      {/* Region list — one card per region */}
      <div>
        {regionCodes.map(rc => {
          const regionInfo = REGION_CODE_LABELS[rc]
          const imp = getImporterForRegion(rc)

          return (
            <div key={rc} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{regionInfo.label}</span>
                    <span style={styles.regionBadge}>{rc}</span>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      Lingua: {langLabels[regionInfo.lang] || regionInfo.lang}
                    </span>
                  </div>

                  {imp ? (
                    editingId === (imp.id || `default-${rc}`) ? (
                      /* Edit mode */
                      <div style={{ marginTop: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Nome importatore"
                            style={styles.input}
                          />
                          <select
                            value={editForm.lang}
                            onChange={e => setEditForm(prev => ({ ...prev, lang: e.target.value }))}
                            style={{ ...styles.select, width: '100%' }}
                          >
                            {Object.entries(langLabels).map(([code, label]) => (
                              <option key={code} value={code}>{label}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editForm.address}
                          onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                          placeholder="Indirizzo completo"
                          style={{ ...styles.input, marginBottom: '10px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleSaveEdit(imp)} style={styles.btnPrimary}>Salva</button>
                          <button onClick={() => setEditingId(null)} style={styles.btnSecondary}>Annulla</button>
                        </div>
                      </div>
                    ) : (
                      /* View mode */
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{imp.name}</div>
                        <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
                          {imp.address || '(nessun indirizzo)'}
                        </div>
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: '13px', color: '#bbb', fontStyle: 'italic' }}>
                      Nessun importatore assegnato
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                  {imp && !imp._default && editingId !== imp.id && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(imp.id)
                          setEditForm({
                            name: imp.name || '',
                            address: imp.address || '',
                            lang: imp.lang || regionInfo.lang || 'it',
                            regionCode: rc,
                          })
                        }}
                        style={styles.btnSecondary}
                      >
                        Modifica
                      </button>
                      <button onClick={() => { handleDelete(imp); }} style={styles.btnDanger}>
                        Elimina
                      </button>
                    </>
                  )}
                  {imp && imp._default && (
                    <span style={{ fontSize: '11px', color: '#aaa', padding: '8px 0' }}>predefinito</span>
                  )}
                  {!imp && (
                    <button
                      onClick={() => {
                        setAddForm({ name: '', address: '', lang: regionInfo.lang || 'it', regionCode: rc })
                        setShowAdd(true)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      style={styles.btnPrimary}
                    >
                      + Aggiungi
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ImporterManager
