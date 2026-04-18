import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchProducts, isAirtableConfigured } from '../../services/airtable'
import { getLabels } from '../../services/labelStore'
import { autoFillIngredients } from '../../services/ingredientTranslator'
import './portal.css'

const VALID_PASSWORDS = ['sake2026', 'fornitore2026', 'sake2026supplier', 'supplier2026']
const SESSION_KEY = 'portal_session'

/**
 * Determine completeness status for a product group.
 * Returns: 'ok' | 'warn' | 'printed' | 'reprint'
 */
function getGroupStatus(items, labels) {
  const first = items[0]
  const hasIngredients = first.ingredients && Object.values(first.ingredients).some(v => v && v.trim())
  const hasNutrition = first.nutrition && (first.nutrition.energy_kj != null || first.nutrition.energy_kcal != null)
  const allHaveEan = items.every(it => it.barcode)
  const isComplete = hasIngredients && hasNutrition && allHaveEan && first.alcoholPct

  // Check if any label was printed for this group
  const printed = labels.some(l =>
    items.some(it => l.productSlug === it.slug || l.productCode === it.code)
  )

  if (!isComplete) return 'warn'
  if (printed) {
    // Check if data changed since print (simplified: check label date vs now)
    return 'printed'
  }
  return 'ok'
}

/**
 * Get missing fields for a product group
 */
function getMissing(items, lang) {
  const first = items[0]
  const missing = []
  const hasIngredients = first.ingredients && Object.values(first.ingredients).some(v => v && v.trim())
  if (!hasIngredients) missing.push(lang === 'ja' ? '原材料' : 'Ingredienti')
  if (!first.nutrition?.energy_kj && !first.nutrition?.energy_kcal) missing.push(lang === 'ja' ? '栄養成分' : 'Nutrizione')
  if (!first.alcoholPct) missing.push(lang === 'ja' ? 'アルコール' : 'Alcol')
  if (items.some(it => !it.barcode)) missing.push('EAN')
  return missing
}

const STATUS_LABELS = {
  ja: { all: 'すべて', ok: '完了', warn: '未完了', printed: '印刷済', reprint: '再印刷' },
  it: { all: 'Tutti', ok: 'Completi', warn: 'Incompleti', printed: 'Stampati', reprint: 'Ristampa' },
}

const STATUS_TEXTS = {
  ja: { ok: '✅ 完了', warn: '⚠ 未完了', printed: '🏷 印刷済', reprint: '🔄 変更あり' },
  it: { ok: '✅ Completo', warn: '⚠ Incompleto', printed: '🏷 Stampato', reprint: '🔄 Modificato' },
}

const SEARCH_PLACEHOLDER = {
  ja: '🔍 商品名・蔵元・種類・コードで検索...',
  it: '🔍 Cerca per nome, produttore, tipo, codice...',
}

/**
 * Check if a product is a beverage (exclude books, merch, etc.)
 */
function isBeverage(p) {
  if (p.alcoholPct > 0) return true
  if (p.volumeMl && p.winery) return true
  const cats = ['junmai', 'junmai ginjo', 'junmai daiginjo', 'daiginjo', 'ginjo', 'honjozo', 'futsushu', 'spirit', 'fruit sake', 'vino']
  if (p.category && cats.includes(p.category.toLowerCase())) return true
  return false
}

/**
 * Group products by name (multi-size grouping)
 */
function groupProducts(products) {
  const map = new Map()
  for (const p of products) {
    const key = p.name || p.code || p._recordId
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(p)
  }
  return Array.from(map.values()).map(items => ({
    key: items[0].name || items[0].code,
    items: items.sort((a, b) => (b.volumeMl || 0) - (a.volumeMl || 0)),
    first: items[0],
  }))
}

