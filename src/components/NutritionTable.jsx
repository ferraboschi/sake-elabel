import React from 'react'
import { useTranslation } from 'react-i18next'

const NutritionTable = ({ nutrition }) => {
  const { t } = useTranslation()

  if (!nutrition) return null

  return (
    <div className="nutrition-section">
      <h2>{t('nutritionalValues')}</h2>
      <table className="nutrition-table">
        <thead>
          <tr>
            <th>{t('nutritionalValues')}</th>
            <th>{t('per100ml')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('energy')}</td>
            <td>{nutrition.energy_kj} {t('kj')} / {nutrition.energy_kcal} {t('kcal')}</td>
          </tr>
          <tr>
            <td>{t('fat')}</td>
            <td>{nutrition.fat} {t('g')}</td>
          </tr>
          <tr>
            <td>{t('saturatedFat')}</td>
            <td>{nutrition.saturated_fat} {t('g')}</td>
          </tr>
          <tr>
            <td>{t('carbohydrates')}</td>
            <td>{nutrition.carbs} {t('g')}</td>
          </tr>
          <tr>
            <td>{t('sugars')}</td>
            <td>{nutrition.sugars} {t('g')}</td>
          </tr>
          <tr>
            <td>{t('protein')}</td>
            <td>{nutrition.protein} {t('g')}</td>
          </tr>
          <tr>
            <td>{t('salt')}</td>
            <td>{nutrition.salt} {t('g')}</td>
          </tr>
        </tbody>
      </table>
      <p className="nutrition-reference">
        {t('per100ml')} - {t('nutritionalValues')} {t('per100ml')}
      </p>
    </div>
  )
}

export default NutritionTable
