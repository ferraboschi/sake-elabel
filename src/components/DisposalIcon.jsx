import React from 'react'
import { getMaterialName, getMaterialCollection } from '../data/disposal'

/**
 * Maps material codes to the correct SVG icon file
 * Uses official EU recycling pictogram SVGs from /icons/
 */
function getIconPath(materialCode) {
  if (!materialCode) return null

  const code = materialCode.toUpperCase().replace(/\s+/g, '')

  // Glass codes
  if (code === 'GL70') return '/sake-elabel/icons/gl70.svg'
  if (code === 'GL71') return '/sake-elabel/icons/gl71.svg'
  if (code === 'GL72') return '/sake-elabel/icons/gl72.svg'

  // Aluminum
  if (code === 'C/ALU90' || code === 'CALU90' || code === 'C/ALU') return '/sake-elabel/icons/calu90.svg'
  if (code === 'ALU' || code === 'ALU41') return '/sake-elabel/icons/alu.svg'

  // Paper
  if (code === 'PAP20' || code === '20') return '/sake-elabel/icons/pap20.svg'
  if (code === 'PAP22' || code === '22') return '/sake-elabel/icons/pap22.svg'

  // Plastic / PVC
  if (code === 'PVC' || code === 'PVC3' || code === '3') return '/sake-elabel/icons/pvc.svg'

  // Fallback: try to match GL codes with space
  if (code.startsWith('GL')) {
    const num = code.replace('GL', '')
    if (num === '70') return '/sake-elabel/icons/gl70.svg'
    if (num === '71') return '/sake-elabel/icons/gl71.svg'
    if (num === '72') return '/sake-elabel/icons/gl72.svg'
  }

  return null
}

const DisposalIcon = ({ materialCode, materialType, lang = 'it' }) => {
  const materialName = getMaterialName(materialType, lang)
  const collectionName = getMaterialCollection(materialType, lang)
  const iconPath = getIconPath(materialCode)

  return (
    <div className="disposal-item">
      <div className="disposal-icon">
        {iconPath ? (
          <img
            src={iconPath}
            alt={`${materialCode} - ${materialName}`}
            className="disposal-icon-img"
          />
        ) : (
          <div className="disposal-icon-fallback">
            <span>{materialCode}</span>
          </div>
        )}
      </div>
      <div className="disposal-text">{materialName}</div>
      <div className="disposal-material-type">{collectionName}</div>
    </div>
  )
}

export default DisposalIcon
