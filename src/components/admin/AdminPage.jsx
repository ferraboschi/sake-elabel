import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from 'i18next'
import { useAuth } from '../../contexts/AuthContext'
import { isAirtableConfigured } from '../../services/airtable'
import { getImportersForRegion, REGION_CODE_LABELS } from '../../data/importers'
import { LANG_OPTIONS } from '../../config/constants'
import { useProducts } from '../../hooks/useProducts'
import { useGenerateLabel } from '../../hooks/useGenerateLabel'
import AdminLayout from './AdminLayout'
import TopBar from './TopBar'
import ProductList from './ProductList'
import ProductEditor from './ProductEditor'

/**
 * Main admin page component.
 * Routes:
 *   /admin → product list
 *   /admin/product/:slug → single product editor
 */
// Non-blocking toast notification
const Toast = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#0a2540', color: '#fff', padding: '14px 24px',
      borderRadius: '10px', fontSize: '14px', fontWeight: 500,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: '10px',
      animation: 'fadeIn 0.3s ease',
    }}>
      <span style={{ fontSize: '18px' }}>✓</span>
      {message}
    </div>
  )
}

const AdminPage = () => {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user } = useAuth()
  const products = useProducts()
  const labelGen = useGenerateLabel()
  const [toast, setToast] = useState(null)

  // Shared selectors state
  const [selectedLanguage, setSelectedLanguage] = useState('it')
  const [selectedRegion, setSelectedRegion] = useState('ITA')
  const [selectedImporterId, setSelectedImporterId] = useState('default-it')
  const [importerVersion, setImporterVersion] = useState(0)

  // Batch reprint
  const [reprintSlugs, setReprintSlugs] = useState(new Set())

  // Force Italian UI in admin
  useEffect(() => {
    if (i18n.language !== 'it') i18n.changeLanguage('it')
  }, [])

  // When region changes, auto-select language + first importer
  useEffect(() => {
    const regionInfo = REGION_CODE_LABELS[selectedRegion]
    if (regionInfo?.lang && LANG_OPTIONS.some(l => l.code === regionInfo.lang)) {
      setSelectedLanguage(regionInfo.lang)
    }
    const importers = getImportersForRegion(selectedRegion, { onlyComplete: true })
    if (importers.length > 0) {
      setSelectedImporterId(importers[0].id)
    } else {
      setSelectedImporterId('')
    }
  }, [selectedRegion])

  // When entering product editor, auto-select matching region
  useEffect(() => {
    if (slug) {
      const product = products.allProducts.find(p => p.slug === slug)
      if (product?.salesRegion?.length > 0 && !product.salesRegion.includes(selectedRegion)) {
        setSelectedRegion(product.salesRegion[0])
      }
    }
  }, [slug, products.allProducts])

  // Loading
  if (products.loading) {
    return (
      <AdminLayout title="Caricamento..." subtitle={isAirtableConfigured() ? 'Connessione ad Airtable...' : 'Caricamento dati locali...'}>
        <div style={{ textAlign: 'center', padding: '60px', color: '#8898aa' }}>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
          Caricamento prodotti...
        </div>
      </AdminLayout>
    )
  }

  // Single product view
  if (slug) {
    const product = products.allProducts.find(p => p.slug === slug)

    const handleGenerate = async (prods, opts) => {
      const labels = await labelGen.generate(prods, opts)
      if (labels.length > 0) {
        setToast(`Generazione completata! ${labels.length} etichett${labels.length === 1 ? 'a' : 'e'} scaricat${labels.length === 1 ? 'a' : 'e'}.`)
      }
    }

    return (
      <AdminLayout
        title={product?.name || 'Prodotto'}
        subtitle={product ? `${product.code} · Modifica e genera etichetta` : 'Non trovato'}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
              background: products.dataSource === 'airtable' ? '#d4edda' : '#fff3cd',
              color: products.dataSource === 'airtable' ? '#1e7a34' : '#856404',
            }}>
              {products.dataSource === 'airtable' ? '☁ Airtable' : '📁 Locale'}
            </div>
          </div>
        }
      >
        <ProductEditor
          product={product}
          selectedLanguage={selectedLanguage}
          setSelectedLanguage={setSelectedLanguage}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          selectedImporterId={selectedImporterId}
          setSelectedImporterId={setSelectedImporterId}
          importerVersion={importerVersion}
          onGenerate={handleGenerate}
          generating={labelGen.generating}
          allProducts={products.allProducts}
          setAllProducts={products.setAllProducts}
        />
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </AdminLayout>
    )
  }

  // Product list view
  const handleGenerateReprint = async () => {
    if (reprintSlugs.size === 0) return
    const selectedProducts = products.allProducts.filter(p => reprintSlugs.has(p.slug))
    const importers = getImportersForRegion(selectedRegion, { onlyComplete: true })
    const importer = importers.find(i => i.id === selectedImporterId) || importers[0] || null
    const labels = await labelGen.generate(selectedProducts, {
      selectedLanguage,
      selectedCountry: REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion,
      importer,
      reviewEdits: {},
    })
    if (labels.length > 0) {
      setToast(`Ristampa completata! ${labels.length} etichette scaricate.`)
      setReprintSlugs(new Set())
    }
  }

  return (
    <AdminLayout
      title="Generatore Retro Etichette"
      subtitle={`${products.allProducts.filter(p => p.name?.trim()).length} prodotti · ラベル管理`}
      actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{
            padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
            background: products.dataSource === 'airtable' ? '#d4edda' : '#fff3cd',
            color: products.dataSource === 'airtable' ? '#1e7a34' : '#856404',
          }}>
            {products.dataSource === 'airtable' ? `☁ Airtable · ${products.allProducts.length}` : '📁 Locale'}
          </div>
          <button
            onClick={products.handleRefresh}
            disabled={products.refreshing}
            style={{
              padding: '6px 12px', fontSize: '12px', fontWeight: 500,
              background: '#fff', color: '#596780', border: '1px solid #d8dee4',
              borderRadius: '6px', cursor: products.refreshing ? 'default' : 'pointer',
            }}
          >
            {products.refreshing ? '⏳ Aggiornamento...' : '↻ Aggiorna'}
          </button>
        </div>
      }
    >
      {/* Top bar */}
      <TopBar
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
        selectedRegion={selectedRegion}
        setSelectedRegion={setSelectedRegion}
        selectedImporterId={selectedImporterId}
        setSelectedImporterId={setSelectedImporterId}
        importerVersion={importerVersion}
      />

      {/* Product list */}
      <ProductList
        products={products.allProducts}
        labelsMap={products.labelsMap}
        reprintStatus={products.reprintStatus}
        selectedLanguage={selectedLanguage}
        reprintSlugs={reprintSlugs}
        setReprintSlugs={setReprintSlugs}
        generating={labelGen.generating}
        onGenerateReprint={handleGenerateReprint}
      />
      {/* Toast notification */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </AdminLayout>
  )
}

export default AdminPage
