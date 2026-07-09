import { describe, it, expect } from 'vitest'
import { alcoholDisplayToDecimal } from './airtable.js'

// The single alcohol sanitizer — the guard against the corruption that produced
// impossible values (2500%) and double-divided micro-values (0.15%) in Airtable.
describe('alcoholDisplayToDecimal — write-side sanitizer', () => {
  it('converts a plausible display value to a decimal exactly once', () => {
    expect(alcoholDisplayToDecimal(15)).toBe(0.15)
    expect(alcoholDisplayToDecimal(15.5)).toBe(0.155)
    expect(alcoholDisplayToDecimal(40)).toBe(0.4)
    expect(alcoholDisplayToDecimal(61)).toBeCloseTo(0.61, 10)
    expect(alcoholDisplayToDecimal(0)).toBe(0)
  })
  it('accepts numeric strings', () => {
    expect(alcoholDisplayToDecimal('15.5')).toBe(0.155)
  })
  it('REJECTS impossible values (returns undefined → field not written)', () => {
    expect(alcoholDisplayToDecimal(2500)).toBeUndefined()
    expect(alcoholDisplayToDecimal(150)).toBeUndefined()
    expect(alcoholDisplayToDecimal(-5)).toBeUndefined()
  })
  it('treats empty / missing / non-numeric as no-op', () => {
    expect(alcoholDisplayToDecimal('')).toBeUndefined()
    expect(alcoholDisplayToDecimal(null)).toBeUndefined()
    expect(alcoholDisplayToDecimal(undefined)).toBeUndefined()
    expect(alcoholDisplayToDecimal('abc')).toBeUndefined()
  })
  it('does not double-convert an already-decimal-looking small value', () => {
    // 0.15 is a valid display value meaning 0.15% — it must NOT be treated as
    // "already decimal"; the sanitizer only ever divides by 100 once.
    expect(alcoholDisplayToDecimal(0.15)).toBe(0.0015)
  })
})
