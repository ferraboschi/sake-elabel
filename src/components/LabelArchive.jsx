import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { searchLabels, getLabelStats, deleteLabel } from '../services/labelStore'

const LANG_LABELS = {
  it: 'Italiano', de: 'Deutsch', fr: 'Français', es: 'Español', ja: '日本語'
}

const LabelArchive = () => {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const [labels, setLabels] = useState([])
  const [stats, setStats] = useState({ total: 0, byLanguage: {}, byCountry: {} })
  const [query, setQuery] = useState('')
  const [filterLang, setFilterLang] = useState('')
  const [filterCountry, setFilterCountry] = useState('')

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

  const downloadAllVisible = async () => {
    for (const label of labels) {
      downloadQR(label)
      await new Promise(r => setTimeout(r, 300))
    }
  }

  const handleDelete = (id) => {
    if (window.confirm('Eliminare questa etichetta dall\'archivio?')) {
      deleteLabel(id)
      refreshLabels()
    }
  }

  const countries = [...new Set(labels.map(l => l.country))].sort()

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Archivio Etichette</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>{user?.name}</span>
          <button className="button button-secondary button-small" onClick={() => navigate('/')}>Home</button>
          <button className="button button-secondary button-small" onClick={() => navigate('/admin')}>Admin</button>
          <button className="button button-secondary button-small" onClick={logout}>Esci</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="archive-stats">
        <div className="stat-item">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Totale etichette</div>
        </div>
        {Object.entries(stats.byLanguage).map(([lang, count]) => (
          <div key={lang} className="stat-item">
            <div className="stat-value">{count}</div>
            <div className="stat-label">{LANG_LABELS[lang] || lang}</div>
          </div>
        ))}
      </div>

      {/* Search & filters */}
      <div className="archive-filters">
        <input
          type="text"
          placeholder="Cerca per nome, codice, cantina..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="archive-search-input"
        />
        <select value={filterLang} onChange={e => setFilterLang(e.target.value)} className="archive-filter-select">
          <option value="">Tutte le lingue</option>
          {Object.entries(LANG_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)} className="archive-filter-select">
          <option value="">Tutti i paesi</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Actions */}
      {labels.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>{labels.length} etichette trovate</span>
          <button className="button button-small" onClick={downloadAllVisible}>
            Scarica tutti i QR ({labels.length})
          </button>
        </div>
      )}

      {/* Labels grid */}
      {labels.length === 0 ? (
        <div className="archive-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h3>Nessuna etichetta in archivio</h3>
          <p>Le etichette generate verranno salvate qui per il richiamo futuro.</p>
          <button className="button" onClick={() => navigate('/admin')}>Vai al Generatore</button>
        </div>
      ) : (
        <div className="archive-grid">
          {labels.map(label => (
            <div key={label.id} className="archive-card">
              <div className="archive-card-header">
                <div>
                  <h3 className="archive-card-title">{label.productName}</h3>
                  <span className="archive-card-code">{label.productCode}</span>
                </div>
                <div className="archive-card-badges">
                  <span className="badge badge-lang">{LANG_LABELS[label.language] || label.language}</span>
                  <span className="badge badge-country">{label.country}</span>
                </div>
              </div>

              <div className="archive-card-body">
                <img src={label.qrDataUrl} alt={`QR ${label.productName}`} className="archive-qr" />
                <div className="archive-card-details">
                  <p><strong>Cantina:</strong> {label.winery}</p>
                  <p><strong>Importatore:</strong> {label.importerName}</p>
                  <p><strong>Volume:</strong> {label.volumeMl}ml — {label.alcoholPct}%</p>
                  <p className="archive-date">
                    Generata il {new Date(label.generatedAt).toLocaleDateString('it-IT', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="archive-card-url">
                <code>{label.labelUrl.replace('https://', '')}</code>
              </div>

              <div className="archive-card-actions">
                <button className="button button-small" onClick={() => downloadQR(label)}>Scarica QR</button>
                <a href={label.labelUrl} target="_blank" rel="noopener noreferrer" className="button button-small button-secondary">
                  Apri E-Label
                </a>
                <button className="button button-small" onClick={() => handleDelete(label.id)}
                  style={{ background: 'none', color: '#c62828', border: '1px solid #ffcdd2', marginLeft: 'auto' }}>
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LabelArchive