export default function PortalDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [lang, setLang] = useState('ja')
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [labels, setLabels] = useState([])

  // Filter/search state synced to URL so navigation back preserves them
  const search = searchParams.get('q') || ''
  const statusFilter = searchParams.get('filter') || 'all'

  const setSearch = (value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value); else next.delete('q')
    next.delete('filter') // search resets filter (they're mutually exclusive)
    setSearchParams(next, { replace: true })
  }

  const setStatusFilter = (value) => {
    const next = new URLSearchParams(searchParams)
    if (value && value !== 'all') next.set('filter', value); else next.delete('filter')
    next.delete('q') // changing filter clears search
    setSearchParams(next, { replace: true })
  }

  // Check session
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) setAuthed(true)
  }, [])

  // Load products
  useEffect(() => {
    if (!authed) return
    loadData()
  }, [authed])

  const loadData = async () => {
    setLoading(true)
    try {
      if (isAirtableConfigured()) {
        const fetched = await fetchProducts()
        if (fetched) setProducts(fetched.filter(p => p.name && p.name.trim() && isBeverage(p)))
      }
      setLabels(getLabels())
    } catch (err) {
      console.error('[Portal] Load error:', err)
    }
    setLoading(false)
  }

  const handleLogin = (e) => {
    e.preventDefault()
    const normalized = password.toLowerCase().replace(/[\uff01-\uff5e]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    ).replace(/\u3000/g, ' ').trim()
    if (VALID_PASSWORDS.includes(normalized)) {
      setAuthed(true)
      sessionStorage.setItem(SESSION_KEY, '1')
    }
  }

  // Group and compute status
  const groups = useMemo(() => {
    const g = groupProducts(products)
    return g.map(group => ({
      ...group,
      status: getGroupStatus(group.items, labels),
      missing: getMissing(group.items, lang),
    }))
  }, [products, labels, lang])

  // Stats
  const stats = useMemo(() => {
    const s = { all: groups.length, ok: 0, warn: 0, printed: 0, reprint: 0 }
    for (const g of groups) s[g.status]++
    return s
  }, [groups])

  // Filtered groups: search is global, statusFilter applies only when no search
  const filteredGroups = useMemo(() => {
    let result = groups

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = groups.filter(g => {
        const fields = [
          g.first.name, g.first.nameJp, g.first.winery, g.first.wineryJp,
          g.first.category, g.first.code, g.first.barcode,
          ...(g.items.map(i => i.code)),
        ].filter(Boolean).map(f => f.toLowerCase())
        return fields.some(f => f.includes(q))
      })
    } else if (statusFilter !== 'all') {
      result = groups.filter(g => g.status === statusFilter)
    }

    return result
  }, [groups, search, statusFilter])

  const t = STATUS_LABELS[lang] || STATUS_LABELS.ja
  const st = STATUS_TEXTS[lang] || STATUS_TEXTS.ja

  // Login screen
  if (!authed) {
    return (
      <div className="portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ textAlign: 'center', maxWidth: 360, padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🍶</div>
          <h1 style={{ fontFamily: 'var(--portal-font)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Sake Company E-Label
          </h1>
          <p style={{ color: 'var(--portal-ink-muted)', fontSize: 14, marginBottom: 24 }}>
            {lang === 'ja' ? 'パスワードを入力してください' : 'Inserisci la password'}
          </p>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={lang === 'ja' ? 'パスワード' : 'Password'}
            className="portal-input"
            style={{ width: '100%', textAlign: 'center', fontSize: 16, padding: '12px 16px', marginBottom: 12 }}
            autoFocus
          />
          <button type="submit" className="portal-btn portal-btn--primary" style={{ width: '100%' }}>
            {lang === 'ja' ? 'ログイン' : 'Accedi'}
          </button>
        </form>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--portal-ink-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍶</div>
          {lang === 'ja' ? '読み込み中...' : 'Caricamento...'}
        </div>
      </div>
    )
  }

  return (
    <div className="portal">
      {/* Top Bar */}
      <div className="portal-topbar">
        <div className="portal-topbar-brand">
          <strong>Sake Company</strong>
          <span>E-Label {lang === 'ja' ? 'マネージャー' : 'Manager'}</span>
        </div>
        <div className="portal-topbar-nav">
          <a href="#" className="active">{lang === 'ja' ? 'ダッシュボード' : 'Dashboard'}</a>
          <Link to="/portal/changes">{lang === 'ja' ? '変更' : 'Cambiamenti'}</Link>
          <Link to="/importers">{lang === 'ja' ? '輸入者' : 'Importatori'}</Link>
          <div className="portal-lang-switch">
            <button className={lang === 'ja' ? 'active' : ''} onClick={() => setLang('ja')}>JP</button>
            <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
          </div>
        </div>
      </div>

      {/* Clickable Status Cards */}
      <div className="portal-stats">
        {['all', 'ok', 'warn', 'printed', 'reprint'].map(key => (
          <div
            key={key}
            className={`portal-stat portal-stat--${key === 'all' ? 'all' : key} ${statusFilter === key && !search ? 'active' : ''}`}
            onClick={() => setStatusFilter(key)}
          >
            <div className="portal-stat-count">{stats[key]}</div>
            <div className="portal-stat-label">{t[key]}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="portal-search-wrap">
        <div className="portal-search">
          <span className="portal-search-icon">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER[lang]}
          />
          {search && (
            <span className="portal-search-count">
              {filteredGroups.length}{lang === 'ja' ? '件' : ' risultati'}
            </span>
          )}
        </div>
        {!search && (
          <div className="portal-search-hints">
            <span>{lang === 'ja' ? '例:' : 'es:'}</span>
            {['daiginjo', 'hakushika', 'vino', 'fruit sake', '白鹿'].map(hint => (
              <button key={hint} className="portal-search-hint" onClick={() => setSearch(hint)}>
                {hint}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product List */}
      <div className="portal-list">
        {search && (
          <div className="portal-list-info">
            {lang === 'ja'
              ? `「${search}」の検索結果 — ${filteredGroups.length}件`
              : `Risultati per "${search}" — ${filteredGroups.length}`
            }
          </div>
        )}

        {filteredGroups.map(group => {
          const statusClass = group.status
          const slug = group.first.slug || group.first.code
          const statusText = st[group.status]
          const missingText = group.missing.length > 0
            ? `${lang === 'ja' ? '⚠ 未入力: ' : '⚠ Manca: '}${group.missing.join(', ')}`
            : statusText

          return (
            <Link
              key={group.key}
              to={`/portal/product/${encodeURIComponent(slug)}`}
              className={`portal-product ${statusClass === 'warn' ? 'portal-product--warn' : ''} ${statusClass === 'reprint' ? 'portal-product--danger' : ''}`}
            >
              <div className={`portal-badge portal-badge--${statusClass}`}>
                {statusClass === 'ok' ? '✓' : statusClass === 'warn' ? '!' : statusClass === 'printed' ? '🏷' : '↻'}
              </div>

              <div>
                <div className="portal-product-name">
                  {highlightMatch(group.first.name, search)}
                </div>
                <div className="portal-product-meta">
                  {highlightMatch(group.first.wineryJp || group.first.winery, search)}
                  {group.first.category && <> · {highlightMatch(group.first.category, search)}</>}
                  {group.first.code && <> · {highlightMatch(group.first.code, search)}</>}
                </div>
              </div>

              <div className="portal-sizes">
                {group.items.filter(i => i.volumeMl).map(i => (
                  <span key={i._recordId} className="portal-size">{i.volumeMl}ml</span>
                ))}
              </div>

              <div className="portal-product-alc">
                {group.first.alcoholPct ? `${group.first.alcoholPct}%` : '—'}
              </div>

              <div className={`portal-product-status portal-product-status--${statusClass}`}>
                {group.missing.length > 0 ? missingText : statusText}
              </div>

              <div className="portal-product-arrow">→</div>
            </Link>
          )
        })}

        {filteredGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--portal-ink-muted)' }}>
            {lang === 'ja' ? '該当する商品がありません' : 'Nessun prodotto trovato'}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Highlight search match in text
 */
function highlightMatch(text, query) {
  if (!text || !query || !query.trim()) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#fff3cd', padding: '0 2px', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}
