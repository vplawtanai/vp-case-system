# Employee reimbursement — candidate 061 manual gate

Status: MIGRATION REQUIRED — MANUAL PRODUCTION GATE. Working tree only; no commit, push, Production apply, deployment or Production UAT transactions performed.

## Architecture and contracts

Existing `finance_expense_requests` and child `finance_expenses` persist employee claims, including draft operations and client/case/advisory references. Existing settlements, employee reimbursement obligations, payout confirmation and Cashbook remain the payment engine. There is no existing attachment contract in this request foundation, so no attachment feature was added.

The creator is derived by the existing save RPC from `auth.uid()`. Newly entered personally paid amounts become requested reimbursement amounts. Finance may approve a positive amount up to the requested/personally paid amount; rejection keeps its required reason. A blank optional approval note receives a factual system approval reason to satisfy the existing audit constraint; the original optional note is retained in operation evidence.

Candidate 061 adds `review_finance_employee_reimbursement(uuid,uuid,integer,boolean,numeric,text)` and adds the `employee_reimbursement_review_supported` capability to `get_finance_expense_access()`. Approval and payable creation are atomic and retry-safe. The RPC uses the existing deterministic internal Payee identity (`id = profile_id = claimant_id`), provisioning only the claimant's name from the profile if missing. Existing Payee/destination data are not overwritten. It calls existing `decide_finance_expense_settlement` with `reimburse` and the approved amount. No tax review, payout, or Cashbook is created by approval.

Payment uses existing `prepare_finance_expense_payout` / `confirm_finance_payout`: company source account, actual paid date, actor acknowledgment and idempotency. The UI sends `p_actual_wht=false` for personally paid expenses. Cash does not need recipient bank information; bank confirmation retains the existing recipient-destination contract. Finance can maintain that destination in the existing Payee workspace. No new payment engine or tax calculations were added.

Migrations 057/058/059/060 remain byte-identical to HEAD. All 25 unrelated untracked files remain unchanged. No historical backfill, table, RLS or existing permission changes.

## Validation

- Isolated PostgreSQL: 7 tests PASS, including logged-in claimant, draft/reopen, one/multi items, optional contexts, full/lower approval, atomic rollback, exact retry, reviewer without payment authority, preserved Payee identity, cash/bank confirmation exactly once, no WHT deduction, historical read compatibility and unchanged payment functions.
- Candidate artifacts: SELECT-only Preflight and Verifier PASS; rollback-only rehearsal PASS; catalog and business evidence unchanged.
- Reimbursement browser: 31 scenarios PASS (TH 390/1440, EN 1440, statuses, create/edit/copy/delete, draft reopen, linkage, approval/rejection and lost-response retry); external requests blocked.
- Company regression: 24 core scenarios, 18 linkage scenarios and 9 partial-payment status scenarios PASS in fresh isolated browser runs. The combined core-plus-linkage run initially timed out; each suite passed independently.
- Targeted unit tests: 5 PASS. Targeted ESLint, TypeScript, build and diff check PASS.

## Manual Production gate

Run from the repository, with the operator's approved connection in `PRODUCTION_DATABASE_URL`:

```sh
psql "$PRODUCTION_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/sql/preflight_employee_reimbursement.sql
```

Require `employee_reimbursement_preflight_pass = true`, `failed_checks = []`, and empty function/catalog differences. Save `upstream_evidence_hashes`.

Next, manually run `scripts/sql/dry_run_employee_reimbursement.sql`. It embeds the exact candidate and ends in ROLLBACK; it runs no business UAT. Require verification PASS and unchanged evidence hashes. The candidate source deliberately has no transaction boundary so the rehearsal cannot commit it.

Only after operator approval, apply `supabase/migrations/202607180061_add_employee_reimbursement_review.sql` in one transaction (for psql, use `-1 -v ON_ERROR_STOP=1`). Then run `scripts/sql/verify_employee_reimbursement.sql`, require PASS and empty differences, and compare evidence hashes to Preflight. Do not deploy the frontend before this gate is complete.

After the manual gate, release only the listed files, verify the exact pushed commit and deploy it. No release was performed in this task.

## Human UAT after approved release

1. เข้าด้วยผู้ขอเบิก เปิด “เบิกคืนค่าใช้จ่าย” สร้าง 2 รายการที่จ่ายเอง 3,000 และ 850 บาท ตรวจว่าผู้ขอเบิกเป็นผู้ใช้งานปัจจุบัน และไม่มี VAT/WHT หรือบัญชีบริษัทในฟอร์มสร้าง
2. ลองไม่เชื่อมงาน / ลูกค้าอย่างเดียว / ลูกค้า + คดี / ลูกค้า + งานที่ปรึกษา บันทึกร่าง เปิดใหม่ ตรวจยอดและการเชื่อมโยง แล้วส่งตรวจ
3. Finance อนุมัติรายการแรก 3,000 บาทและรายการที่สอง 800 บาท ตรวจ Payables ว่าผู้รับคือผู้ขอเบิกและยอดรวม 3,800 บาท โดย Cashbook ยังไม่เกิดรายการ
4. ผู้จ่ายเลือกเงินสดหรือบัญชีบริษัท ระบุวันที่คืนเงินจริงและยืนยัน ตรวจว่าเงินจริงออกตามยอดอนุมัติ ไม่มีหัก WHT ซ้ำ และการยืนยันซ้ำไม่เพิ่ม Cashbook
5. ตรวจสถานะคืนเงิน รายการประวัติ และ Company Purchase เดิมใน TH มือถือ/เดสก์ท็อปและ EN โดยใช้รายการที่ผู้ทดสอบได้รับอนุญาตเท่านั้น

## Exact intended files (21)

- `app/finance/expenses/claim-request-form.tsx`
- `app/finance/expenses/claim-review.tsx`
- `app/finance/expenses/expenses.module.css`
- `app/finance/expenses/forms.tsx`
- `app/finance/expenses/request-modal.tsx`
- `app/finance/expenses/request-view.tsx`
- `app/finance/expenses/shared.ts`
- `app/finance/expenses/workspace.tsx`
- `app/finance/payables/multi-source.tsx`
- `docs/finance/employee-reimbursement-061-gate.md`
- `lib/i18n/messages/common.ts`
- `lib/i18n/messages/expenses.ts`
- `scripts/sql/dry_run_employee_reimbursement.sql`
- `scripts/sql/preflight_employee_reimbursement.sql`
- `scripts/sql/verify_employee_reimbursement.sql`
- `scripts/tests/employee-reimbursement-artifacts.cjs`
- `scripts/tests/employee-reimbursement-browser.cjs`
- `scripts/tests/employee-reimbursement-catalog.json`
- `scripts/tests/employee-reimbursement-postgres.test.cjs`
- `scripts/tests/expense-request-browser.cjs`
- `supabase/migrations/202607180061_add_employee_reimbursement_review.sql`
