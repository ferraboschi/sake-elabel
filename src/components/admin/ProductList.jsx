import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Stripe-inspired product list view.
 * Clean table layout with status badges, search, filters.
 */

const Badge = ({ color, bg, children }) => (
  <span style={{
    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
    background: bg, color, fontWeight: 600, whiteSpace: 'nowrap',
    lineHeight: '18px', display: 'inline-block',
  }}>
    {children}
  </span>
)

const ProductList = ({
  products, labelsMap, reprintStatus, selectedLanguage,
  reprintSlugs, setReprintSlugs, generating, onGenerateReprint,
}) => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLabelStatus, setFilterLabelStatus] = useState('')

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort()

  const filtered = products.filter(p => {
    if (!p.name?.trim()) return false
    if (p.status === 'CANCELED') return false
    if (filterCategory && p.category !== filterCategory) return false
    if (filterLabelStatus === 'with-label' && !(labelsMap[p.slug]?.length > 0)) return false
    if (filterLabelStatus === 'without-label' && (labelsMap[p.slug]?.length > 0)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (p.name || '').toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.winery || '').toLowerCase().includes(q)
        || (p.nameJp || '').includes(q)
    }
    return true
  })

  const toggleReprint = (slug) => {
    const next = new Set(reprintSlugs)
    next.has(slug) ? next.delete(slug) : next.add(slug)
    setReprintSlugs(next)
  }

  return (
    <div>
      {/* Filters row */}
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Cerca prodotto... / 製品検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #d8dee4',
              borderRadius: '6px', fontSize: '14px', outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#635bff'}
            onBlur={e => e.target.style.borderColor = '#d8dee4'}
          />
        </div>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{
            padding: '9px 12px', border: '1px solid #d8dee4',
            borderRadius: '6px', fontSize: '13px', color: '#596780',
            background: '#fff', minWidth: '150px',
          }}
        >
          <option value="">Tutte le categorie</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select
          value={filterLabelStatus}
          onChange={e => setFilterLabelStatus(e.target.value)}
          style={{
            padding: '9px 12px', border: '1px solid #d8dee4',
            borderRadius: '6px', fontSize: '13px', color: '#596780',
            background: '#fff', minWidth: '150px',
          }}
        >
          <option value="">Tutti</option>
          <option value="with-label">Con etichetta</option>
          <option value="without-label">Senza etichetta</option>
        </select>
      </div>

      {/* Result count */}
      <div style={{ fontSize: '13px', color: '#8898aa', marginBottom: '12px' }}>
        {filtered.length} prodotti
        {filterCategory ? ` in "${filterCategory}"` : ''}
        {searchQuery ? ` per "${searchQuery}"` : ''}
      </div>

      {/* Product table */}
      <div style={{
        background: '#fff', border: '1px solid #e3e8ee', borderRadius: '8px',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr 100px 60px 60px 70px 60px 80px 120px',
          gap: '8px', padding: '10px 16px',
          background: '#f6f8fa', borderBottom: '1px solid #e3e8ee',
          fontSize: '11px', fontWeight: 600, color: '#8898aa',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          <span></span>
          <span>Prodotto / 製品</span>
          <span>Categoria</span>
          <span style={{ textAlign: 'center' }}>EAN</span>
          <span style={{ textAlign: 'center' }}>EAN Box</span>
          <span style={{ textAlign: 'center' }}>Bottiglia</span>
          <span style={{ textAlign: 'center' }}>Tappo</span>
          <span style={{ textAlign: 'center' }}>Stato</span>
          <span></span>
        </div>

        {/* Product rows */}
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {filtered.map(product => {
            const hasLabel = labelsMap[product.slug]?.length > 0
            const needsReprint = reprintStatus[product.code]?.needsReprint

            // Completeness check
            const missing = []
            if (!product.ingredients?.it && !product.ingredients?.en) missing.push('Ingredienti')
            if (!product.alcoholPct) missing.push('Alcool')
            if (!product.volumeMl) missing.push('Volume')
            if (!product.barcode) missing.push('EAN')
            const isComplete = missing.length === 0

            return (
              <div
                key={product.slug}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 100px 60px 60px 70px 60px 80px 120px',
                  gap: '8px', padding: '12px 16px',
                  borderBottom: '1px solid #f0f3f5',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Checkbox */}
                <div>
                  {hasLabel && (
                    <input
                      type="checkbox"
                      checked={reprintSlugs.has(product.slug)}
                      onChange={() => toggleReprint(product.slug)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#635bff' }}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                </div>

                {/* Product info */}
                <div onClick={() => navigate(`/admin/product/${product.slug}`)} style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px', fontWeight: 500, color: '#0a2540',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {product.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8898aa', marginTop: '2px' }}>
                    {product.code}
                    {product.volumeMl ? ` · ${product.volumeMl}ml` : ''}
                    {product.alcoholPct ? ` · ${product.alcoholPct}%` : ''}
                    {product.winery ? ` · ${product.winery}` : ''}
                  </div>
                  {/* Sales regions */}
                  {product.salesRegion?.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {product.salesRegion.map(code => (
                        <span key={code} style={{
                          fontSize: '9px', padding: '1px 5px', borderRadius: '4px',
                          background: '#eef2ff', color: '#635bff', fontWeight: 600,
                        }}>{code}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Category */}
                <div style={{ fontSize: '12px', color: '#596780' }}>
                  {product.category || '—'}
                </div>

                {/* EAN */}
                <div style={{ textAlign: 'center' }}>
                  {product.barcode
                    ? <Badge color="#1e7a34" bg="#d4edda">✓</Badge>
                    : <Badge color="#856404" bg="#fff3cd">—</Badge>
                  }
                </div>

                {/* EAN Box */}
                <div style={{ textAlign: 'center' }}>
                  {product.barcodeBox
                    ? <Badge color="#1e7a34" bg="#d4edda">✓</Badge>
                    : <Badge color="#adb5bd" bg="#f0f0f0">—</Badge>
                  }
                </div>

                {/* Bottiglia (colore + logo materiale) */}
                <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                  {product.bottleMaterialCode ? (
                    <>
                      {product.bottleColor && (
                        <span style={{
                          display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                          border: '1px solid #ccc',
                          background: product.bottleColor === 'Trasparente' ? '#f0f0f0'
                            : product.bottleColor === 'Verde' ? '#2d7d3a'
                            : product.bottleColor === 'Marrone' ? '#8B4513'
                            : product.bottleColor === 'Nera' ? '#1a1a1a' : '#ddd',
                        }} title={product.bottleColor} />
                      )}
                      <img
                        src={`${import.meta.env.BASE_URL || '/'}icons/${product.bottleMaterialCode.replace(/\s/g, '').toLowerCase()}.png`}
                        alt={product.bottleMaterialCode}
                        title={`${product.bottleColor || ''} ${product.bottleMaterialCode}`}
                        style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    </>
                  ) : (
                    <span style={{ color: '#adb5bd', fontSize: '11px' }}>—</span>
                  )}
                </div>

                {/* Tappo (materiale) */}
                <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {product.capMaterialCode ? (
                    <img
                      src={`${import.meta.env.BASE_URL || '/'}icons/${product.capMaterialCode.replace(/[\s\/]/g, '').toLowerCase()}.png`}
                      alt={product.capMaterialCode}
                      title={`${product.capType || ''} ${product.capMaterialCode}`}
                      style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                      onError={e => { e.target.replaceWith(document.createTextNode(product.capMaterialCode)) }}
                    />
                  ) : (
                    <span style={{ color: '#adb5bd', fontSize: '11px' }}>—</span>
                  )}
                </div>

                {/* Status */}
                <div style={{ textAlign: 'center' }}>
                  {needsReprint ? (
                    <Badge color="#842029" bg="#f8d7da">Ristampa</Badge>
                  ) : isComplete ? (
                    <Badge color="#1e7a34" bg="#d4edda">OK</Badge>
                  ) : (
                    <Badge color="#856404" bg="#fff3cd">{missing.length} campo{missing.length > 1 ? 'i' : ''}</Badge>
                  )}
                </div>

                {/* Action */}
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/admin/product/${product.slug}`) }}
                    style={{
                      padding: '6px 14px', fontSize: '13px', fontWeight: 500,
                      background: '#635bff', color: '#fff', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#4b45d1'}
                    onMouseLeave={e => e.currentTarget.style.background = '#635bff'}
                  >
                    Modifica
                  </button>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', color: '#8898aa' }}>
              Nessun prodotto trovato
            </div>
          )}
        </div>
      </div>

      {/* Batch reprint bar */}
      {reprintSlugs.size > 0 && (
        <div style={{
          position: 'sticky', bottom: '16px', marginTop: '16px',
          padding: '14px 20px', background: '#0a2540', borderRadius: '10px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        }}>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 500 }}>
            {reprintSlugs.size} etichett{reprintSlugs.size === 1 ? 'a' : 'e'} selezionat{reprintSlugs.size === 1 ? 'a' : 'e'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setReprintSlugs(new Set())}
              style={{
                padding: '8px 14px', fontSize: '13px', background: 'rgba(255,255,255,0.15)',
                color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
              }}
            >
              Annulla
            </button>
            <button
              onClick={onGenerateReprint}
              disabled={generating}
              style={{
                padding: '8px 18px', fontSize: '13px', fontWeight: 600,
                background: '#635bff', color: '#fff', border: 'none',
                borderRadius: '6px', cursor: generating ? 'default' : 'pointer',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? 'Generazione...' : `Ristampa ${reprintSlugs.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductList
