/**
 * Changes Page (Cambiamenti)
 * Tracks NOME (name) and TIPOLOGIA (category) changes in product catalog
 * User manually triggers "Sincronizza catalogo" to capture baseline
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchProducts } from '../../services/airtable'
import { useChangeTracking } from '../../hooks/useChangeTracking'
import './changes.css'

const ChangesPage = () => {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [activeTab, setActiveTab] = useState('detected') // detected, history, settings
  const [userLang] = useState(() => localStorage.getItem('lang') === 'jp' ? 'jp' : 'it')

  const {
    changes,
    hasChanges,
    baselineTimestamp,
    baselineInfo,
    isLoading,
    message,
    detectChanges,
    syncCatalog,
    approveChange,
    rejectChange,
    clearTracking,
    getChangeLog
  } = useChangeTracking(products)

  const jp = userLang === 'jp'

  // Load products on mount
  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true)
      try {
        const data = await fetchProducts()
        setProducts(data || [])
      } catch (err) {
        console.error('Failed to load products:', err)
      } finally {
        setIsLoadingProducts(false)
      }
    }
    loadProducts()
  }, [])

  // Auto-detect changes when products load
  useEffect(() => {
    if (products.length > 0 && baselineInfo.exists) {
      detectChanges()
    }
  }, [products, baselineInfo.exists])

  const handleSyncClick = () => {
    const confirmed = window.confirm(
      jp
        ? '現在の状態をベースラインとして保存しますか？'
        : 'Salvare lo stato corrente come baseline?'
    )
    if (confirmed) {
      syncCatalog()
    }
  }

  const handleClearClick = () => {
    const confirmed = window.confirm(
      jp
        ? '追跡データを削除しますか？この操作は元に戻せません。'
        : 'Eliminare i dati di tracciamento? Questa azione non può essere annullata.'
    )
    if (confirmed) {
      clearTracking()
    }
  }

  const formatDate = (isoString) => {
    if (!isoString) return '—'
    const date = new Date(isoString)
    return date.toLocaleDateString(jp ? 'ja-JP' : 'it-IT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="changes-page">
      <div className="changes-header">
        <button className="back-btn" onClick={() => navigate('/portal')}>
          ← {jp ? '戻る' : 'Indietro'}
        </button>
        <h1>{jp ? '変更' : 'Cambiamenti'}</h1>
      </div>

      {/* Status Bar */}
      <div className="changes-status">
        <div className="status-item">
          <span className="label">{jp ? 'ベースライン:' : 'Baseline:'}</span>
          <span className="value">
            {baselineInfo.exists ? formatDate(baselineTimestamp) : jp ? 'なし' : 'Nessuno'}
          </span>
        </div>
        <div className="status-item">
          <span className="label">{jp ? '製品:' : 'Prodotti:'}</span>
          <span className="value">{baselineInfo.productCount || '—'}</span>
        </div>
        <div className="status-item">
          <span className="label">{jp ? '変更:' : 'Cambiamenti:'}</span>
          <span className={`value ${hasChanges ? 'alert' : ''}`}>
            {changes.length}
          </span>
        </div>
      </div>

      {/* Message */}
      {message && <div className="changes-message">{message}</div>}

      {/* Tabs */}
      <div className="changes-tabs">
        <button
          className={`tab ${activeTab === 'detected' ? 'active' : ''}`}
          onClick={() => setActiveTab('detected')}
        >
          {jp ? '検出された変更' : 'Cambiamenti Rilevati'} ({changes.length})
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          {jp ? '履歴' : 'Cronologia'}
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          {jp ? '設定' : 'Impostazioni'}
        </button>
      </div>

      {/* Content */}
      <div className="changes-content">
        {/* Detected Changes Tab */}
        {activeTab === 'detected' && (
          <div className="tab-pane">
            {isLoadingProducts ? (
              <p className="placeholder">{jp ? '読み込み中...' : 'Caricamento...'}</p>
            ) : !baselineInfo.exists ? (
              <div className="empty-state">
                <p className="icon">📋</p>
                <p className="title">
                  {jp ? 'ベースラインがありません' : 'Nessun baseline'}
                </p>
                <p className="description">
                  {jp
                    ? '"同期" ボタンをクリックして、現在のカタログ状態をキャプチャしてください。'
                    : 'Fai clic su "Sincronizza" per acquisire lo stato corrente del catalogo.'}
                </p>
                <button
                  className="btn btn-primary"
                  onClick={handleSyncClick}
                  disabled={isLoading}
                >
                  {isLoading ? '...' : jp ? '同期' : 'Sincronizza'}
                </button>
              </div>
            ) : changes.length === 0 ? (
              <div className="empty-state">
                <p className="icon">✓</p>
                <p className="title">{jp ? '変更なし' : 'Nessun cambiamento'}</p>
                <p className="description">
                  {jp
                    ? 'カタログはベースラインと一致しています。'
                    : 'Il catalogo corrisponde al baseline.'}
                </p>
              </div>
            ) : (
              <div className="changes-list">
                {changes.map(change => (
                  <div key={change.productId} className="change-card">
                    <div className="change-header">
                      <div className="code-name">
                        <span className="code">{change.code}</span>
                        {change.status && (
                          <span className={`status-badge status-${change.status}`}>
                            {change.status === 'approved'
                              ? jp
                                ? '承認'
                                : 'Approvato'
                              : jp
                              ? '却下'
                              : 'Rifiutato'}
                          </span>
                        )}
                      </div>
                    </div>

                    {change.name.changed && (
                      <div className="change-item">
                        <span className="field-label">{jp ? '名前' : 'Nome'}:</span>
                        <div className="change-comparison">
                          <span className="baseline">{change.name.baseline || '(empty)'}</span>
                          <span className="arrow">→</span>
                          <span className="current">{change.name.current || '(empty)'}</span>
                        </div>
                      </div>
                    )}

                    {change.tipologia.changed && (
                      <div className="change-item">
                        <span className="field-label">{jp ? 'カテゴリー' : 'Categoria'}:</span>
                        <div className="change-comparison">
                          <span className="baseline">{change.tipologia.baseline || '(empty)'}</span>
                          <span className="arrow">→</span>
                          <span className="current">{change.tipologia.current || '(empty)'}</span>
                        </div>
                      </div>
                    )}

                    <div className="change-actions">
                      <button
                        className="btn btn-approve"
                        onClick={() => approveChange(change.productId)}
                        disabled={isLoading || change.status === 'approved'}
                      >
                        {jp ? '承認' : 'Approva'}
                      </button>
                      <button
                        className="btn btn-reject"
                        onClick={() => rejectChange(change.productId)}
                        disabled={isLoading || change.status === 'rejected'}
                      >
                        {jp ? '却下' : 'Rifiuta'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="tab-pane">
            <div className="history-section">
              <h3>{jp ? '承認と却下の履歴' : 'Cronologia di Approvazioni e Rifiuti'}</h3>
              {(() => {
                const log = getChangeLog()
                if (log.length === 0) {
                  return <p className="placeholder">{jp ? '履歴がありません' : 'Nessuna cronologia'}</p>
                }
                return (
                  <div className="history-list">
                    {log.map((entry, idx) => (
                      <div key={idx} className="history-item">
                        <span className="product-id">{entry.productId}</span>
                        <span className={`status status-${entry.status}`}>
                          {entry.status === 'approved' ? jp ? '承認' : 'Approvato' : jp ? '却下' : 'Rifiutato'}
                        </span>
                        <span className="timestamp">
                          {formatDate(entry.approvedAt || entry.rejectedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="tab-pane">
            <div className="settings-section">
              <h3>{jp ? 'ベースラインの同期' : 'Sincronizza Baseline'}</h3>
              <p className="description">
                {jp
                  ? 'クリックして現在のカタログ状態をベースラインとして保存します。これにより、変更ログが消去されます。'
                  : 'Fai clic per salvare lo stato corrente del catalogo come baseline. Questo cancellerà il registro delle modifiche.'}
              </p>
              <button
                className="btn btn-primary btn-large"
                onClick={handleSyncClick}
                disabled={isLoading}
              >
                {isLoading ? '...' : jp ? 'カタログを同期' : 'Sincronizza Catalogo'}
              </button>
            </div>

            <div className="settings-section danger">
              <h3>{jp ? 'トラッキングデータの削除' : 'Cancella Dati di Tracciamento'}</h3>
              <p className="description">
                {jp
                  ? 'すべての保存されたベースライン、履歴、および変更ログを削除します。この操作は元に戻せません。'
                  : 'Elimina tutti i baseline, la cronologia e i log delle modifiche salvati. Questa azione non può essere annullata.'}
              </p>
              <button
                className="btn btn-danger btn-large"
                onClick={handleClearClick}
                disabled={isLoading}
              >
                {isLoading ? '...' : jp ? '削除' : 'Elimina'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChangesPage
