import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

const Dashboard = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()

  // If not logged in, show login prompt
  if (!isAuthenticated) {
    return (
      <div className="container dashboard-container">
        <div className="dashboard-content">
          <h1 className="dashboard-title" style={{ fontSize: '28px', marginBottom: '8px' }}>
            Sake Company
          </h1>
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

          <p style={{ color: '#bbb', fontSize: '12px', marginTop: '40px', textAlign: 'center' }}>
            Conforme Reg. UE 2021/2117 · Nessun tracciamento · Nessuna pubblicità
          </p>
        </div>
      </div>
    )
  }

  // Logged in — show dashboard with shortcuts
  const shortcuts = [
    {
      icon: '🏷️',
      title: 'Genera Etichette',
      desc: 'Seleziona prodotti, lingua e importatore. Genera QR code e PDF retro etichetta.',
      action: () => navigate('/admin'),
      primary: true,
    },
    {
      icon: '📦',
      title: 'Archivio Etichette',
      desc: 'Consulta lo storico delle etichette generate, scarica QR e PDF.',
      action: () => navigate('/archive'),
    },
    {
      icon: '🔗',
      title: 'Anteprima E-Label',
      desc: 'Vedi come appare la pagina web scansionando il QR code di un prodotto.',
      action: () => navigate('/label/konishi-hiyashibori-gold-s093-1800'),
    },
  ]

  return (
    <div className="container dashboard-container">
      <div className="dashboard-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '26px', margin: 0, fontWeight: 700 }}>Sake Company</h1>
            <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>Gestione E-Label EU</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#888' }}>{user?.name || user?.username}</span>
            <button className="button button-secondary button-small" onClick={logout}
              style={{ fontSize: '12px' }}>
              Esci
            </button>
          </div>
        </div>

        {/* Shortcuts grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px', marginBottom: '40px'
        }}>
          {shortcuts.map((s, i) => (
            <button
              key={i}
              onClick={s.action}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '24px', borderRadius: '12px', cursor: 'pointer',
                border: s.primary ? '2px solid #222' : '1px solid #e0e0e0',
                background: s.primary ? '#fafafa' : '#fff',
                textAlign: 'left', transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{s.icon}</div>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>{s.title}</div>
              <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.4' }}>{s.desc}</div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <p style={{ color: '#bbb', fontSize: '12px', textAlign: 'center' }}>
          Conforme Reg. UE 2021/2117 · Nessun tracciamento · Nessuna pubblicità
        </p>
      </div>
    </div>
  )
}

export default Dashboard
