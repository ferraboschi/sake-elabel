# Approval Workflow for Product Type / Finishes Changes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user in Japan modifies a product's tipologia/finiture via the Portal, the change enters a "PENDING" state and is NOT reflected in the PDF until an admin in Italy explicitly approves it from a new `/portal/approvals` page.

**Architecture:** New Airtable fields track pending values and approval state. The Portal saves changes with `ApprovalStatus = PENDING` instead of immediately overwriting `Product_Type_Current`. A new `ApprovalsPage` component at `/portal/approvals` lists all pending changes with approve/reject actions. The PDF generation pipeline reads only the approved type, never the pending one. An approval badge in the dashboard top-bar shows pending count.

**Tech Stack:** React (Vite), Airtable REST API (via existing proxy), jsPDF (existing), existing auth system (`AuthContext`).

---

## Scope

This plan covers one coherent feature: the approval workflow for product type / finishes edits. It is a single subsystem with clear boundaries:

1. **Airtable schema** (new fields)
2. **Airtable service** (new API functions)
3. **Approval service** (pure logic, no UI)
4. **Approval page** (new React component)
5. **Portal integration** (modify existing PortalProduct + PortalDashboard)
6. **PDF gate** (modify useGenerateLabel to respect approval status)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/services/airtable.js` | Add 5 new FIELDS entries; add `fetchPendingApprovals()`, `approveChange()`, `rejectChange()` functions |
| Create | `src/services/approvalService.js` | Pure-logic helpers: `buildPendingPayload()`, `buildApprovePayload()`, `buildRejectPayload()`, `isPending()` |
| Create | `src/components/portal/ApprovalsPage.jsx` | New page: lists pending changes, approve/reject buttons, filters |
| Create | `src/components/portal/approvals.css` | Styles for the approvals page (reuses portal design tokens) |
| Modify | `src/components/portal/PortalProduct.jsx` | When saving type/finishes: write to pending fields instead of current, set status=PENDING |
| Modify | `src/components/portal/PortalDashboard.jsx` | Add "Approvazioni" nav link with badge count |
| Modify | `src/hooks/useGenerateLabel.js` | Gate: if `ApprovalStatus === 'PENDING'`, use original type (not pending) |
| Modify | `src/App.jsx` | Add route for `/portal/approvals` |

---

## Task 1: Add Airtable Fields for Approval Workflow

**Files:**
- Modify: `src/services/airtable.js` (lines 24-90, the FIELDS object, and the `normalizeRecord` function lines 354-469)

**PREREQUISITE — Airtable Base Setup:**
Before this code works, you must create these fields in Airtable (table `tblilRsJLHIVJ1xju`):

| Field Name | Type | Notes |
|------------|------|-------|
| `ProductType_Pending` | Single line text | Stores the proposed new composed type string |
| `Finishes_Pending` | Single line text | Stores the proposed new finishes string |
| `Approval_Status` | Single select | Options: `PENDING`, `APPROVED`, `REJECTED` (blank = no pending change) |
| `Approved_By` | Single line text | Username who approved/rejected |
| `Approved_At` | Date (ISO 8601) | Timestamp of approval/rejection |

After creating them, note each field's ID from the Airtable field manager (click field header > "Field API reference"). Replace the `fldAPPR_xxx` placeholders below with real IDs.

- [ ] **Step 1: Add the 5 new field definitions to FIELDS object**

In `src/services/airtable.js`, find the block:

```javascript
  // === Product Type / Finishes (modified by user) ===
  productTypeCurrent: { id: 'fldPTC_placeholder',  name: 'Product_Type_Current' },
  productFinishes:    { id: 'fldPF_placeholder',   name: 'Product_Finishes' },
  typeModifiedFlag:   { id: 'fldTMF_placeholder',  name: 'Type_Modified_Flag' },
  typeOriginal:       { id: 'fldTO_placeholder',    name: 'Type_Original' },
```

Add immediately after that block (before the `// === E-Label status ===` comment):

```javascript
  // === Approval workflow ===
  productTypePending:  { id: 'fldAPPR_type',    name: 'ProductType_Pending' },
  finishesPending:     { id: 'fldAPPR_fin',     name: 'Finishes_Pending' },
  approvalStatus:      { id: 'fldAPPR_status',  name: 'Approval_Status' },
  approvedBy:          { id: 'fldAPPR_by',      name: 'Approved_By' },
  approvedAt:          { id: 'fldAPPR_at',      name: 'Approved_At' },
```

> **NOTE:** Replace `fldAPPR_type`, `fldAPPR_fin`, `fldAPPR_status`, `fldAPPR_by`, `fldAPPR_at` with the real Airtable field IDs after creating the fields in the Airtable UI.

- [ ] **Step 2: Add the new fields to `normalizeRecord`**

In `src/services/airtable.js`, find the block in `normalizeRecord` that starts with:

```javascript
    // Product Type / Finishes (user modifications)
    productTypeCurrent: get('productTypeCurrent') || '',
    productFinishes: get('productFinishes') || '',
    typeModifiedFlag: !!get('typeModifiedFlag'),
    typeOriginal: get('typeOriginal') || '',
```

Add immediately after that block (before `// E-Label status`):

```javascript
    // Approval workflow
    productTypePending: get('productTypePending') || '',
    finishesPending: get('finishesPending') || '',
    approvalStatus: getSelect('approvalStatus') || '',
    approvedBy: get('approvedBy') || '',
    approvedAt: get('approvedAt') || null,
```

- [ ] **Step 3: Verify the app still loads without errors**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds. The new fields are simply `null`/empty until the Airtable columns exist.

- [ ] **Step 4: Commit**

```bash
git add src/services/airtable.js
git commit -m "feat(approval): add Airtable field definitions for approval workflow"
```

---

## Task 2: Create Approval Service (Pure Logic)

**Files:**
- Create: `src/services/approvalService.js`

This service contains zero I/O — only pure functions that build payloads and check state. This makes it easy to reason about and test.

- [ ] **Step 1: Create `src/services/approvalService.js`**

