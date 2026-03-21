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
  updateDefaultImporter,
  getEffectiveDefault,
} from '../data/importers'

const ImporterManager = () => {
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', address: '', lang: 'it', regionCode: '' })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', address: '', lang: 'it', regionCode: 'ITA' })
  const [version, setVersion] = useState(0) // force re-render after edits

  const reload = () => setVersion(v => v + 1)

  // Get the importer assigned to a region
  const getImporterForRegion = (regionCode) => {
    // First check custom
    const custom = getCustomImporters().find(i => i.regionCode === regionCode)
    if (custom) return { ...custom, _default: false }
    // Then default (with overrides)
    const countryKey = REGION_CODE_TO_IMPORTER_COUNTRY[regionCode]
    if (countryKey) {
      const eff = getEffectiveDefault(countryKey)
      if (eff && eff.name) return { ...eff, _default: true, _country: countryKey }
    }
    return null
  }

  // Is importer complete? (has name AND address)
  const isComplete = (imp) => imp && imp.name && imp.name.trim() && imp.address && imp.address.trim()

  const handleSaveEdit = (imp) => {
    if (imp._default) {
      // Save override for default importer
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

  // Count stats
  const completeCount = regionCodes.filter(rc => isComplete(getImporterForRegion(rc))).length
  const incompleteCount = regionCodes.filter(rc => {
    const imp = getImporterForRegion(rc)
    return imp && !isComplete(imp)
  }).length
  const missingCount = regionCodes.filter(rc => !getImporterForRegion(rc)).length

  const styles = {
    container: { maxWidth: '800px', margin: '0 auto', padding: '24px 16px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
    backBtn: {
      background: 'none', border: '1px solid #ddd', borderRadius: '8px', padding: '8px 16px',
      cursor: 'pointer', fontSize: '13px', color: '#555',
    },
    card: (complete) => ({
      background: '#fff',
      border: complete ? '1px solid #c8e6c9' : '1px solid #e0e0e0',
      borderLeft: complete ? '4px solid #4caf50' : '4px solid #e0e0e0',
      borderRadius: '10px',
      padding: '16px 20px', marginBottom: '10px',
    }),
    cardMissing: {
      background: '#fafafa', border: '1px solid #eee', borderLeft: '4px solid #ffcdd2',
      borderRadius: '10px', padding: '16px 20px', marginBottom: '10px',
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
    btnEdit: {
      background: '#fff', color: '#1565c0', border: '1px solid #bbdefb', borderRadius: '8px',
      padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
    },
    btnDanger: {
      background: '#fff', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '8px',
      padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
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
        <button onClick={() => { setShowAdd(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} style={styles.btnPrimary}>
          + Nuovo importatore
        </button>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: '16px', marginBottom: '20px', padding: '12px 16px',
        background: '#f8f8f8', borderRadius: '10px', fontSize: '13px',
      }}>
        <span>
          <span style={{ fontWeight: 700, color: '#4caf50' }}>{completeCount}</span> completi
        </span>
        <span style={{ color: '#ccc' }}>|</span>
        <span>
          <span style={{ fontWeight: 700, color: '#f57c00' }}>{incompleteCount}</span> incompleti
        </span>
        <span style={{ color: '#ccc' }}>|</span>
        <span>
          <span style={{ fontWeight: 700, color: '#d32f2f' }}>{missingCount}</span> mancanti
        </span>
        <span style={{ marginLeft: 'auto', color: '#888' }}>
          Solo i completi (nome + indirizzo) appaiono nella scelta importatore
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: '#fff', border: '2px solid #1565c0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
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

      {/* Region list */}
      <div>
        {regionCodes.map(rc => {
          const regionInfo = REGION_CODE_LABELS[rc]
          const imp = getImporterForRegion(rc)
          const complete = isComplete(imp)
          const editKey = imp?._default ? `default-${imp._country}` : imp?.id

          return (
            <div key={rc} style={imp ? styles.card(complete) : styles.cardMissing}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {/* Region header row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>{regionInfo.label}</span>
                    <span style={styles.regionBadge}>{rc}</span>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>
                      {langLabels[regionInfo.lang] || regionInfo.lang}
                    </span>
                    {imp && (
                      <span style={styles.statusBadge(complete)}>
                        {complete ? 'Completo' : 'Incompleto'}
                      </span>
                    )}
                  </div>

                  {imp ? (
                    editingId === editKey ? (
                      /* Edit mode */
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '3px', color: '#555' }}>Nome</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Nome importatore"
                              style={styles.input}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '3px', color: '#555' }}>Lingua</label>
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
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '3px', color: '#555' }}>Indirizzo</label>
                          <input
                            type="text"
                            value={editForm.address}
                            onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                            placeholder="Indirizzo completo"
                            style={{ ...styles.input, marginBottom: '10px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleSaveEdit(imp)} style={styles.btnPrimary}>Salva</button>
                          <button onClick={() => setEditingId(null)} style={styles.btnSecondary}>Annulla</button>
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
                    )
                  ) : (
                    <div style={{ fontSize: '13px', color: '#d32f2f' }}>
                      Nessun importatore assegnato
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', flexShrink: 0 }}>
                  {imp && editingId !== editKey && (
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
                      style={styles.btnEdit}
                    >
                      Modifica
                    </button>
                  )}
                  {imp && !imp._default && editingId !== editKey && (
                    <button onClick={() => handleDelete(imp)} style={styles.btnDanger}>
                      Elimina
                    </button>
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
