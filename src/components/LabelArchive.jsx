import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { searchLabels, getLabelStats } from '../services/labelStore'
import { downloadLabelPDF, downloadBoxLabelPDF } from '../services/labelPrinter'

const LANG_LABELS = {
  it: 'IT', de: 'DE', fr: 'FR', es: 'ES', ja: 'JA'
}
const LANG_FLAGS = {
  it: '🇮🇹', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸', ja: '🇯🇵'
}

const LabelArchive = () => {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [labels, setLabels] = useState([])
  const [stats, setStats] = useState({ total: 0, byLanguage: {}, byCountry: {} })
  const [query, setQuery] = useState('')
  const [filterLang, setFilterLang] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return }
    refreshLabels()
  }, [isAuthenticated])

  const refreshLabels = () => {
    const filters = {}
    if (filterLang) filters.language = filterLang
    if (filterCountry) filters.country = filterCountry
    setLabels(searchLabels(query, filters))
    setStats(getLabelStats())
  }

  useEffect(() => { refreshLabels() }, [query, filterLang, filterCountry])

  // Group labels by product code (stable identifier)
  const grouped = useMemo(() => {
    const map = {}
    labels.forEach(label => {
      // Use productCode as primary grouping key (stable), slug as fallback
      const key = label.productCode || label.productSlug || label.id
      if (!map[key]) {
        map[key] = {
          productName: label.productName,
          productCode: label.productCode,
          category: label.category,
          labels: [],
        }
      }
      map[key].labels.push(label)
    })
    // Sort labels within each group by language
    for (const g of Object.values(map)) {
      g.labels.sort((a, b) => (a.language || '').localeCompare(b.language || ''))
    }
    return Object.values(map)
  }, [labels])

  const downloadQR = (label) => {
    const link = document.createElement('a')
    link.href = label.qrDataUrl
    link.download = `qr-${label.productCode || label.productSlug}-${label.language}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadRetro = async (label) => {
    setBusy(label.id)
    try { await downloadLabelPDF(label) } catch (e) { console.error(e) }
    setBusy(null)
  }

  const handleDownloadBox = async (label) => {
    setBusy(label.id)
    try { await downloadBoxLabelPDF(label) } catch (e) { console.error(e) }
    setBusy(null)
  }

  const countries = [...new Set(labels.map(l => l.country))].sort()

  const fmtDate = (iso) => {
    const d = new Date(iso)
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Archivio Etichette / ラベルアーカイブ</h1>
          <p style={s.subtitle}>
            {stats.total} etichette · {grouped.length} prodotti
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/')} style={s.btnGhost}>Dashboard</button>
          <button onClick={() => navigate('/admin')} style={s.btnSecondary}>Generatore</button>
        </div>
      </div>

      {/* Filters row */}
      <div style={s.filtersRow}>
        <input
          type="text"
          placeholder="Cerca prodotto... / 製品検索..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={s.searchInput}
        />
        <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={s.filterSelect}>
          <option value="">Tutte le lingue</option>
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{LANG_FLAGS[code]} {label}</option>
          ))}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={s.filterSelect}>
          <option value="">Tutti i paesi</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {grouped.length === 0 ? (
        <div style={s.empty}>
          <p style={{ fontSize: '16px', color: '#888', marginBottom: '16px' }}>Nessuna etichetta in archivio</p>
          <button onClick={() => navigate('/admin')} style={s.btnPrimary}>Vai al Generatore</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e3e8ee', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={s.tableHead}>
            <span>Prodotto / 製品</span>
            <span>Codice</span>
            <span>Tipologia</span>
            <span>Lingue</span>
          </div>

          {/* Product groups */}
          {grouped.map((group, gi) => (
            <div key={gi}>
              {/* Product header row */}
              <div style={{
                padding: '14px 16px', borderBottom: '1px solid #f0f0f0',
                background: gi % 2 === 0 ? '#fff' : '#fafbfc',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 1fr', gap: '12px', alignItems: 'center' }}>
                  {/* Product name */}
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#0a2540' }}>
                    {group.productName}
                  </div>
                  {/* Code */}
                  <code style={{ fontSize: '12px', color: '#555', background: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>
                    {group.productCode}
                  </code>
                  {/* Category */}
                  <span style={{ fontSize: '13px', color: '#596780' }}>{group.category || '—'}</span>
                  {/* Language count */}
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {group.labels.length} {group.labels.length === 1 ? 'lingua' : 'lingue'}
                  </span>
                </div>

                {/* Language sub-rows */}
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {group.labels.map(label => (
                    <div key={label.id} style={{
                      display: 'grid', gridTemplateColumns: '110px 100px 1fr auto',
                      gap: '8px', alignItems: 'center',
                      padding: '6px 10px', background: '#f8f9fb', borderRadius: '6px',
                      border: '1px solid #eef0f3',
                    }}>
                      {/* Language + Country */}
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '12px', fontWeight: 700, color: '#1565c0',
                          background: '#e3f2fd', padding: '2px 6px', borderRadius: '4px',
                        }}>
                          {LANG_FLAGS[label.language] || ''} {LANG_LABELS[label.language] || label.language}
                        </span>
                        <span style={{
                          fontSize: '10px', color: '#2e7d32', background: '#e8f5e9',
                          padding: '1px 5px', borderRadius: '3px', fontWeight: 600,
                        }}>
                          {label.country}
                        </span>
                      </div>

                      {/* Date */}
                      <span style={{ fontSize: '12px', color: '#888' }}>{fmtDate(label.generatedAt)}</span>

                      {/* Download buttons */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleDownloadRetro(label)} disabled={busy === label.id} style={s.dlBtn} title="Retro etichetta PDF">
                          RETRO
                        </button>
                        <button onClick={() => handleDownloadBox(label)} disabled={busy === label.id} style={s.dlBtn} title="Etichetta box PDF">
                          BOX
                        </button>
                        <button onClick={() => downloadQR(label)} style={s.dlBtn} title="QR code PNG">
                          QR
                        </button>
                        <a href={label.labelUrl} target="_blank" rel="noopener noreferrer" style={s.dlBtnLink} title="Pagina e-label">
                          E-LABEL
                        </a>
                        <button onClick={() => navigate(`/admin/product/${label.productSlug}`)} style={s.dlBtnEdit} title="Modifica prodotto">
                          EDIT
                        </button>
                      </div>

                      {/* Printed badge — labels cannot be deleted once generated */}
                      <span style={s.printedBadge} title="Etichetta scaricata — non eliminabile">
                        Stampata
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- Styles ---------- */
const s = {
  container: { maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px',
  },
  title: { fontSize: '22px', fontWeight: 700, margin: 0 },
  subtitle: { fontSize: '13px', color: '#888', margin: '4px 0 0 0' },
  filtersRow: {
    display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap',
  },
  searchInput: {
    flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none',
  },
  filterSelect: {
    padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
    fontSize: '14px', background: '#fff', cursor: 'pointer',
  },
  empty: {
    textAlign: 'center', padding: '60px 20px', background: '#fafafa',
    borderRadius: '12px', border: '1px solid #eee',
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: '1fr 100px 100px 1fr',
    gap: '12px', alignItems: 'center',
    padding: '10px 16px', background: '#f6f8fa', borderBottom: '2px solid #e3e8ee',
    fontSize: '11px', color: '#8898aa', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  dlBtn: {
    padding: '3px 7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
    border: '1px solid #ddd', borderRadius: '4px', background: '#fff', color: '#333',
    letterSpacing: '0.3px',
  },
  dlBtnLink: {
    padding: '3px 7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
    border: '1px solid #635bff', borderRadius: '4px', background: '#fff', color: '#635bff',
    textDecoration: 'none', display: 'inline-block', letterSpacing: '0.3px',
  },
  dlBtnEdit: {
    padding: '3px 7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
    border: '1px solid #f59e0b', borderRadius: '4px', background: '#fffbeb', color: '#b45309',
    letterSpacing: '0.3px',
  },
  btnPrimary: {
    background: '#635bff', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  },
  btnSecondary: {
    background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '8px',
    padding: '8px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: 500,
  },
  btnGhost: {
    background: 'none', color: '#888', border: '1px solid #eee', borderRadius: '8px',
    padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
  },
  printedBadge: {
    fontSize: '9px', fontWeight: 600, color: '#1e7a34', background: '#d4edda',
    padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap',
  },
}

export default LabelArchive