```javascript
/**
 * Approval Workflow Service — Pure Logic
 *
 * Handles state transitions for the product type/finishes approval workflow.
 * No I/O — only builds payloads and checks state.
 *
 * Workflow:
 *   1. Japan user edits type/finishes → submitForApproval() → status=PENDING
 *   2. Italy admin approves → buildApprovePayload() → copies pending→current, status=APPROVED
 *   3. Italy admin rejects → buildRejectPayload() → clears pending, status=REJECTED
 */

import { composeProductTypeString } from './airtable'

/**
 * Check if a product has a pending type/finishes change.
 * @param {object} product - normalized product object
 * @returns {boolean}
 */
export function isPending(product) {
  return product.approvalStatus === 'PENDING'
}

/**
 * Check if the current user can approve changes.
 * Only 'admin' role can approve (Italy team).
 * @param {object} user - from AuthContext { username, role }
 * @returns {boolean}
 */
export function canApprove(user) {
  return user?.role === 'admin'
}

/**
 * Build the Airtable payload when a user submits a type/finishes change for approval.
 * Writes to pending fields and sets status=PENDING. Does NOT touch productTypeCurrent.
 *
 * @param {string} newType - the new base product type (e.g. "Tokubetsu Honjozo")
 * @param {string[]} newFinishes - array of finish tags (e.g. ["Koshu", "Nama"])
 * @returns {object} payload for updateProduct()
 */
export function buildSubmitPayload(newType, newFinishes) {
  const composedPending = composeProductTypeString(newType, newFinishes)
  return {
    productTypePending: composedPending,
    finishesPending: (newFinishes || []).join(' '),
    approvalStatus: 'PENDING',
    // Clear previous approval metadata
    approvedBy: '',
    approvedAt: null,
  }
}

/**
 * Build the Airtable payload when an admin APPROVES a pending change.
 * Copies pending values to current, sets status=APPROVED.
 *
 * @param {object} product - normalized product with pending values
 * @param {string} approverUsername - username of the admin approving
 * @returns {object} payload for updateProduct()
 */
export function buildApprovePayload(product, approverUsername) {
  return {
    // Copy pending → current
    productTypeCurrent: product.productTypePending || '',
    productFinishes: product.finishesPending || '',
    typeModifiedFlag: true,
    // Update approval metadata
    approvalStatus: 'APPROVED',
    approvedBy: approverUsername,
    approvedAt: new Date().toISOString(),
    // Clear pending
    productTypePending: '',
    finishesPending: '',
  }
}

/**
 * Build the Airtable payload when an admin REJECTS a pending change.
 * Clears pending values, sets status=REJECTED. Current values are untouched.
 *
 * @param {string} rejecterUsername - username of the admin rejecting
 * @returns {object} payload for updateProduct()
 */
export function buildRejectPayload(rejecterUsername) {
  return {
    // Clear pending
    productTypePending: '',
    finishesPending: '',
    // Set rejection metadata
    approvalStatus: 'REJECTED',
    approvedBy: rejecterUsername,
    approvedAt: new Date().toISOString(),
  }
}

/**
 * Get the effective type string for PDF generation.
 * If PENDING: use the CURRENT (approved) value — never the pending one.
 * If APPROVED: use the current value (which was updated during approval).
 * If REJECTED or blank: use the current value.
 *
 * @param {object} product - normalized product
 * @returns {string} the type string safe to use in PDF
 */
export function getEffectiveTypeForPDF(product) {
  // The current fields always hold the approved/safe value.
  // Pending changes live in separate fields and are never used for PDF.
  return product.productTypeCurrent || product.category || ''
}

/**
 * Format a pending change for display in the approvals page.
 * Shows "Old Value" → "New Value" comparison.
 *
 * @param {object} product - normalized product with pending values
 * @returns {{ from: string, to: string }}
 */
export function formatPendingChange(product) {
  const from = product.productTypeCurrent || product.typeOriginal || product.category || '(vuoto)'
  const to = product.productTypePending || '(vuoto)'
  return { from, to }
}

export default {
  isPending,
  canApprove,
  buildSubmitPayload,
  buildApprovePayload,
  buildRejectPayload,
  getEffectiveTypeForPDF,
  formatPendingChange,
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds (new file is not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/services/approvalService.js
git commit -m "feat(approval): add pure-logic approval service with submit/approve/reject payloads"
```

---

## Task 3: Add Airtable API Functions for Approval Operations

**Files:**
- Modify: `src/services/airtable.js` (add 3 new exported functions before `export default`)

- [ ] **Step 1: Add `fetchPendingApprovals`, `approveProductType`, `rejectProductType` functions**

In `src/services/airtable.js`, find the line:

```javascript
export default {
  isAirtableConfigured,
  fetchProducts,
```

Insert immediately BEFORE that `export default` block:

```javascript
/**
 * Fetch all products with ApprovalStatus = "PENDING".
 * Returns normalized product objects.
 */
export const fetchPendingApprovals = async () => {
  if (!isAirtableConfigured()) return []

  const all = await fetchProducts()
  if (!all) return []

  return all.filter(p => p.approvalStatus === 'PENDING')
}

/**
 * Approve a pending product type change.
 * Copies pending values to current, clears pending, sets APPROVED.
 *
 * @param {string} recordId - Airtable record ID
 * @param {object} approvePayload - from buildApprovePayload()
 */
export const approveProductType = async (recordId, approvePayload) => {
  return updateProduct(recordId, approvePayload)
}

/**
 * Reject a pending product type change.
 * Clears pending values, sets REJECTED.
 *
 * @param {string} recordId - Airtable record ID
 * @param {object} rejectPayload - from buildRejectPayload()
 */
export const rejectProductType = async (recordId, rejectPayload) => {
  return updateProduct(recordId, rejectPayload)
}
```

Then update the `export default` block to include the new functions:

