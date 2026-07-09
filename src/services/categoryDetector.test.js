import { describe, it, expect } from 'vitest'
import { detectDetailedCategory, getDefaultLegalDescription } from './categoryDetector.js'

describe('getDefaultLegalDescription — shochu family', () => {
  it('Honkaku / plain Shochu → cereal distillate', () => {
    expect(getDefaultLegalDescription('Shochu')).toBe('Distillato giapponese di cereali')
    expect(getDefaultLegalDescription('Honkaku Shochu')).toBe('Distillato giapponese di cereali')
  })
  it('Kokuto Shochu → rice + cane sugar (no "Amami")', () => {
    expect(getDefaultLegalDescription('Kokuto Shochu')).toBe('Distillato giapponese di riso e zucchero di canna')
  })
  it('Awamori → cereals of Okinawa', () => {
    expect(getDefaultLegalDescription('Awamori')).toBe('Distillato di cereali di Okinawa')
  })
  it('translates to the requested language', () => {
    expect(getDefaultLegalDescription('Kokuto Shochu', 'ja')).toBe('黒糖焼酎')
    expect(getDefaultLegalDescription('Awamori', 'fr')).toBe("Distillat de céréales d'Okinawa")
  })
})

describe('getDefaultLegalDescription — well-known spirits carry NO line', () => {
  for (const t of ['Rum', 'Gin', 'Vodka', 'Whisky', 'Japanese Whisky', 'Japanese craft gin', 'Japanese Rum']) {
    it(`${t} → empty`, () => {
      expect(getDefaultLegalDescription(t)).toBe('')
    })
  }
})

describe('getDefaultLegalDescription — sake never becomes a spirit', () => {
  it('sake types keep the sake wording', () => {
    expect(getDefaultLegalDescription('Ginjo')).toBe('Bevanda alcolica fermentata di riso (SAKE)')
    expect(getDefaultLegalDescription('Junmai Daiginjo')).toBe('Bevanda alcolica fermentata di riso (SAKE)')
    expect(getDefaultLegalDescription('Junmai', 'ja')).toBe('日本酒')
  })
  it('fruit / wine / beer unchanged', () => {
    expect(getDefaultLegalDescription('Umeshu')).toBe('Bevanda alcolica a base di frutta')
    expect(getDefaultLegalDescription('Vino')).toBe('Vino')
    expect(getDefaultLegalDescription('Birra')).toBe('Birra')
  })
  it('base type + appended finish resolves to the right family', () => {
    // fruit sake with a finish must stay fruit (was wrongly falling to sake)
    expect(getDefaultLegalDescription('Fruit Sake Nigori')).toBe('Bevanda alcolica a base di frutta')
    expect(getDefaultLegalDescription('Sake ai frutti Nama')).toBe('Bevanda alcolica a base di frutta')
    // sake + finish stays sake; spirit + finish stays empty
    expect(getDefaultLegalDescription('Ginjo Nama')).toBe('Bevanda alcolica fermentata di riso (SAKE)')
    expect(getDefaultLegalDescription('Gin Koshu')).toBe('')
    expect(getDefaultLegalDescription('Kokuto Shochu Koshu')).toBe('Distillato giapponese di riso e zucchero di canna')
  })
})

describe('detectDetailedCategory — tipologia line', () => {
  it('resolves Japanese variants to the canonical spirit', () => {
    expect(detectDetailedCategory('Yuza', 'Japanese Whisky', '')).toBe('Whisky')
    expect(detectDetailedCategory('Hakku', 'Japanese Rum', '')).toBe('Rum')
  })
  it('keeps shochu sub-types distinct', () => {
    expect(detectDetailedCategory('Lento', 'Kokuto Shochu', '')).toBe('Kokuto Shochu')
    expect(detectDetailedCategory('Mugi', 'Honkaku Shochu', '')).toBe('Shochu')
    expect(detectDetailedCategory('Zanpa', 'Awamori', '')).toBe('Awamori')
  })
  it('does not mistake Ginjo for Gin (word boundary)', () => {
    expect(detectDetailedCategory('Dewazakura', 'Ginjo', '')).toBe('Ginjo')
    expect(getDefaultLegalDescription('Ginjo')).not.toBe('')
  })
})
