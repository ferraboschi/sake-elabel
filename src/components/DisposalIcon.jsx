import React from 'react'
import { getMaterialName, getMaterialCollection } from '../data/disposal'

const DisposalIcon = ({ materialCode, materialType, lang = 'it' }) => {
  const materialName = getMaterialName(materialType, lang)
  const collectionName = getMaterialCollection(materialType, lang)

  const getMobius = () => {
    return (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>{`
            .mobius-path { fill: none; stroke: #000; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .mobius-number { font-size: 16px; font-weight: 700; fill: #000; text-anchor: middle; dominant-baseline: middle; font-family: 'Courier New', monospace; }
          `}</style>
        </defs>
        <path
          className="mobius-path"
          d="M 50,20 Q 70,30 70,50 Q 70,70 50,80 Q 30,70 30,50 Q 30,30 50,20"
        />
        <circle cx="50" cy="50" r="3" fill="#000" />
        <text className="mobius-number" x="50" y="50">{materialCode}</text>
      </svg>
    )
  }

  return (
    <div className="disposal-item">
      <div className="disposal-icon">
        {getMobius()}
      </div>
      <div className="disposal-text">{materialName}</div>
      <div className="disposal-material-type">{collectionName}</div>
    </div>
  )
}

export default DisposalIcon