```javascript
export default {
  isAirtableConfigured,
  fetchProducts,
  fetchProduct,
  updateProduct,
  batchUpdateProducts,
  composePackagingMaterials,
  getModifiedProducts,
  composeProductTypeString,
  parseProductTypeString,
  fetchPendingApprovals,
  approveProductType,
  rejectProductType,
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/services/airtable.js
git commit -m "feat(approval): add fetchPendingApprovals, approveProductType, rejectProductType API functions"
```

---

## Task 4: Modify PortalProduct to Submit Changes for Approval

**Files:**
- Modify: `src/components/portal/PortalProduct.jsx`

Currently, `doSave()` in PortalProduct directly writes `productTypeCurrent` and `productFinishes` to Airtable. We need to change it so that type/finishes changes go into the PENDING fields instead.

- [ ] **Step 1: Add import for approval service**

In `src/components/portal/PortalProduct.jsx`, find the existing import block at the top. After the line:

```javascript
import { fetchProducts, updateProduct, isAirtableConfigured, composeProductTypeString, parseProductTypeString } from '../../services/airtable'
```

Add:

```javascript
import { buildSubmitPayload, isPending } from '../../services/approvalService'
```

- [ ] **Step 2: Modify `doSave()` to write pending fields instead of current fields**

In `src/components/portal/PortalProduct.jsx`, find the block inside `doSave` (around line 317-329) that writes type/finishes:

```javascript
      // Save product type / finishes
      if (d.productTypeModified !== undefined) {
        const combinedType = composeProductTypeString(d.productTypeModified, d.finishesModified || [])
        payload.productTypeCurrent = d.productTypeModified || ''
        payload.productFinishes = (d.finishesModified || []).join(' ')
        // Compare with original to set modified flag
        const originalClean = (d.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
        const isModified = combinedType !== originalClean
        payload.typeModifiedFlag = isModified
        if (!d.productTypeOriginal && first.category) {
          payload.typeOriginal = `(${first.category})`
        }
        console.log('[doSave] Type:', combinedType, 'Original:', originalClean, 'Modified:', isModified)
      }
```

Replace it with:

```javascript
      // Save product type / finishes — submit for approval (PENDING)
      if (d.productTypeModified !== undefined) {
        const combinedType = composeProductTypeString(d.productTypeModified, d.finishesModified || [])
        const originalClean = (d.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
        const isModified = combinedType !== originalClean

        if (isModified && combinedType) {
          // Type was changed — submit for approval instead of direct save
          const approvalPayload = buildSubmitPayload(d.productTypeModified, d.finishesModified || [])
          Object.assign(payload, approvalPayload)
          console.log('[doSave] Type submitted for approval:', combinedType, 'Original:', originalClean)
        } else {
          // No change or cleared — keep existing behavior
          payload.productTypeCurrent = d.productTypeModified || ''
          payload.productFinishes = (d.finishesModified || []).join(' ')
          payload.typeModifiedFlag = false
        }

        if (!d.productTypeOriginal && first.category) {
          payload.typeOriginal = `(${first.category})`
        }
      }
```

- [ ] **Step 3: Apply the same change in `saveTitleEdit()`**

In `src/components/portal/PortalProduct.jsx`, find the similar block inside `saveTitleEdit` (around line 438-447):

```javascript
        // Include product type / finishes in title save payload
        if (ed.productTypeModified !== undefined) {
          const ct = composeProductTypeString(ed.productTypeModified, ed.finishesModified || [])
          payload.productTypeCurrent = ed.productTypeModified || ''
          payload.productFinishes = (ed.finishesModified || []).join(' ')
          const oc = (ed.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
          payload.typeModifiedFlag = ct !== oc
          if (!ed.productTypeOriginal && first.category) {
            payload.typeOriginal = `(${first.category})`
          }
        }
```

Replace it with:

```javascript
        // Include product type / finishes — submit for approval if changed
        if (ed.productTypeModified !== undefined) {
          const ct = composeProductTypeString(ed.productTypeModified, ed.finishesModified || [])
          const oc = (ed.productTypeOriginal || '').replace(/^\(|\)$/g, '').trim()
          const isModified = ct !== oc

          if (isModified && ct) {
            const approvalPayload = buildSubmitPayload(ed.productTypeModified, ed.finishesModified || [])
            Object.assign(payload, approvalPayload)
          } else {
            payload.productTypeCurrent = ed.productTypeModified || ''
            payload.productFinishes = (ed.finishesModified || []).join(' ')
            payload.typeModifiedFlag = false
          }

          if (!ed.productTypeOriginal && first.category) {
            payload.typeOriginal = `(${first.category})`
          }
        }
```

- [ ] **Step 4: Add a "Pending Approval" visual indicator in the type editor section**

In `src/components/portal/PortalProduct.jsx`, find where the type editor shows the preview line with `isTypeModified`. We need to add a PENDING badge. Find the block that renders the type editor (search for `showTypeEditor`). After the type/finishes preview section, add a pending indicator.

Find the line that computes `isTypeModified` (around line 507):

```javascript
  const isTypeModified = combinedTypeDisplay !== originalTypeClean && combinedTypeDisplay !== ''
```

Add immediately after it:

```javascript
  // Check if this product has a pending approval
  const hasPendingApproval = isPending(first)
```

Then, wherever the `isTypeModified` badge renders (inside the JSX where the type preview is shown), add after the existing preview div a pending-status message. Find the type/finishes section in the JSX and add this right after the preview area:

```javascript
          {hasPendingApproval && (
            <div style={{
              marginTop: 8, padding: '8px 12px',
              background: '#fff3cd', border: '1px solid #ffc107',
              borderRadius: 6, fontSize: 12, color: '#856404',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>&#9202;</span>
              <div>
                <strong>{lang === 'ja' ? '承認待ち' : 'In attesa di approvazione'}</strong>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  {lang === 'ja'
                    ? 'この変更はイタリアチームの承認を待っています。PDFは現在の値を使用します。'
                    : 'Questa modifica e\' in attesa di approvazione dall\'Italia. Il PDF usa il valore attuale.'}
                </div>
              </div>
            </div>
          )}
```

