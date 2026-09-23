# Tax filing views and external Input VAT — candidate 064

Release status: the operator reports Migration 064 Production Preflight, rollback-only rehearsal, manual apply and Post-Apply Verifier PASS. Approved SHA-256: `6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e`. Historical rows unchanged; function/catalog differences empty. Final application release is authorized. The manual-gate instructions below are retained as historical operator documentation; do not reapply 064.

## Architecture and scope

Both `/finance/tax-position` and `/finance/tax-position/filings` use the same Month / Monthly History / Year Summary home. Primary content excludes Treasury balances, Payables and unrelated cash history. Filing/remittance actions reuse the existing controlled modal and RPCs.

Output VAT uses the existing server monthly tax-document facts. Eligible Input VAT uses current reviewed Input VAT facts; pending evidence is shown separately. The displayed estimate is output VAT minus reviewed eligible Input VAT. Customer-payment WHT credit remains separate from outgoing confirmed withholding. Outgoing withholding sources are deduplicated across PND3/53 review pools, including sources whose recipient classification still requires review. Annual figures sum the same twelve monthly periods; unavailable net VAT is never converted into zero.

Existing limitation preserved: the server explicitly reports `input_vat_complete=false` and blocks VAT filing readiness. Reviewing external evidence does not bypass this contract or make VAT ready to file. Likewise, typed-name Company payments can produce actual WHT while recipient tax classification is still unresolved; the amount remains visible, with filing review required. This task does not add a new classification or input-coverage certification workflow.

Deadlines reuse Migration 054's reviewed, versioned form/channel/period rules and holiday/extension handling. No statutory date is seeded or hard-coded. Unknown coverage shows calendar review required. Online dates are kept distinct from paper filing snapshots.

External Input VAT uses two append-only, RLS-protected tables: evidence and review history. Creation records invoice facts and the fixed funding source `third_party_no_reimbursement`; creation means pending review. Eligible review synchronizes through the existing immutable tax-source/fact pipeline. Subsequent ineligible/pending reviews supersede the tax facts. Existing financial records are not backfilled or modified. No expense, reimbursement, Payable, payout, Treasury or Cashbook transaction is created.

## Exact release files (42)

- `app/finance/tax-position/external-input.tsx`
- `app/finance/tax-position/filings/page.tsx`
- `app/finance/tax-position/filings/workspace.tsx`
- `app/finance/tax-position/page.tsx`
- `app/finance/tax-position/period-data.ts`
- `app/finance/tax-position/shared.ts`
- `app/finance/tax-position/tax-home.module.css`
- `app/finance/tax-position/tax-home.tsx`
- `docs/tax-064-privilege-resolution.md`
- `docs/tax-filing-064-manual-gate.md`
- `lib/i18n/catalog.ts`
- `lib/i18n/messages/tax-home.ts`
- `lib/i18n/messages/tax-position.ts`
- `scripts/sql/capture_post063_baseline_for_064.sql`
- `scripts/sql/dry_run_external_input_vat.sql`
- `scripts/sql/preflight_external_input_vat.sql`
- `scripts/sql/verify_external_input_vat.sql`
- `scripts/tests/fixtures/tax-064-pre-security.sql`
- `scripts/tests/tax-064-baseline-capture-postgres.test.cjs`
- `scripts/tests/tax-064-baseline-capture.cjs`
- `scripts/tests/tax-064-baseline-capture.test.cjs`
- `scripts/tests/tax-064-build-contract.cjs`
- `scripts/tests/tax-064-dependency-audit.cjs`
- `scripts/tests/tax-064-dependency-audit.json`
- `scripts/tests/tax-064-dependency-audit.test.cjs`
- `scripts/tests/tax-064-gate.cjs`
- `scripts/tests/tax-064-historical-artifacts.cjs`
- `scripts/tests/tax-064-privilege-resolution.cjs`
- `scripts/tests/tax-064-privilege-resolution.json`
- `scripts/tests/tax-064-privilege-resolution.test.cjs`
- `scripts/tests/tax-064-reconcile-capture.cjs`
- `scripts/tests/tax-064-reconcile-capture.test.cjs`
- `scripts/tests/tax-064-reconciliation.json`
- `scripts/tests/tax-064-scoped-contract.json`
- `scripts/tests/tax-064-scoped-gate.test.cjs`
- `scripts/tests/tax-filing-ui.test.cjs`
- `scripts/tests/tax-simple-artifacts.cjs`
- `scripts/tests/tax-simple-browser.cjs`
- `scripts/tests/tax-simple-catalog.json`
- `scripts/tests/tax-simple-postgres.test.cjs`
- `scripts/tests/tax-simple-ui.test.cjs`
- `supabase/migrations/202607180064_add_external_input_vat_evidence.sql`

Applied migrations, existing Company/Reimbursement payment code and unrelated untracked files are untouched.

## Database functions

- Existing `tax_position_source(text,uuid)` renamed to `tax_position_source_before_external_input(text,uuid)` and wrapped; every prior source type delegates unchanged.
- New `save_finance_external_input_vat(uuid,jsonb,boolean)` — authorized, acknowledged, idempotent document creation.
- New `review_finance_external_input_vat(uuid,uuid,uuid,text,text,boolean)` — append-only review, stale-review protection and existing tax synchronization.
- New `get_finance_tax_input_evidence(date)` — authorized period evidence read.

All other existing financial function definitions are preserved. Existing tax-source/date-basis checks are extended solely for the new external evidence source. Table writes remain private to the controlled RPCs.

## Original product validation (preceding task)

