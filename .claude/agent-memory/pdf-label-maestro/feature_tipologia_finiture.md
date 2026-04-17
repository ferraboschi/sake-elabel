---
name: Tipologia + Finiture Feature
description: Product_Type_Current session override and Finiture finishing tags compose the PDF category line
type: project
---

Feature adds per-generation Tipologia override (Product_Type_Current) and Finiture finishing descriptors to the back-label PDF.

**Data flow:**
1. `ProductEditor.jsx` — `re.productTypeCurrent` (text input) + `re.finiture` (chip toggles + free text input). Both reset to empty on product/language change (session-only, never persisted to Airtable).
2. `useGenerateLabel.js` — resolves `effectiveBaseType` from productTypeCurrent vs detailedCategory, composes `composedCategory = [baseType, finiture].join(' ')`, sets `label.isTypeModified = true` when override differs from auto-detected.
3. `labelPrinter.js` — `label.category` already contains the composed string; renders "MOD." badge in accent purple (4.5pt bold) when `label.isTypeModified` is true.

**Fallback rules:**
- `productTypeCurrent` empty → use `detailedCategory` (auto-detected, no badge)
- `productTypeCurrent === 'Nessuna'` → effectiveBaseType = '' (omit tipologia, show only finiture)
- `finiture` empty → no finishing tokens appended
- Composed string empty → falls back to `detailedCategory || product.category`

**Test cases covered:**
- Junmai → Tokubetsu Honjozo: override, badge shown, composed = "Tokubetsu Honjozo"
- Koshu only: productTypeCurrent='Nessuna', finiture='Koshu' → composed = "Koshu"
- Tokubetsu Honjozo Koshu Nama: override + two finiture chips
- Empty/no tipologia: productTypeCurrent='Nessuna', finiture='' → category omitted

**Why:** Allow per-generation customization without persisting to Airtable, and show auditors that a type was overridden during label generation.

**How to apply:** When adding new per-generation fields, follow the same pattern: add to `re` in ProductEditor, resolve in useGenerateLabel, pass via label object, normalizeLabel picks it up, labelPrinter renders it.