- [ ] **Step 5: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/PortalProduct.jsx
git commit -m "feat(approval): submit type/finishes changes for approval instead of direct save"
```

---

## Task 5: Gate PDF Generation to Use Only Approved Values

**Files:**
- Modify: `src/hooks/useGenerateLabel.js`

- [ ] **Step 1: Add import for approval service**

In `src/hooks/useGenerateLabel.js`, find the imports at the top. After the line:

```javascript
import { detectDetailedCategory, getDefaultLegalDescription } from '../services/categoryDetector'
```

Add:

```javascript
import { getEffectiveTypeForPDF } from '../services/approvalService'
```

- [ ] **Step 2: Modify the type resolution logic in `generate()`**

In `src/hooks/useGenerateLabel.js`, find the block (around line 47-65) that resolves `effectiveBaseType`:

```javascript
        const rawTypeCurrent = (re.productTypeCurrent || '').trim()
        const isTypeOverridden = rawTypeCurrent !== '' && rawTypeCurrent !== detailedCategory

        // Resolve effective base type for PDF
        let effectiveBaseType
        if (rawTypeCurrent === 'Nessuna') {
          effectiveBaseType = ''               // omit entirely
        } else if (rawTypeCurrent !== '') {
          effectiveBaseType = rawTypeCurrent   // use override
        } else {
          effectiveBaseType = detailedCategory || product.category || ''
        }
```

Replace it with:

```javascript
        const rawTypeCurrent = (re.productTypeCurrent || '').trim()
        const isTypeOverridden = rawTypeCurrent !== '' && rawTypeCurrent !== detailedCategory

        // Resolve effective base type for PDF
        // APPROVAL GATE: if product has a pending approval, use the safe (current) value
        let effectiveBaseType
        if (product.approvalStatus === 'PENDING') {
          // Pending approval — use the last approved value, ignore any session override
          effectiveBaseType = getEffectiveTypeForPDF(product)
          console.log('[Generate] Pending approval — using approved type:', effectiveBaseType)
        } else if (rawTypeCurrent === 'Nessuna') {
          effectiveBaseType = ''               // omit entirely
        } else if (rawTypeCurrent !== '') {
          effectiveBaseType = rawTypeCurrent   // use override
        } else {
          effectiveBaseType = detailedCategory || product.category || ''
        }
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useGenerateLabel.js
git commit -m "feat(approval): gate PDF generation to use only approved type values"
```

---

## Task 6: Also Gate PDF in PortalProduct's `handlePrint`

**Files:**
- Modify: `src/components/portal/PortalProduct.jsx`

The PortalProduct component has its own `handlePrint` function that builds labels independently of `useGenerateLabel`. We must apply the same gate there.

- [ ] **Step 1: Modify `handlePrint` type resolution**

In `src/components/portal/PortalProduct.jsx`, find the `handlePrint` function (around line 533). Find the line:

```javascript
      const cat = combinedTypeDisplay || detectDetailedCategory(item.name, item.category || '', '')
```

Replace it with:

```javascript
      // APPROVAL GATE: if pending, use last approved value, not the pending one
      const cat = item.approvalStatus === 'PENDING'
        ? (item.productTypeCurrent || detectDetailedCategory(item.name, item.category || '', ''))
        : (combinedTypeDisplay || detectDetailedCategory(item.name, item.category || '', ''))
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/PortalProduct.jsx
git commit -m "feat(approval): gate PortalProduct handlePrint to respect approval status"
```

---

## Task 7: Create Approvals Page CSS

**Files:**
- Create: `src/components/portal/approvals.css`

This file reuses the portal design tokens (already in `portal.css`) and adds approval-specific styles.

- [ ] **Step 1: Create `src/components/portal/approvals.css`**

```css
/* ═══════════════════════════════════════════════
   APPROVALS PAGE — Design System Extension
   Reuses portal.css design tokens
   ═══════════════════════════════════════════════ */

.approvals-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px;
}

.approvals-header {
  margin-bottom: 24px;
}

.approvals-header h1 {
  font-family: var(--portal-font);
  font-size: 22px;
  font-weight: 700;
  color: var(--portal-ink);
  margin: 0 0 4px;
  letter-spacing: -0.3px;
}

.approvals-header p {
  font-size: 13px;
  color: var(--portal-ink-muted);
  margin: 0;
}

/* ── Filters ── */
.approvals-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.approvals-filter-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--portal-font);
  background: var(--portal-surface);
  color: var(--portal-ink-soft);
  border: 1px solid var(--portal-border);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s;
}

.approvals-filter-btn:hover {
  border-color: var(--portal-accent);
  color: var(--portal-accent);
}

.approvals-filter-btn.active {
  background: var(--portal-accent);
  color: #fff;
  border-color: var(--portal-accent);
}

/* ── Card list ── */
.approvals-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.approval-card {
  background: var(--portal-surface);
  border: 1px solid var(--portal-border);
  border-radius: var(--portal-radius);
  padding: 16px 20px;
  box-shadow: var(--portal-shadow-sm);
  transition: box-shadow 0.15s;
}

.approval-card:hover {
  box-shadow: var(--portal-shadow-hover);
}

.approval-card-top {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 12px;
}

.approval-card-photo {
  width: 48px;
  height: 48px;
  border-radius: var(--portal-radius-sm);
  background: var(--portal-paper);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  overflow: hidden;
  flex-shrink: 0;
}

.approval-card-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.approval-card-info {
  flex: 1;
  min-width: 0;
}

.approval-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--portal-ink);
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.approval-card-meta {
  font-size: 12px;
  color: var(--portal-ink-muted);
}