- 3 candidate DB tests: external evidence/review/retry/permissions/immutability/no cash; actual Company WHT 90 with cash 2,910 exactly once; exact catalog/function preservation and rollback-only gate.
- 8 focused existing DB regressions: filing/remittance exactly once, reviewed calendar and holidays, Company cash/bank payment and reimbursement cash/bank guards.
- 23 targeted UI/data tests: period aggregation, annual totals, credit separation, pending evidence, deduplication, existing VAT readiness and filing contract.
- Local browser: TH/EN at 390 and 1440; Month/History/Year; 12-month navigation; external save/review; filing modal; no overflow. All external network requests blocked; no Production UAT.
- Targeted ESLint, TypeScript, production build and diff check.

The local database is synthetic PGlite. A passing local gate does not assert the Production catalog matches; the operator must run the preflight against the intended database.

## Historical manual gate — completed by operator

The original synthetic whole-catalog gate is obsolete. Use the dependency-scoped contract and explicit security decision in `docs/tax-064-privilege-resolution.md`. The 490 broader differences remain unresolved evidence; this gate does not endorse them.

Current candidate SHA-256: `6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e`.

From the repository directory, the **only next step** is:

```sh
node scripts/tests/tax-064-gate.cjs print-preflight | pbcopy
```

The wrapper verifies the exact candidate/artifact bytes before copying SELECT-only SQL. Paste it into the Production SQL editor and save the full result. No Production SQL was run in this task. Where psql is installed and VP_DATABASE_URL is securely configured, `node scripts/tests/tax-064-gate.cjs preflight --baseline /private/tmp/tax064-security-preflight.json` performs the same check in a read-only connection and saves the JSON result without overwriting a prior capture. Require PASS, empty differences and all effective-security checks true. New Preflight captures current business hashes; it does not claim historical invariance before that capture.

The regenerated rollback-only rehearsal is `scripts/sql/dry_run_external_input_vat.sql`. It commits only a read-only baseline transaction, then starts a separate transaction containing the exact candidate DDL, verifies the allowed delta and protected rows, and ROLLBACKS all candidate DDL. It subsequently verifies the restored pre-migration contract and rows. No sample business transactions are included. Production rehearsal/apply are **not authorized by this task**.

After a separately authorized manual apply, the SELECT-only verifier must receive the same saved evidence:

```sh
node scripts/tests/tax-064-gate.cjs verify --baseline /private/tmp/tax064-security-preflight.json
```

The verifier fails closed if baseline evidence is absent, the candidate differs, historical row hashes change, or scoped catalog/security differs. Run the manual gate during a quiet interval; legitimate concurrent business writes must be investigated rather than ignored. Return operator results before authorizing frontend release.

## Human UAT after manual gate and authorized release

1. เปิดทั้งสองเส้นทาง เลือกเดือนที่มีข้อมูลจริง ตรวจ VAT ขาย/ซื้อ/WHT และวันยื่นกับรายการต้นทางและปฏิทินที่ตรวจแล้ว; วันที่ไม่ทราบต้องไม่เดา
2. เปิด WHT ที่หักจริง ตรวจผู้รับ ค่าใช้จ่าย ยอดก่อนหัก WHT และเงินจริงออก; รายการที่ยังไม่จัดประเภทต้องไม่แสดงว่าพร้อมยื่น
3. บันทึกเอกสารภาษีซื้อที่บุคคลอื่นชำระแทนและไม่ขอคืนเงินด้วยเอกสารจริงที่ได้รับอนุญาต ตรวจสถานะรอตรวจ → ใช้เครดิตได้/ใช้ไม่ได้ และยืนยันว่าไม่มีรายการรอจ่ายหรือ Cashbook เพิ่ม
4. เปิดประวัติครบ 12 เดือนและสรุปปี เทียบยอดกับรายละเอียดเดือนนั้น; เครดิต WHT ลูกค้าต้องแยกจากภาษีนำส่ง และยื่นแล้วต้องไม่ถูกแสดงเป็นชำระแล้ว
5. ตรวจ TH ที่ 390/1440 และ EN; ทดลองบันทึกยื่น/นำส่งเฉพาะเหตุการณ์จริงที่อนุมัติแล้วตามกระบวนการเดิม ห้ามใช้ธุรกรรมทดสอบใน Production

For a SQL-editor Post-Apply Verifier after separately authorized manual apply, save the complete passing Preflight JSON to `/private/tmp/tax064-security-preflight.json`, then export the verifier with that exact baseline:

```sh
node scripts/tests/tax-064-gate.cjs print-verify --baseline /private/tmp/tax064-security-preflight.json | pbcopy
```

This is preparation only; no dry-run/apply or Production SQL execution is authorized in this task.

## Final release validation

- 21 focused PostgreSQL tests PASS (in-memory only), including unchanged Company/Reimbursement cash/bank behavior, idempotency, tax filing readiness/remittance, and External Input VAT no-cash invariants.
- 16 targeted UI/static/gate tests PASS.
- Browser smoke PASS: TH/EN at 390px and 1440px; Month/History/Year, evidence creation/review with local synthetic RPCs, existing filing modal, no overflow or external network requests.
- Targeted ESLint, npx tsc --noEmit, npm run build, artifact/hash validation and git diff --check PASS.
- Applied 064 SHA-256 is unchanged. No Production SQL or business-data mutation was performed for release.
- Known non-blocking limits: broader 490 baseline differences remain unresolved outside this dependency gate; VAT readiness still requires complete Input VAT evidence; some confirmed outgoing WHT requires recipient classification before filing.
