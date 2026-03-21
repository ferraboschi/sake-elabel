import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Stripe-inspired admin layout with sidebar navigation.
 * Clean, minimal, professional.
 */
const NAV_ITEMS = [
  { path: '/admin', label: 'Prodotti', labelJa: '製品一覧', icon: '🏷️' },
  { path: '/archive', label: 'Archivio', labelJa: 'アーカイブ', icon: '📦' },
  { path: '/importers', label: 'Importatori', labelJa: '輸入業者', icon: '🌍' },
  { path: '/nutrition', label: 'Nutrizione', labelJa: '栄養成分', icon: '🍶' },
]

const AdminLayout = ({ children, title, subtitle, actions }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', background: '#f6f8fa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', background: '#fff', borderRight: '1px solid #e3e8ee',
        padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #e3e8ee' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo-sc.png`}
            alt="Sake Company"
            style={{ maxWidth: '140px', cursor: 'pointer' }}
            onClick={() => navigate('/')}
          />
          <div style={{ fontSize: '11px', color: '#8898aa', marginTop: '4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            E-Label Manager
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path === '/admin' && location.pathname.startsWith('/admin'))
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  width: '100%', padding: '10px 20px', border: 'none',
                  background: isActive ? '#f0f5ff' : 'transparent',
                  borderRight: isActive ? '3px solid #635bff' : '3px solid transparent',
                  cursor: 'pointer', fontSize: '14px', textAlign: 'left',
                  color: isActive ? '#0a2540' : '#596780',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.1s ease',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f6f8fa' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #e3e8ee' }}>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#8898aa',
              fontSize: '13px', cursor: 'pointer', padding: '4px 0',
            }}
          >
            Esci ↗
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Top header bar */}
        <header style={{
          background: '#fff', borderBottom: '1px solid #e3e8ee',
          padding: '16px 32px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              fontSize: '20px', fontWeight: 700, color: '#0a2540',
              margin: 0, letterSpacing: '-0.3px',
            }}>
              {title}
            </h1>
            {subtitle && (
              <p style={{ fontSize: '13px', color: '#596780', margin: '2px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{actions}</div>}
        </header>

        {/* Page content */}
        <div style={{ padding: '24px 32px' }}>
          {children}
        </div>
      </main>
    </div>
  )
}

export default AdminLayout