/* ── Change diff ── */
.approval-change {
  background: var(--portal-paper);
  border: 1px solid var(--portal-border-light);
  border-radius: var(--portal-radius-sm);
  padding: 10px 14px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.approval-change-from {
  font-size: 13px;
  color: var(--portal-ink-muted);
  text-decoration: line-through;
  font-weight: 400;
}

.approval-change-arrow {
  font-size: 14px;
  color: var(--portal-ink-muted);
}

.approval-change-to {
  font-size: 14px;
  font-weight: 600;
  color: var(--portal-accent);
}

/* ── Actions ── */
.approval-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.approval-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  font-family: var(--portal-font);
  border: none;
  border-radius: var(--portal-radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.approval-btn--approve {
  background: var(--portal-ok);
  color: #fff;
}

.approval-btn--approve:hover {
  background: #245a42;
}

.approval-btn--reject {
  background: var(--portal-surface);
  color: var(--portal-danger);
  border: 1px solid var(--portal-danger);
}

.approval-btn--reject:hover {
  background: var(--portal-danger-bg);
}

.approval-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* ── Empty state ── */
.approvals-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--portal-ink-muted);
}

.approvals-empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

/* ── Badge (used in nav) ── */
.approval-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--portal-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  margin-left: 5px;
}

/* ── Responsive ── */
@media (max-width: 600px) {
  .approvals-page {
    padding: 16px 12px;
  }

  .approval-card-top {
    flex-wrap: wrap;
  }

  .approval-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portal/approvals.css
git commit -m "feat(approval): add CSS styles for approvals page"
```

---

## Task 8: Create the Approvals Page Component

**Files:**
- Create: `src/components/portal/ApprovalsPage.jsx`

- [ ] **Step 1: Create `src/components/portal/ApprovalsPage.jsx`**

```javascript
import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchPendingApprovals, approveProductType, rejectProductType } from '../../services/airtable'
import { buildApprovePayload, buildRejectPayload, formatPendingChange, canApprove } from '../../services/approvalService'
import { useAuth } from '../../contexts/AuthContext'
import shopifyPhotos from '../../data/shopifyPhotos.json'
import './approvals.css'
import './portal.css'

const SESSION_KEY = 'portal_session'

