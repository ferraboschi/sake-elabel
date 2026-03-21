import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { searchLabels, getLabelStats, deleteLabel } from '../services/labelStore'
import { downloadLabelPDF, downloadBoxLabelPDF } from '../services/labelPrinter'

const LANG_LABELS = {
  it: 'Italiano', de: 'Deutsch', fr: 'Français', es: 'Español', ja: '日本語'
}

const LabelArchive = () => {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [labels, setLabels] = useState([])
  const [stats, setStats] = useState({ total: 0, byLanguage: {}, byCountry: {} })
  const [query, setQuery] = useState('')
  const [filterLang, setFilterLang] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [busy, setBusy] = useState(null) // label id being processed

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

  const handleDelete = (id) => {
    if (window.confirm('Eliminare questa etichetta dall\'archivio?')) {
      deleteLabel(id)
      refreshLabels()
    }
  }

  const downloadAllQR = async () => {
    for (const label of labels) {
      downloadQR(label)
      await new Promise(r => setTimeout(r, 300))
    }
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
          <p style={s.subtitle}>{stats.total} etichette generate</p>
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
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} style={s.filterSelect}>
          <option value="">Tutti i paesi</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {labels.length > 0 && (
          <button onClick={downloadAllQR} style={s.btnSecondary}>
            Scarica tutti QR ({labels.length})
          </button>
        )}
      </div>

      {/* Empty state */}
      {labels.length === 0 ? (
        <div style={s.empty}>
          <p style={{ fontSize: '16px', color: '#888', marginBottom: '16px' }}>Nessuna etichetta in archivio</p>
          <button onClick={() => navigate('/admin')} style={s.btnPrimary}>Vai al Generatore</button>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div style={s.tableHead}>
            <span style={{ ...s.colProd, fontWeight: 600 }}>Prodotto / 製品</span>
            <span style={{ ...s.colCode, fontWeight: 600 }}>Codice</span>
            <span style={{ ...s.colType, fontWeight: 600 }}>Tipologia</span>
            <span style={{ ...s.colDate, fontWeight: 600 }}>Generata</span>
            <span style={{ ...s.colActions, fontWeight: 600, textAlign: 'center' }}>Download</span>
            <span style={{ ...s.colOps, fontWeight: 600, textAlign: 'center' }}>Azioni</span>
          </div>

          {/* Rows */}
          {labels.map(label => (
            <div key={label.id} style={s.row}>
              {/* Product name + lang/country badges */}
              <div style={s.colProd}>
                <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '1.3' }}>{label.productName}</div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                  <span style={s.badgeLang}>{LANG_LABELS[label.language] || label.language}</span>
                  <span style={s.badgeCountry}>{label.country}</span>
                </div>
              </div>

              {/* Code */}
              <div style={s.colCode}>
                <code style={{ fontSize: '12px', color: '#555', background: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>
                  {label.productCode}
                </code>
              </div>

              {/* Category */}
              <div style={s.colType}>
                <span style={{ fontSize: '13px', color: '#555' }}>{label.category || '—'}</span>
              </div>

              {/* Date */}
              <div style={s.colDate}>
                <span style={{ fontSize: '13px', color: '#888' }}>{fmtDate(label.generatedAt)}</span>
              </div>

              {/* Download buttons */}
              <div style={s.colActions}>
                <button
                  onClick={() => handleDownloadRetro(label)}
                  disabled={busy === label.id}
                  style={s.dlBtn}
                  title="Scarica retro etichetta PDF"
                >
                  RETRO
                </button>
                <button
                  onClick={() => handleDownloadBox(label)}
                  disabled={busy === label.id}
                  style={s.dlBtn}
                  title="Scarica etichetta box PDF"
                >
                  BOX
                </button>
                <button
                  onClick={() => downloadQR(label)}
                  style={s.dlBtn}
                  title="Scarica QR code PNG"
                >
                  QR
                </button>
                <a
                  href={label.labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.dlBtnLink}
                  title="Apri pagina e-label"
                >
                  E-LABEL
                </a>
              </div>

              {/* Ops: delete / regenerate */}
              <div style={s.colOps}>
                <button
                  onClick={() => handleDelete(label.id)}
                  style={s.btnDanger}
                  title="Elimina etichetta"
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </>
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
    gridTemplateColumns: '1fr 100px 100px 100px 220px 70px',
    gap: '12px', alignItems: 'center',
    padding: '10px 16px', background: '#f8f9fa', borderRadius: '8px 8px 0 0',
    borderBottom: '2px solid #e9ecef', fontSize: '12px', color: '#666',
    textTransform: 'uppercase', letterSpacing: '0.3px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 100px 100px 100px 220px 70px',
    gap: '12px', alignItems: 'center',
    padding: '14px 16px', borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.15s',
  },
  colProd: { minWidth: 0 },
  colCode: {},
  colType: {},
  colDate: {},
  colActions: { display: 'flex', gap: '4px', justifyContent: 'center' },
  colOps: { display: 'flex', gap: '4px', justifyContent: 'center' },
  badgeLang: {
    display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 600, background: '#e3f2fd', color: '#1565c0',
  },
  badgeCountry: {
    display: 'inline-block', padding: '1px 6px', borderRadius: '4px',
    fontSize: '10px', fontWeight: 600, background: '#e8f5e9', color: '#2e7d32',
  },
  dlBtn: {
    padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
    border: '1px solid #ddd', borderRadius: '5px', background: '#fff', color: '#333',
    letterSpacing: '0.3px',
  },
  dlBtnLink: {
    padding: '4px 8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
    border: '1px solid #635bff', borderRadius: '5px', background: '#fff', color: '#635bff',
    textDecoration: 'none', display: 'inline-block', letterSpacing: '0.3px',
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
  btnDanger: {
    background: 'none', color: '#d32f2f', border: '1px solid #ffcdd2', borderRadius: '5px',
    padding: '4px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 500,
  },
}

export default LabelArchive
