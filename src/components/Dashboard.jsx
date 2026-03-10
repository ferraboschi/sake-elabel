import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'

const Dashboard = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="container dashboard-container">
      <div className="dashboard-content">
        <h1 className="dashboard-title">{t('sakeCompanyElabels')}</h1>

        <div className="dashboard-message">
          <p>{t('dashboardMessage')}</p>
        </div>

        <div className="dashboard-qr-section">
          <h2>{t('scanQRCode')}</h2>
          <p className="dashboard-qr-instruction">{t('qrCodeInstruction')}</p>
          <div className="dashboard-qr-placeholder">
            {t('openWithQRScanner')}
          </div>
        </div>

        <div className="dashboard-footer">
          <button
            className="button"
            onClick={() => navigate(isAuthenticated ? '/admin' : '/login')}
            style={{ marginBottom: '16px' }}
          >
            {isAuthenticated ? 'Pannello Amministrazione' : 'Accedi'}
          </button>
          <p className="dashboard-small-text">{t('dashboardFooterText')}</p>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