export default function ApprovalsPage() {
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()

  // Portal auth (same as PortalDashboard)
  const [portalAuthed, setPortalAuthed] = useState(false)
  const [lang, setLang] = useState('it')
  const [loading, setLoading] = useState(true)
  const [pendingProducts, setPendingProducts] = useState([])
  const [processing, setProcessing] = useState({}) // { recordId: 'approving' | 'rejecting' }
  const [filter, setFilter] = useState('all') // 'all' | 'recent' | 'oldest'

  // Check portal session OR admin auth
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved || isAdmin) {
      setPortalAuthed(true)
    }
  }, [isAdmin])

  // Load pending approvals
  useEffect(() => {
    if (!portalAuthed) return
    loadPending()
  }, [portalAuthed])

  const loadPending = async () => {
    setLoading(true)
    try {
      const products = await fetchPendingApprovals()
      setPendingProducts(products)
    } catch (err) {
      console.error('[Approvals] Load error:', err)
    }
    setLoading(false)
  }

  // Get photo for a product
  const getPhoto = (product) => {
    const codeKey = (product.code || '').toUpperCase()
    const match = shopifyPhotos[codeKey]
    return match?.photo || null
  }

  // Sort/filter
  const sortedProducts = useMemo(() => {
    let list = [...pendingProducts]
    if (filter === 'recent') {
      list.sort((a, b) => (b.elabelLastUpdated || '').localeCompare(a.elabelLastUpdated || ''))
    } else if (filter === 'oldest') {
      list.sort((a, b) => (a.elabelLastUpdated || '').localeCompare(b.elabelLastUpdated || ''))
    }
    return list
  }, [pendingProducts, filter])

  // Approve handler
  const handleApprove = async (product) => {
    if (!canApprove(user)) {
      alert(lang === 'ja'
        ? 'この操作にはイタリアの管理者権限が必要です。'
        : 'Solo gli admin Italia possono approvare le modifiche.')
      return
    }

    setProcessing(prev => ({ ...prev, [product._recordId]: 'approving' }))
    try {
      const payload = buildApprovePayload(product, user?.username || 'admin')

      // Apply to all siblings (same name, different sizes)
      const siblings = pendingProducts.filter(p => p.name === product.name)
      for (const sibling of siblings) {
        await approveProductType(sibling._recordId, payload)
      }

      // Remove from local state
      setPendingProducts(prev =>
        prev.filter(p => p.name !== product.name)
      )
    } catch (err) {
      console.error('[Approve]', err)
      alert(`Errore: ${err.message}`)
    }
    setProcessing(prev => {
      const next = { ...prev }
      delete next[product._recordId]
      return next
    })
  }

  // Reject handler
  const handleReject = async (product) => {
    if (!canApprove(user)) {
      alert(lang === 'ja'
        ? 'この操作にはイタリアの管理者権限が必要です。'
        : 'Solo gli admin Italia possono rifiutare le modifiche.')
      return
    }

    const confirmMsg = lang === 'ja'
      ? `「${product.name}」の変更を拒否しますか？`
      : `Rifiutare la modifica per "${product.name}"?`
    if (!confirm(confirmMsg)) return

    setProcessing(prev => ({ ...prev, [product._recordId]: 'rejecting' }))
    try {
      const payload = buildRejectPayload(user?.username || 'admin')

      const siblings = pendingProducts.filter(p => p.name === product.name)
      for (const sibling of siblings) {
        await rejectProductType(sibling._recordId, payload)
      }

      setPendingProducts(prev =>
        prev.filter(p => p.name !== product.name)
      )
    } catch (err) {
      console.error('[Reject]', err)
      alert(`Errore: ${err.message}`)
    }
    setProcessing(prev => {
      const next = { ...prev }
      delete next[product._recordId]
      return next
    })
  }

  // Deduplicate by product name (siblings are same product, different sizes)
  const uniqueProducts = useMemo(() => {
    const seen = new Set()
    return sortedProducts.filter(p => {
      if (seen.has(p.name)) return false
      seen.add(p.name)
      return true
    })
  }, [sortedProducts])

  const jp = lang === 'ja'

  // Not authenticated
  if (!portalAuthed) {
    return (
      <div className="portal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>&#128274;</div>
          <p style={{ color: 'var(--portal-ink-muted)' }}>
            {jp ? 'ログインが必要です' : 'Accesso richiesto'}
          </p>
          <Link to="/portal" style={{ color: 'var(--portal-accent)', fontWeight: 500 }}>
            {jp ? 'ポータルへ' : 'Vai al portale'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="portal">
      {/* Top Bar */}
      <div className="portal-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/portal')}
            style={{
              color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'var(--portal-font)', fontSize: 13,
            }}
          >
            &larr; {jp ? 'ダッシュボード' : 'Dashboard'}
          </button>
          <span style={{ opacity: 0.3 }}>/</span>
          <strong style={{ fontSize: 14 }}>
            {jp ? '承認管理' : 'Approvazioni'}
          </strong>
        </div>
        <div className="portal-lang-switch" style={{ borderLeft: 'none', marginLeft: 0 }}>
          <button className={lang === 'ja' ? 'active' : ''} onClick={() => setLang('ja')}>JP</button>
          <button className={lang === 'it' ? 'active' : ''} onClick={() => setLang('it')}>IT</button>
        </div>
      </div>

      <div className="approvals-page">
        {/* Header */}
        <div className="approvals-header">
          <h1>{jp ? '変更承認' : 'Modifiche in Attesa'}</h1>
          <p>
            {jp
              ? `${uniqueProducts.length}件の種別変更が承認を待っています`
              : `${uniqueProducts.length} modific${uniqueProducts.length === 1 ? 'a' : 'he'} di tipologia in attesa di approvazione`}
          </p>
        </div>

        {/* Filters */}
        <div className="approvals-filters">
          {[
            { key: 'all', label: jp ? '全て' : 'Tutte' },
            { key: 'recent', label: jp ? '最新順' : 'Piu\' recenti' },
            { key: 'oldest', label: jp ? '古い順' : 'Meno recenti' },
          ].map(f => (
            <button
              key={f.key}
              className={`approvals-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}

          <button
            onClick={loadPending}
            className="approvals-filter-btn"
            style={{ marginLeft: 'auto' }}
          >
            &#x21bb; {jp ? '更新' : 'Aggiorna'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="approvals-empty">
            <div style={{ color: 'var(--portal-ink-muted)' }}>
              {jp ? '読み込み中...' : 'Caricamento...'}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && uniqueProducts.length === 0 && (
          <div className="approvals-empty">
            <div className="approvals-empty-icon">&#10003;</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              {jp ? '承認待ちの変更はありません' : 'Nessuna modifica in attesa'}
            </div>
            <div style={{ fontSize: 13 }}>
              {jp ? '全ての変更は承認済みです' : 'Tutte le modifiche sono state approvate'}
            </div>
          </div>
        )}

        {/* Cards */}
        {!loading && (
          <div className="approvals-list">
            {uniqueProducts.map(product => {
              const change = formatPendingChange(product)
              const photo = getPhoto(product)
              const isProcessing = !!processing[product._recordId]
              const isApproving = processing[product._recordId] === 'approving'
              const isRejecting = processing[product._recordId] === 'rejecting'
              const siblingCount = sortedProducts.filter(p => p.name === product.name).length

              return (
                <div key={product._recordId} className="approval-card">
                  <div className="approval-card-top">
                    {/* Photo */}
                    <div className="approval-card-photo">
                      {photo
                        ? <img src={photo} alt={product.name} />
                        : <span>&#127862;</span>}
                    </div>

                    {/* Info */}
                    <div className="approval-card-info">
                      <div className="approval-card-name">{product.name}</div>
                      <div className="approval-card-meta">
                        {product.winery || product.wineryJp || ''}
                        {product.code && <> &middot; {product.code}</>}
                        {siblingCount > 1 && <> &middot; {siblingCount} {jp ? 'サイズ' : 'formati'}</>}
                      </div>
                    </div>
                  </div>

                  {/* Change diff */}
                  <div className="approval-change">
                    <span className="approval-change-from">{change.from}</span>
                    <span className="approval-change-arrow">&rarr;</span>
                    <span className="approval-change-to">{change.to}</span>
                  </div>

                  {/* Actions */}
                  <div className="approval-actions">
                    {!canApprove(user) && (
                      <span style={{ fontSize: 12, color: 'var(--portal-ink-muted)', fontStyle: 'italic' }}>
                        {jp ? '管理者のみ承認可能' : 'Solo admin puo\' approvare'}
                      </span>
                    )}
                    {canApprove(user) && (
                      <>
                        <button
                          className="approval-btn approval-btn--approve"
                          disabled={isProcessing}
                          onClick={() => handleApprove(product)}
                        >
                          {isApproving
                            ? (jp ? '承認中...' : 'Approvazione...')
                            : (jp ? '&#10003; 承認' : '&#10003; Approva')}
                        </button>
                        <button
                          className="approval-btn approval-btn--reject"
                          disabled={isProcessing}
                          onClick={() => handleReject(product)}
                        >
                          {isRejecting
                            ? (jp ? '拒否中...' : 'Rifiuto...')
                            : (jp ? '&#10007; 拒否' : '&#10007; Rifiuta')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds (component not yet routed).

- [ ] **Step 3: Commit**

```bash
git add src/components/portal/ApprovalsPage.jsx
git commit -m "feat(approval): create ApprovalsPage component with approve/reject actions"
```

---

## Task 9: Add Route for Approvals Page

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add lazy import and route**

In `src/App.jsx`, find the existing portal lazy imports:

```javascript
const PortalDashboard = lazy(() => import('./components/portal/PortalDashboard'))
const PortalProduct = lazy(() => import('./components/portal/PortalProduct'))
```

Add after:

```javascript
const ApprovalsPage = lazy(() => import('./components/portal/ApprovalsPage'))
```

Then find the portal routes block:

```javascript
        {/* New portal (clean UI) */}
        <Route path="/portal" element={<PortalDashboard />} />
        <Route path="/portal/product/:slug" element={<PortalProduct />} />
```

Add after the `/portal/product/:slug` route:

```javascript
        <Route path="/portal/approvals" element={<ApprovalsPage />} />
```

- [ ] **Step 2: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(approval): add /portal/approvals route"
```

---

## Task 10: Add Approval Badge to PortalDashboard Navigation

**Files:**
- Modify: `src/components/portal/PortalDashboard.jsx`

- [ ] **Step 1: Add imports and state for pending count**

In `src/components/portal/PortalDashboard.jsx`, find the existing imports:

```javascript
import { fetchProducts, isAirtableConfigured } from '../../services/airtable'
```

Change to:

```javascript
import { fetchProducts, isAirtableConfigured, fetchPendingApprovals } from '../../services/airtable'
```

Then find the state declarations inside `PortalDashboard()`:

```javascript
  const [products, setProducts] = useState([])
  const [labels, setLabels] = useState([])
```

Add after:

```javascript
  const [pendingCount, setPendingCount] = useState(0)
```

- [ ] **Step 2: Load pending count alongside products**

Find the `loadData` function:

```javascript
  const loadData = async () => {
    setLoading(true)
    try {
      if (isAirtableConfigured()) {
        const fetched = await fetchProducts()
        if (fetched) setProducts(fetched.filter(p => p.name && p.name.trim() && isBeverage(p)))
      }
      setLabels(getLabels())
    } catch (err) {
      console.error('[Portal] Load error:', err)
    }
    setLoading(false)
  }
```

Replace it with:

```javascript
  const loadData = async () => {
    setLoading(true)
    try {
      if (isAirtableConfigured()) {
        const fetched = await fetchProducts()
        if (fetched) {
          setProducts(fetched.filter(p => p.name && p.name.trim() && isBeverage(p)))
          // Count pending approvals
          const pending = fetched.filter(p => p.approvalStatus === 'PENDING')
          // Deduplicate by name (siblings)
          const uniqueNames = new Set(pending.map(p => p.name))
          setPendingCount(uniqueNames.size)
        }
      }
      setLabels(getLabels())
    } catch (err) {
      console.error('[Portal] Load error:', err)
    }
    setLoading(false)
  }
```

- [ ] **Step 3: Add the "Approvazioni" nav link with badge**

Find the top bar navigation block:

```javascript
        <div className="portal-topbar-nav">
          <a href="#" className="active">{lang === 'ja' ? 'ダッシュボード' : 'Dashboard'}</a>
          <Link to="/archive">{lang === 'ja' ? 'アーカイブ' : 'Archivio'}</Link>
          <Link to="/importers">{lang === 'ja' ? '輸入者' : 'Importatori'}</Link>
```

Add a new `<Link>` right after the Dashboard link and before the Archive link:

```javascript
          <Link to="/portal/approvals" style={{ position: 'relative' }}>
            {lang === 'ja' ? '承認' : 'Approvazioni'}
            {pendingCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 18, height: 18, padding: '0 5px',
                borderRadius: 9, background: '#a4243b', color: '#fff',
                fontSize: 10, fontWeight: 700, lineHeight: 1, marginLeft: 5,
              }}>
                {pendingCount}
              </span>
            )}
          </Link>
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/PortalDashboard.jsx
git commit -m "feat(approval): add Approvazioni nav link with pending count badge to dashboard"
```

---

## Task 11: Also Modify AdminPage (ProductEditor) to Respect Approval Gate

**Files:**
- Modify: `src/components/admin/ProductEditor.jsx`

The admin ProductEditor also has type/finishes editing and generates PDFs. The same approval logic must apply there.

- [ ] **Step 1: Add import for approval service**

In `src/components/admin/ProductEditor.jsx`, find the imports. After:

```javascript
import { detectDetailedCategory, getDefaultLegalDescription, getDefaultIngredients } from '../../services/categoryDetector'
```

Add:

```javascript
import { buildSubmitPayload, isPending } from '../../services/approvalService'
```

- [ ] **Step 2: Add pending indicator in the Tipologia section**

Find the Tipologia input section (around line 309-330). Find the line:

```javascript
          {/* Tipologia (Product_Type_Current) — override sessione */}
          <div>
            <label style={fieldLabelStyle}>
              Tipologia (override) / 種別
```

Add this block right before the closing `</div>` of the Tipologia field container (after the helper text about "Nessuna"):

```javascript
            {isPending(product) && (
              <div style={{
                marginTop: 6, padding: '6px 10px',
                background: '#fff3cd', border: '1px solid #ffc107',
                borderRadius: 6, fontSize: 11, color: '#856404',
              }}>
                &#9202; In attesa di approvazione — il PDF usa il valore attuale
              </div>
            )}
```

- [ ] **Step 3: Modify `handleGenerate` to respect approval status**

Find the `handleGenerate` function (around line 140-148):

```javascript
  const handleGenerate = () => {
    const reviewEdits = { [product.slug]: re }
    onGenerate([product], {
      selectedLanguage,
      selectedCountry: REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion,
      importer,
      reviewEdits,
    })
  }
```

Replace with:

```javascript
  const handleGenerate = () => {
    const reviewEdits = { [product.slug]: { ...re } }
    // APPROVAL GATE: if pending, force the review edits to use current (approved) type
    if (isPending(product)) {
      reviewEdits[product.slug].productTypeCurrent = ''
      reviewEdits[product.slug].finiture = ''
    }
    onGenerate([product], {
      selectedLanguage,
      selectedCountry: REGION_CODE_LABELS[selectedRegion]?.label || selectedRegion,
      importer,
      reviewEdits,
    })
  }
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/ferraboschi/The WishList Dropbox/lorenzo ferraboschi/apps/label-sc/QR code/e-label-app" && npx vite build --mode development 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ProductEditor.jsx
git commit -m "feat(approval): add approval gate to admin ProductEditor"
```

---

## Task 12: End-to-End Manual Test Scenarios

No automated test framework is set up in this project. Here are the manual test scenarios to verify the complete workflow.

- [ ] **Step 1: Document test scenarios**

Create a temporary checklist (do NOT commit — this is for manual use):

**Test Scenario A: Submit a type change for approval (as Japan user)**
1. Log into `/portal` with password `sake2026`
2. Open any product (e.g., Kakurei Honjozo)
3. Change the Tipologia from "Honjozo" to "Tokubetsu Honjozo"
4. Add "Koshu" as a finitura
5. Wait for autosave (2 seconds)
6. **VERIFY:** Yellow "In attesa di approvazione" banner appears below the type editor
7. **VERIFY:** In Airtable, the record shows:
   - `ProductType_Pending` = "Tokubetsu Honjozo Koshu"
   - `Approval_Status` = "PENDING"
   - `Product_Type_Current` is UNCHANGED

**Test Scenario B: PDF uses original value while pending**
1. With the same product still pending
2. Click "Genera etichetta" (generate PDF)
3. **VERIFY:** The downloaded PDF shows "Honjozo" (the original), NOT "Tokubetsu Honjozo Koshu"

**Test Scenario C: Approval badge appears in dashboard**
1. Navigate to `/portal`
2. **VERIFY:** The "Approvazioni" nav link shows a red badge with count "1"

**Test Scenario D: Approve the change (as Italy admin)**
1. Log into `/login` with admin credentials
2. Navigate to `/portal/approvals`
3. **VERIFY:** The pending change is listed with:
   - Product photo + name
   - "Honjozo" (strikethrough) -> "Tokubetsu Honjozo Koshu"
4. Click "Approva"
5. **VERIFY:** Card disappears from the list
6. **VERIFY:** In Airtable, the record shows:
   - `Product_Type_Current` = "Tokubetsu Honjozo Koshu"
   - `Approval_Status` = "APPROVED"
   - `Approved_By` = "admin"
   - `Approved_At` = current timestamp
   - `ProductType_Pending` = "" (cleared)

**Test Scenario E: PDF now uses the approved value**
1. Go back to the product
2. Generate a new PDF
3. **VERIFY:** PDF shows "Tokubetsu Honjozo Koshu"

**Test Scenario F: Reject a change**
1. Submit another type change for a different product
2. Navigate to `/portal/approvals`
3. Click "Rifiuta" and confirm
4. **VERIFY:** Card disappears
5. **VERIFY:** In Airtable: `Approval_Status` = "REJECTED", `ProductType_Pending` = "", `Product_Type_Current` = unchanged original

**Test Scenario G: Non-admin cannot approve**
1. Log into `/portal` with supplier password (not admin)
2. Navigate to `/portal/approvals`
3. **VERIFY:** Approve/Reject buttons are replaced by "Solo admin puo' approvare" text

- [ ] **Step 2: Commit a final summary**

```bash
git add -A
git commit -m "feat(approval): complete approval workflow for product type/finishes changes

Adds:
- Airtable fields for pending values and approval status
- Pure-logic approval service (submit/approve/reject)
- Approvals page at /portal/approvals
- PDF generation gated to use only approved values
- Dashboard badge showing pending count
- Pending indicator in both Portal and Admin editors
- Permission check: only admin role can approve"
```

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                        JAPAN USER (Portal)                       │
│                                                                  │
│  PortalProduct.jsx                                               │
│    |                                                             │
│    ├─ edits type/finishes                                        │
│    ├─ doSave() calls buildSubmitPayload()                        │
│    ├─ writes to Airtable: ProductType_Pending, Approval_Status   │
│    └─ shows yellow "pending" banner                              │
└──────────────────────────┬───────────────────────────────────────┘
                           |
                    ┌──────▼──────┐
                    │  AIRTABLE   │
                    │             │
                    │ Pending:    │
                    │  _Pending   │
                    │  _Status    │
                    │  _By, _At   │
                    │             │
                    │ Current:    │
                    │  _Current   │
                    │  _Finishes  │
                    └──────┬──────┘
                           |
┌──────────────────────────▼───────────────────────────────────────┐
│                       ITALY ADMIN                                │
│                                                                  │
│  ApprovalsPage.jsx (/portal/approvals)                           │
│    |                                                             │
│    ├─ fetchPendingApprovals() → shows cards                      │
│    ├─ [Approva] → buildApprovePayload() → copies pending→current │
│    └─ [Rifiuta] → buildRejectPayload() → clears pending          │
│                                                                  │
│  PortalDashboard.jsx                                             │
│    └─ Badge: "N approvazioni" in top nav                         │
└──────────────────────────────────────────────────────────────────┘
                           |
┌──────────────────────────▼───────────────────────────────────────┐
│                        PDF GENERATION                            │
│                                                                  │
│  useGenerateLabel.js + PortalProduct.handlePrint()               │
│    |                                                             │
│    ├─ if approvalStatus === 'PENDING':                           │
│    │     use productTypeCurrent (safe, approved value)            │
│    │     IGNORE productTypePending                                │
│    └─ else: normal behavior                                      │
│                                                                  │
│  Result: PDF is ALWAYS based on approved data. Zero visual change.│
└──────────────────────────────────────────────────────────────────┘
```

---

## Airtable Field ID Placeholder Checklist

After creating the 5 new fields in Airtable, replace these placeholders in `src/services/airtable.js`:

| Placeholder | Field Name in Airtable |
|---|---|
| `fldAPPR_type` | `ProductType_Pending` |
| `fldAPPR_fin` | `Finishes_Pending` |
| `fldAPPR_status` | `Approval_Status` |
| `fldAPPR_by` | `Approved_By` |
| `fldAPPR_at` | `Approved_At` |

---

## Security Notes

- **Only `admin` role can approve/reject** — enforced by `canApprove()` in `approvalService.js`. The UI hides buttons for non-admins.
- **Portal users can submit changes** — they write to pending fields only, never to current fields.
- **Audit trail** — `Approved_By` and `Approved_At` are recorded for every approve/reject action.
- **No tampering** — pending values are never used for PDF generation. Even if someone directly edits Airtable, the PDF gate checks `approvalStatus`.
- **Reversible** — rejecting a change clears pending fields and restores original behavior. Approving is also reversible by submitting a new change.
