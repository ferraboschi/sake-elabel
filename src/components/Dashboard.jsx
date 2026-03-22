import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { fetchProducts, isAirtableConfigured } from '../services/airtable'
import { getLabels, getLabelStats } from '../services/labelStore'
import { batchCheckReprint } from '../services/printSnapshot'
import { getAllImporters, getCustomImporters, REGION_CODE_LABELS, REGION_CODE_TO_IMPORTER_COUNTRY, defaultImporters } from '../data/importers'
import { useGenerateLabel } from '../hooks/useGenerateLabel'

const Dashboard = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()
  const { generate, generating } = useGenerateLabel()

  // Stats state
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState([])
  const [regeneratingSlug, setRegeneratingSlug] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) return
    loadStats()
  }, [isAuthenticated])

  const loadStats = async () => {
    setLoading(true)
    try {
      // Fetch products from Airtable
      let products = []
      if (isAirtableConfigured()) {
        const fetched = await fetchProducts()
        if (fetched) products = fetched.filter(p => p.name && p.name.trim())
      }

      setAllProducts(products)

      // Check reprint status for all products
      const reprintStatus = await batchCheckReprint(products)

      // Filter products that need reprint
      const reprintProducts = products
        .filter(p => reprintStatus[p.code || p._recordId]?.needsReprint)
        .map(p => {
          const key = p.code || p._recordId
          const printedAt = reprintStatus[key]?.printedAt
          return {
            name: p.name,
            code: p.code,
            volumeMl: p.volumeMl,
            printedAt,
            slug: p.slug,
          }
        })

      // Label archive stats
      const labelStats = getLabelStats()
      const labels = getLabels()

      // Importer stats
      const allImporters = getAllImporters()
      const customImporters = getCustomImporters()
      const regionCodes = Object.keys(REGION_CODE_LABELS)
      const regionsWithImporter = regionCodes.filter(rc => {
        const custom = customImporters.find(i => i.regionCode === rc)
        if (custom) return true
        const countryKey = REGION_CODE_TO_IMPORTER_COUNTRY[rc]
        return countryKey && defaultImporters[countryKey]?.name
      })

      // Product completeness
      const withIngredients = products.filter(p => p.ingredients?.it || p.ingredients?.en).length
      const withNutrition = products.filter(p => p.nutrition?.energy_kcal).length
      const withEan = products.filter(p => p.barcode).length
      const withAlcohol = products.filter(p => p.alcoholPct).length
      const withVolume = products.filter(p => p.volumeMl).length
      const withOrigin = products.filter(p => p.countryOfOrigin).length
      const withEanBox = products.filter(p => p.barcodeBox).length

      // Complete = has ingredients + alcohol + volume + EAN + origin
      const complete = products.filter(p =>
        (p.ingredients?.it || p.ingredients?.en) &&
        p.alcoholPct && p.volumeMl && p.barcode && p.countryOfOrigin
      ).length

      // Categories breakdown
      const categories = {}
      products.forEach(p => {
        const cat = p.category || 'Non classificato'
        categories[cat] = (categories[cat] || 0) + 1
      })

      // Recent labels (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const recentLabels = labels.filter(l => l.generatedAt > weekAgo).length

      setStats({
        products: {
          total: products.length,
          complete,
          withIngredients,
          withNutrition,
          withEan,
          withAlcohol,
          withVolume,
          withOrigin,
          withEanBox,
          categories,
        },
        labels: {
          total: labelStats.total,
          recent: recentLabels,
          byLanguage: labelStats.byLanguage,
          byCountry: labelStats.byCountry,
        },
        importers: {
          total: allImporters.length,
          custom: customImporters.length,
          regionsTotal: regionCodes.length,
          regionsCovered: regionsWithImporter.length,
        },
        reprintProducts,
      })
    } catch (err) {
      console.error('Dashboard stats error:', err)
    } finally {
      setLoading(false)
    }
  }

  // If not logged in, show login prompt
  if (!isAuthenticated) {
    return (
      <div className="container dashboard-container">
        <div className="dashboard-content">
          <img src={`${import.meta.env.BASE_URL}logo-sc.png`} alt="Sake Company" style={{ maxWidth: '220px', marginBottom: '12px' }} />
          <p style={{ color: '#888', fontSize: '15px', marginBottom: '40px' }}>
            Gestione E-Label EU
          </p>

          <div style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px',
            padding: '40px', textAlign: 'center', maxWidth: '400px', margin: '0 auto'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔐</div>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Accedi per continuare</h2>
            <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>
              Effettua il login per accedere al pannello di gestione etichette.
            </p>
            <button className="button button-primary" onClick={() => navigate('/login')}
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}>
              Accedi
            </button>
          </div>

          {/* Supplier portal link for Japanese producers */}
          <div style={{
            marginTop: '32px', padding: '16px 20px', borderRadius: '10px',
            background: '#f5f5f5', border: '1px solid #e0e0e0', textAlign: 'center',
          }}>
            <p style={{ fontSize: '14px', color: '#555', margin: '0 0 8px' }}>
              🍶 蔵元の皆様へ · Per i produttori
            </p>
            <a
              href="/nutrition?t=sake2026supplier"
              style={{ fontSize: '14px', color: '#1565c0', fontWeight: 600, textDecoration: 'none' }}
            >
              栄養成分入力ポータル → Nutritional Data Portal
            </a>
          </div>

          <p style={{ color: '#bbb', fontSize: '12px', marginTop: '24px', textAlign: 'center' }}>
            Conforme Reg. UE 2021/2117 · Nessun tracciamento · Nessuna pubblicità
          </p>
        </div>
      </div>
    )
  }

  // Regenerate a label directly from the dashboard
  const handleRegenerate = async (reprintProduct) => {
    setRegeneratingSlug(reprintProduct.slug)
    try {
      // Find the full product data
      const fullProduct = allProducts.find(p => p.slug === reprintProduct.slug)
      if (!fullProduct) {
        console.error('Product not found:', reprintProduct.slug)
        return
      }

      // Find the existing label in archive to get language, country, importer
      const existingLabels = getLabels()
      const existingLabel = existingLabels.find(l =>
        (l.productSlug === reprintProduct.slug || l.slug === reprintProduct.slug) ||
        (l.productCode === reprintProduct.code && reprintProduct.code)
      )

      const selectedLanguage = existingLabel?.language || 'it'
      const selectedCountry = existingLabel?.country || 'Italia'

      // Reconstruct importer from stored flat fields
      let importer = null
      if (existingLabel?.importerName) {
        importer = { name: existingLabel.importerName, address: existingLabel.importerAddress || '' }
      } else {
        // Fallback: find importer from importers config
        const allImp = getAllImporters()
        const countryImp = allImp.find(i => {
          const impCountry = REGION_CODE_TO_IMPORTER_COUNTRY[Object.keys(REGION_CODE_TO_IMPORTER_COUNTRY).find(
            rc => REGION_CODE_LABELS[rc] === selectedCountry
          )]
          return impCountry && (i.country === impCountry || i.regionCode)
        })
        if (countryImp) importer = { name: countryImp.name, address: countryImp.address || '' }
      }

      // Generate the label (this downloads PDFs + saves snapshot)
      await generate([fullProduct], {
        selectedLanguage,
        selectedCountry,
        importer,
      })

      // Remove from the reprint list in state
      setStats(prev => ({
        ...prev,
        reprintProducts: prev.reprintProducts.filter(p => p.slug !== reprintProduct.slug),
      }))
    } catch (err) {
      console.error('Regeneration failed:', err)
    } finally {
      setRegeneratingSlug(null)
    }
  }

  // Stat pill component
  const StatPill = ({ value, label, color = '#222' }) => (
    <div style={{ textAlign: 'center', minWidth: '60px' }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{label}</div>
    </div>
  )

  // Progress bar
  const ProgressBar = ({ value, max, color = '#4caf50', label }) => {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0
    return (
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '3px' }}>
          <span>{label}</span>
          <span style={{ fontWeight: 600 }}>{value}/{max}</span>
        </div>
        <div style={{ height: '6px', background: '#f0f0f0', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
        </div>
      </div>
    )
  }

  const s = stats // shorthand

  return (
    <div className="container dashboard-container">
      <div className="dashboard-content" style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <img src={`${import.meta.env.BASE_URL}logo-sc.png`} alt="Sake Company" style={{ maxWidth: '160px' }} />
            <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>Gestione E-Label EU</p>
          </div>
          <button className="button button-secondary button-small" onClick={logout}
            style={{ fontSize: '12px', color: '#999' }}>
            Esci
          </button>
        </div>

        {/* Top summary cards row */}
        {s && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px'
          }}>
            <div style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '18px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#222' }}>{s.products.total}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Prodotti</div>
            </div>
            <div style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '18px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: s.products.complete === s.products.total ? '#4caf50' : '#f57c00' }}>
                {s.products.complete}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Completi</div>
            </div>
            <div style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '18px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1565c0' }}>{s.labels.total}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Etichette</div>
            </div>
            <div style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '18px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#222' }}>
                {s.importers.regionsCovered}/{s.importers.regionsTotal}
              </div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Paesi</div>
            </div>
          </div>
        )}

        {/* Etichette da rigenerare section */}
        {s && s.reprintProducts && s.reprintProducts.length > 0 && (
          <div style={{
            background: '#fff', borderLeft: '4px solid #ff6b35', borderRadius: '8px',
            padding: '20px', marginBottom: '24px', border: '1px solid #ffe0d6', borderLeftWidth: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#222' }}>Etichette da rigenerare</div>
            </div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '14px' }}>
              Modifiche avvenute dall'ultima generazione
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {s.reprintProducts.map((product) => (
                <div
                  key={product.code || product.slug}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', background: '#f9f9f9', borderRadius: '6px',
                    borderLeft: '3px solid #ff9500', fontSize: '13px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#222', marginBottom: '2px' }}>
                      {product.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '12px' }}>
                      {product.code && <span>{product.code}</span>}
                      {product.volumeMl && <span> · {product.volumeMl} ml</span>}
                      {product.printedAt && (
                        <span> · Stampa: {new Date(product.printedAt).toLocaleDateString('it-IT')}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRegenerate(product)}
                    disabled={regeneratingSlug === product.slug}
                    style={{
                      padding: '6px 12px',
                      background: regeneratingSlug === product.slug ? '#ccc' : '#ff6b35',
                      color: '#fff',
                      border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                      cursor: regeneratingSlug === product.slug ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap', marginLeft: '12px',
                      transition: 'background 0.2s ease',
                    }}
                    onMouseEnter={e => { if (regeneratingSlug !== product.slug) e.currentTarget.style.background = '#e55a1f' }}
                    onMouseLeave={e => { if (regeneratingSlug !== product.slug) e.currentTarget.style.background = '#ff6b35' }}
                  >
                    {regeneratingSlug === product.slug ? 'Generando...' : 'Rigenera →'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

          {/* Generatore Retro Etichette */}
          <div
            onClick={() => navigate('/admin')}
            style={{
              background: '#fafafa', border: '2px solid #222', borderRadius: '12px', padding: '24px',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                  🏷️ Generatore Retro Etichette
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  Seleziona prodotti, lingua e importatore. Genera QR code e PDF retro etichetta.
                </div>
              </div>
              <div style={{ fontSize: '22px', color: '#bbb' }}>→</div>
            </div>
            {s && (
              <div style={{ marginTop: '14px', borderTop: '1px solid #e8e8e8', paddingTop: '14px' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '13px' }}>
                  <span>🍶 <strong>{s.products.withEan}</strong>/{s.products.total} pronti bottiglia</span>
                  <span>📦 <strong>{s.products.withEanBox}</strong>/{s.products.total} pronti box</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                  <ProgressBar value={s.products.withIngredients} max={s.products.total} label="Ingredienti" color="#4caf50" />
                  <ProgressBar value={s.products.withAlcohol} max={s.products.total} label="Alcool %" color="#2196f3" />
                  <ProgressBar value={s.products.withEan} max={s.products.total} label="EAN Bottiglia" color="#ff9800" />
                  <ProgressBar value={s.products.withEanBox} max={s.products.total} label="EAN Box" color="#795548" />
                  <ProgressBar value={s.products.withNutrition} max={s.products.total} label="Nutrizione" color="#9c27b0" />
                </div>
              </div>
            )}
          </div>

          {/* Archivio Etichette */}
          <div
            onClick={() => navigate('/archive')}
            style={{
              background: '#fafafa', border: '2px solid #222', borderRadius: '12px', padding: '24px',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                  📦 Archivio Etichette
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  Consulta lo storico delle etichette generate, scarica retro etichette e QR.
                </div>
              </div>
              <div style={{ fontSize: '22px', color: '#bbb' }}>→</div>
            </div>
            {s && (
              <div style={{ marginTop: '14px', borderTop: '1px solid #e8e8e8', paddingTop: '14px' }}>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '12px', fontSize: '13px' }}>
                  <span><strong>{s.labels.total}</strong> etichette totali</span>
                  {s.labels.recent > 0 && <span style={{ color: '#4caf50' }}>✦ <strong>{s.labels.recent}</strong> questa settimana</span>}
                </div>
                {Object.keys(s.labels.byLanguage || {}).length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(s.labels.byLanguage).map(([l, c]) => (
                      <span key={l} style={{
                        background: '#e8e8e8', borderRadius: '6px', padding: '2px 8px',
                        fontSize: '12px', fontWeight: 600, color: '#555',
                      }}>
                        {l.toUpperCase()}: {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Importatori */}
          <div
            onClick={() => navigate('/importers')}
            style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
              🌍 Importatori
            </div>
            <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.4, marginBottom: '10px' }}>
              Gestisci importatori per paese.
            </div>
            {s && (
              <div style={{ fontSize: '12px', color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                <span style={{ fontWeight: 600, color: '#222' }}>{s.importers.total}</span> importatori
                {' · '}
                <span style={{
                  fontWeight: 600,
                  color: s.importers.regionsCovered === s.importers.regionsTotal ? '#4caf50' : '#f57c00',
                }}>
                  {s.importers.regionsCovered}/{s.importers.regionsTotal}
                </span> paesi coperti
              </div>
            )}
          </div>

          {/* Nutritional Data */}
          <div
            onClick={() => navigate('/nutrition?t=sake2026supplier')}
            style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
              🍶 栄養成分 Nutritional Data
            </div>
            <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.4, marginBottom: '10px' }}>
              Portale fornitori per i valori nutrizionali.
            </div>
            {s && (
              <div style={{ fontSize: '12px', color: '#888', borderTop: '1px solid #f0f0f0', paddingTop: '8px' }}>
                <span style={{
                  fontWeight: 600,
                  color: s.products.withNutrition === s.products.total ? '#4caf50' : '#f57c00',
                }}>
                  {s.products.withNutrition}/{s.products.total}
                </span> prodotti con dati nutrizionali
              </div>
            )}
          </div>
        </div>

        {/* Product categories breakdown */}
        {s && Object.keys(s.products.categories).length > 0 && (
          <div style={{
            background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px', marginBottom: '24px',
          }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>Prodotti per categoria</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(s.products.categories)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div key={cat} style={{
                    background: '#f5f5f5', borderRadius: '8px', padding: '6px 12px',
                    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{ color: '#555' }}>{cat}</span>
                    <span style={{ fontWeight: 700, color: '#222', background: '#e0e0e0', borderRadius: '4px', padding: '1px 6px', fontSize: '12px' }}>
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: '14px' }}>
            Caricamento dati...
          </div>
        )}

        {/* Footer */}
        <p style={{ color: '#bbb', fontSize: '12px', textAlign: 'center' }}>
          Conforme Reg. UE 2021/2117 · Nessun tracciamento · Nessuna pubblicità
        </p>
      </div>
    </div>
  )
}

export default Dashboard
