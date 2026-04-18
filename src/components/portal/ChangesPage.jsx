/**
 * Changes Page (Cambiamenti)
 * Displays products modified by the user (NOME, CATEGORIA, FINITURE changes)
 * Data is recorded in localStorage when products are saved
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProductChanges, clearProductChanges } from '../../services/productChangeTracker'
import './changes.css'

const ChangesPage = () => {
  const navigate = useNavigate()
  const [changes, setChanges] = useState({})
  const [userLang] = useState(() => localStorage.getItem('lang') === 'jp' ? 'jp' : 'it')

  // Load changes from localStorage on mount
  useEffect(() => {
    const allChanges = getProductChanges()
    setChanges(allChanges)
  }, [])

  const handleClearChanges = () => {
    const confirmed = window.confirm(
      userLang === 'jp'
        ? '記録されたすべての変更をクリアしますか?'
        : 'Cancellare tutti i cambiamenti registrati?'
    )
    if (confirmed) {
      clearProductChanges()
      setChanges({})
    }
  }

  const changesList = Object.values(changes).sort((a, b) =>
    new Date(b.changedAt) - new Date(a.changedAt)
  )

  const jp = userLang === 'jp'

  return (
    <div className="portal">
      {/* Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--portal-border)' }}>
        <button
          className="back-btn"
          onClick={() => navigate('/portal')}
          style={{ marginBottom: '12px' }}
        >
          ← {jp ? '戻る' : 'Indietro'}
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0' }}>
          {jp ? '変更' : 'Cambiamenti'}
        </h1>
      </div>

      {/* Content */}
      <div style={{ padding: '24px' }}>
        {changesList.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'var(--portal-ink-muted)'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>
              {jp ? '変更がありません' : 'Nessun cambiamento'}
            </div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              {jp ? '商品を編集して保存すると、ここに表示されます。' : 'I cambiamenti appariranno qui quando modificherai i prodotti.'}
            </div>
          </div>
        ) : (
          <div>
            {/* Summary */}
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--portal-bg-secondary)',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '14px',
              color: 'var(--portal-ink)'
            }}>
              {jp ? `${changesList.length}件の製品が変更されました` : `${changesList.length} prodotto/i modificato/i`}
            </div>

            {/* Changes List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {changesList.map(change => (
                <div
                  key={change.code}
                  style={{
                    border: '1px solid var(--portal-border)',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: 'var(--portal-bg)'
                  }}
                >
                  {/* Product Header */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--portal-ink)' }}>
                      {change.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--portal-ink-muted)', marginTop: '4px' }}>
                      {change.code}
                    </div>
                  </div>

                  {/* Change Details */}
                  <div style={{ fontSize: '13px', color: 'var(--portal-ink)', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong>{jp ? '名前' : 'Nome'}</strong>: {change.name}
                    </div>
                    {change.category && (
                      <div style={{ marginBottom: '8px' }}>
                        <strong>{jp ? 'カテゴリー' : 'Categoria'}</strong>: {change.category}
                      </div>
                    )}
                    {change.finishes && change.finishes.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <strong>{jp ? '仕上げ' : 'Finiture'}</strong>: {change.finishes.join(', ')}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--portal-ink-muted)',
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--portal-border)'
                  }}>
                    {new Date(change.changedAt).toLocaleString(
                      jp ? 'ja-JP' : 'it-IT',
                      { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Clear Button */}
            <div style={{ marginTop: '24px' }}>
              <button
                onClick={handleClearChanges}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--portal-bg-danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                {jp ? 'すべてクリア' : 'Cancella tutto'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChangesPage
