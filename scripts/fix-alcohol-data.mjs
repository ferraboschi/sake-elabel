#!/usr/bin/env node
/**
 * Census + remediation of the Airtable "Alcohol %" column.
 *
 * The field is a percent field storing DECIMALS (0.15 = 15%). Two historical
 * bugs corrupted it:
 *  - display values written raw (25 stored → Airtable shows 2500%)
 *  - double division by 100 (15% stored as 0.0015 → shows 0.15%)
 *
 * Usage:
 *   AIRTABLE_API_KEY=pat... node scripts/fix-alcohol-data.mjs                # census (dry-run)
 *   AIRTABLE_API_KEY=pat... node scripts/fix-alcohol-data.mjs --apply       # fix unambiguous records
 *   AIRTABLE_API_KEY=pat... node scripts/fix-alcohol-data.mjs --list-spirits # products still typed "Spirit"
 *
 * --apply writes a backup of the old values to scripts/alcohol-backup-<timestamp>.json
 * before patching anything. Records classified "review" are NEVER touched.
 */

import { writeFileSync } from 'node:fs'

const API_KEY = process.env.AIRTABLE_API_KEY
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appwCWGRd0jXOCxMA'
const TABLE_ID = process.env.AIRTABLE_TABLE_ID || 'tblilRsJLHIVJ1xju'
const F_ALCOHOL = 'Alcohol %'
const F_CODE = 'CODE'
const F_NAME = 'Product Name'
const F_TYPE = 'Product Type'

const APPLY = process.argv.includes('--apply')
const LIST_SPIRITS = process.argv.includes('--list-spirits')

if (!API_KEY) {
  console.error('Missing AIRTABLE_API_KEY (personal access token with read+write on the base).')
  process.exit(1)
}

const api = async (path, options = {}) => {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1200))
    return api(path, options)
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`${res.status} ${err.error?.message || res.statusText}`)
  }
  return res.json()
}

const fetchAll = async () => {
  const records = []
  let offset = null
  const fields = [F_ALCOHOL, F_CODE, F_NAME, F_TYPE]
    .map(f => `fields%5B%5D=${encodeURIComponent(f)}`).join('&')
  do {
    const data = await api(`${TABLE_ID}?${fields}${offset ? `&offset=${offset}` : ''}`)
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

/**
 * Classify a stored value. Plausible real-world range: 3%–60% (0.03–0.60).
 *  - legacy_raw:      display value written raw (1 < v ≤ 100) → divide by 100
 *  - double_divided:  display divided twice (0.0004 ≤ v ≤ 0.006) → multiply by 100
 *  - review:          ambiguous — fix by hand (0, 0.6–1, >100, 0.006–0.03 …)
 */
const classify = (v) => {
  if (v === undefined || v === null || v === '') return { status: 'empty' }
  if (typeof v !== 'number' || isNaN(v)) return { status: 'review', reason: 'non numerico' }
  if (v >= 0.03 && v <= 0.60) return { status: 'ok' }
  if (v > 1 && v <= 100) return { status: 'legacy_raw', fix: v / 100 }
  if (v >= 0.0004 && v <= 0.006) return { status: 'double_divided', fix: v * 100 }
  return { status: 'review', reason: 'fuori da ogni fascia riconoscibile' }
}

const fmt = (v) => v === undefined || v === null ? '—' : `${v} (=${(v * 100).toFixed(2)}% in Airtable)`

const main = async () => {
  console.log(`Base ${BASE_ID} / table ${TABLE_ID} — fetching records…`)
  const records = await fetchAll()
  console.log(`${records.length} records fetched.\n`)

  if (LIST_SPIRITS) {
    const spirits = records.filter(r => /\bspirits?\b/i.test(String(r.fields[F_TYPE] || '')))
    console.log(`Products still typed "Spirit" (${spirits.length}) — re-tag them from the portal banner:`)
    for (const r of spirits) {
      console.log(`  ${r.fields[F_CODE] || r.id}  ${r.fields[F_NAME] || ''}  [${r.fields[F_TYPE]}]`)
    }
    return
  }

  const buckets = { ok: [], empty: [], legacy_raw: [], double_divided: [], review: [] }
  for (const r of records) {
    const v = r.fields[F_ALCOHOL]
    const c = classify(v)
    buckets[c.status].push({ record: r, value: v, ...c })
  }

  console.log('CENSUS')
  console.log(`  ok:              ${buckets.ok.length}`)
  console.log(`  empty:           ${buckets.empty.length}`)
  console.log(`  legacy_raw:      ${buckets.legacy_raw.length}  (display scritto grezzo, es. 25 → mostrato 2500%)`)
  console.log(`  double_divided:  ${buckets.double_divided.length}  (diviso due volte, es. 0.0015 → 15% reale)`)
  console.log(`  review:          ${buckets.review.length}  (ambigui — MAI toccati in automatico)\n`)

  const printBucket = (name, list) => {
    if (!list.length) return
    console.log(`${name}:`)
    for (const { record, value, fix, reason } of list) {
      const label = `${record.fields[F_CODE] || record.id}  ${record.fields[F_NAME] || ''}`
      console.log(`  ${label}\n    attuale: ${fmt(value)}${fix !== undefined ? `  →  fix: ${fmt(fix)}` : `  (${reason})`}`)
    }
    console.log('')
  }
  printBucket('LEGACY RAW (fix: /100)', buckets.legacy_raw)
  printBucket('DOUBLE DIVIDED (fix: ×100)', buckets.double_divided)
  printBucket('REVIEW (manuale)', buckets.review)

  const fixable = [...buckets.legacy_raw, ...buckets.double_divided]
  if (!APPLY) {
    console.log(fixable.length
      ? `Dry-run: ${fixable.length} record correggibili. Rilancia con --apply per applicare.`
      : 'Nessun record correggibile automaticamente.')
    return
  }

  if (!fixable.length) { console.log('Niente da applicare.'); return }

  const backupPath = `scripts/alcohol-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(backupPath, JSON.stringify(fixable.map(({ record, value, fix }) => ({
    id: record.id, code: record.fields[F_CODE] || '', name: record.fields[F_NAME] || '',
    oldValue: value, newValue: fix,
  })), null, 2))
  console.log(`Backup dei valori attuali scritto in ${backupPath}`)

  for (let i = 0; i < fixable.length; i += 10) {
    const batch = fixable.slice(i, i + 10)
    await api(TABLE_ID, {
      method: 'PATCH',
      body: JSON.stringify({
        records: batch.map(({ record, fix }) => ({
          id: record.id,
          fields: { [F_ALCOHOL]: fix },
        })),
      }),
    })
    console.log(`Patched ${Math.min(i + 10, fixable.length)}/${fixable.length}`)
    await new Promise(r => setTimeout(r, 250))
  }
  console.log('Bonifica applicata. Rilancia senza --apply per verificare il censimento.')
}

main().catch(err => { console.error(err.message); process.exit(1) })
