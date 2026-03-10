import React from 'react'
import { getMaterialName, getMaterialCollection } from '../data/disposal'

/**
 * Maps material codes to the correct icon file
 * Uses official EU recycling pictogram PNGs from tuttoimballo.it saved in /icons/
 */
function getIconPath(materialCode) {
  if (!materialCode) return null

  const code = materialCode.toUpperCase().replace(/\s+/g, '')

  // Glass codes
  if (code === 'GL70') return '/sake-elabel/icons/gl70.png'
  if (code === 'GL71') return '/sake-elabel/icons/gl71.png'
  if (code === 'GL72') return '/sake-elabel/icons/gl72.png'

  // Aluminum cap (composite aluminum)
  if (code === 'C/ALU90' || code === 'CALU90' || code === 'C/ALU') return '/sake-elabel/icons/calu90.png'
  // Pure aluminum
  if (code === 'ALU' || code === 'ALU41') return '/sake-elabel/icons/alu41.png'

  // Paper / Cardboard
  if (code === 'PAP20' || code === '20') return '/sake-elabel/icons/pap20.png'
  if (code === 'PAP22' || code === '22') return '/sake-elabel/icons/pap22.png'

  // Plastic / PVC
  if (code === 'PVC' || code === 'PVC3' || code === '3') return '/sake-elabel/icons/pvc03.png'

  // Cork
  if (code === 'C/CORK' || code === 'FOR51') return '/sake-elabel/icons/for51.png'

  // Fallback: try to match GL codes with space
  if (code.startsWith('GL')) {
    const num = code.replace('GL', '')
    if (num === '70') return '/sake-elabel/icons/gl70.png'
    if (num === '71') return '/sake-elabel/icons/gl71.png'
    if (num === '72') return '/sake-elabel/icons/gl72.png'
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
