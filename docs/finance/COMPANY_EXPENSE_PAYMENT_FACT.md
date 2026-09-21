# Company Expense Payment Fact (057/058)

Scope: `/finance/expenses`, creator declaration and the existing inline Finance review. No new Item Type, settlement architecture, payment path or navigation change.

## Current Two-Flow Contract (058 Candidate)

- New Company items offer only `company_paid` and `unpaid`. Neither requires a Treasury account in Create. An unselected fact remains NULL, may be saved as an incomplete Draft, and blocks UI Submit until explicitly chosen. Personal payment links to Employee Claims.
- 057's private save core required `expense_can_manage()` or `expense_account_allowed(bank, cash, 'record_outflow')`. The 056 request wrapper also required Finance or account-record permission. These guards conflated declaration entry with payment authority.
- 058 replaces only `get_finance_expense_access`, `save_finance_expense_before_requests` and `save_finance_expense_request`. `can_create_company` reuses existing authorized active expense submitters (`expense_can_claim()`), Finance and existing account recorders. Ownership, active-role checks, personal-payer restrictions, private function grants, RLS, validation, audit and idempotency remain intact. `can_record` and `can_confirm` do not gain broader meanings.
- `company_declaration_without_account_supported` gates the two-choice editor and account-free capture. Older backends retain their compatible editor. No new columns, Draft account/payment instruction, Draft due-date storage, historical update or backfill is added. Existing request-entry account evidence is not reused as payment evidence.
- Paid Review displays the creator's fact read-only. Finance chooses bank/cash channel through the existing settlement RPC, then selects the real account/date in the unchanged `ExpensePaymentPanel`. Preparation and explicit acknowledged confirmation remain separate from item approval. Existing record/confirm account authority, opening/cutover and idempotency guards remain authoritative. No Supplier obligation is created for this path.
- Unpaid Review fixes the existing `supplier_unpaid` path, requires an eligible external Supplier and allows an optional due date. Approval creates one existing Supplier obligation, not a cash movement. Supplier bank details may remain absent until payment preparation requires them.
- VAT/WHT awareness, tax review and payment declarations remain separate. Pending VAT does not rewrite the paid fact. The existing payment contract can record a company-paid outflow with pending tax; no tax calculation or withholding rule is changed.
- Historical personal/unknown/NULL rows are not rewritten. Their original review paths remain available; duplicating a personal/unknown item creates a new incomplete two-choice item, not a new hidden personal flow. Claim identity, submission, review and payment handlers are unchanged. Existing Supplier filtering, setup, duplicates and optional bank UX are retained.

## 058 Operator Sequence and Deployment Gate

Status: prepared and tested locally only. Do not apply automatically or push/deploy the frontend before the human reports Production 058 verification PASS. A Git push may trigger deployment.

Artifact SHA-256:

- 057 unchanged: `bf1ce95d7216b0de44b512e03f9acb40c62f2b1d59ccad8a9e5d84dc5169379a`
- 058 candidate: `fe7eb2a35353a60e71d27385ec083391247ca56e77f5f8756d7baf0671792df7`

Run these steps manually, stopping on any failed check or catalog/function difference:

1. Copy/run SELECT-only preflight: `pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_company_expense_two_flow.sql`. Require `company_expense_two_flow_preflight_pass = true`, empty `failed_checks`, `function_differences` and `catalog_differences`. Retain `upstream_evidence_hashes` as the pre-apply baseline.
2. Copy/run the WHOLE rollback-only rehearsal: `pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/dry_run_company_expense_two_flow.sql`. It embeds byte-identical 058, verifies protected rows/functions/catalog, executes no business fixtures, and ends in ROLLBACK. Require `company_expense_two_flow_verification_pass = true`, no differences, and `rehearsal_baseline_available = true`. Do not omit ROLLBACK.
3. Recalculate `shasum -a 256 supabase/migrations/202607180058_fix_company_expense_declaration_authority.sql` and compare with the candidate hash above. After the rehearsal passes, copy/apply only `pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202607180058_fix_company_expense_declaration_authority.sql`.
4. Copy/run SELECT-only post-apply verification: `pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_company_expense_two_flow.sql`. Require `company_expense_two_flow_verification_pass = true` and empty failed checks/catalog/function differences. Compare `upstream_evidence_hashes` with step 1 in a quiet write window. Standalone verification cannot reconstruct the pre-apply baseline, so its `rehearsal_baseline_available = false` is expected; it does not by itself prove historical rows unchanged. Investigate differences, do not substitute global count checks.
5. Return the human Production PASS result before releasing the frontend commit. No Production request, approval, Supplier obligation or Cashbook operation is part of this migration verification.

## Original 057 Contract Audit (Historical)

- 055 `finance_expenses.personally_paid` and `claimant_id` preserve personal-payer facts, but cannot represent unpaid/company-paid/unknown independently. 056 request input audit is not a reliable typed per-item read contract. Account-entry context is permission evidence, not proof of payment.
- 057 adds nullable `creator_payment_fact`: `unpaid`, `company_paid`, `personal_paid`, `unknown`. Existing rows remain NULL; no backfill. Personal declaration requires the existing personal-payer facts. Contradictory unpaid/company-paid plus `personally_paid` is rejected.
- Only the private `save_finance_expense_before_requests` core and `get_finance_expense_access` change. Public 055/056 signatures, permissions, request idempotency, audit and submission guards are retained. Older callers omitting the field preserve its prior value. Claims keep NULL.
- Existing whole-row immutability guards preserve the declaration after submission. Existing document readers include it through `to_jsonb(e)`. Save/submit do not create settlement, obligations, tax decisions, WHT liability, Payout or Cashbook.

## Money and Payee Review

- Creator input is read-only and explicitly described as a declaration, not payment evidence. NULL/missing is displayed as unavailable, distinct from the creator explicitly selecting unknown. Nothing is inferred from category, account entry, supplier, timestamps or Payout.
- `finance_expense_settlements` remains authoritative. Only `supplier_unpaid` and `reimburse` create `finance_expense_obligations` through the existing decision RPC. Bank/cash instructions do not create an obligation or cash movement; actual Payout confirmation is still separate.
- Unpaid recommends Supplier Payable; known personal payer recommends reimbursement. Company-paid allows bank/cash channel review, never Supplier Payable. Unknown requires an explicit supported decision. No bank/cash choice is inferred.
- Historical `personally_paid` remains authoritative for which settlement modes are legal. An unknown/non-personal submitted row cannot be converted into personal reimbursement in this screen. Correcting that submitted source is outside this additive migration; do not fabricate a payer or override the existing guard.
- The former dropdown called `get_finance_expense_parties`, which returns all active `finance_payees` as ID/name/profile ID. Its Supplier mode did not filter internal employees. That explains how an employee such as Pam could be offered; it does not establish the actual Production population. No Production query was performed.
- 051 guarantees external payees have NULL `profile_id`; internal payees have their exact profile ID. Supplier candidates now exclude unrelated internal employees. Reimbursement candidates match only the submitted claimant. Known usable IDs are read-only; missing/ambiguous recipients block that path.
- Missing recipients reuse the unmodified Payout `PayeeModal` and `save_finance_payee`. Internal setup uses the exact existing person ID; external setup is explicit. Existing `payout_can_manage` permission is enforced by the RPC, which is stricter than Expense review permission. Denial is surfaced; no permission is widened. Read-back failure offers refresh, not another automatic creation.
- An unusable pre-existing supplier ID cannot be replaced on a submitted item. Its existing register entry must be reviewed separately. There is no name-based ID match or auto-creation.

## Tax and Approval

- Creator VAT/WHT awareness is not a Finance decision. No-tax requires explicit acknowledgement and uses the existing tax-review RPC with VAT none, eligibility ineligible (displayed as not applicable), WHT none.
- VAT-present retains eligible/ineligible/pending and existing evidence fields. WHT none/applicable uses the existing base/rate controls. No classification/name-derived tax inference.
- Approval requires a supported money decision, the required usable recipient and amount, resolved VAT/WHT, required VAT evidence, and review reason. Only missing decisions appear. Prior-payment WHT exceptions remain blocked, not retrospectively withheld.
- The backend requires acceptance before tax/settlement. This UI therefore validates planned decisions before accepting, then calls existing approval, tax and settlement RPCs in sequence. This is not a new atomic backend operation. Failure can leave an accepted item with incomplete review; retries retain operation IDs and completed steps. The next item opens only after authoritative read-back is complete. An uncertain approval response requires read-back, not an invented success.
- A reviewer without tax-review permission cannot complete a new item requiring a tax decision in this combined UI. Use an appropriately authorized reviewer; no role/RLS changes are included.

## Original 057 Deployment Gate (Historical)

`access.creator_payment_fact_supported === true` enables four-choice capture. Before 057, the flag is absent: old compatible capture remains available and no unsupported field is sent by the editor. Money/payee/readiness improvements use existing 051/055/056 RPCs and can deploy safely before 057. Opening/reviewing the page performs reads only.

## Declaration Pipeline Regression (After 057)

- `ExpenseFactsForm.save` captures `creator_payment_fact` with the existing VAT/WHT awareness, claimant and reimbursement fields. Reopening an item in the same Create modal reads local `items` state; that alone does not prove a database save.
- `ExpenseRequestModal.save` passes those items to `save_finance_expense_request`. The 056 request RPC adds only origin and delegates to the unchanged 057 private save core. It stores the declaration in `finance_expenses` and links the exact expense ID in `finance_expense_request_items`.
- Request Submit calls the existing per-expense Submit core. It changes status/version/timestamps, not declarations. The submission audit captures the entire stored row. There is no separate submitted declaration snapshot/projection.
- Both request readers use `expense_request_document` -> `expense_document` -> `expense_document_before_requests` -> `to_jsonb(e)`. The application reader and workspace pass the item through directly to `CompanyItemReview`.
- Proven display defects: the former `creator_payment_fact || 'unknown'` fallback concealed missing values as an explicit unknown declaration; `tax_review` previously took precedence over creator VAT/WHT awareness in the same display. Missing now means unavailable, and creator tax awareness and Finance tax decisions have separate labels.
- Save/Submit now compare the actual server read-back with the submitted Company declarations, payer and requested amount. A mismatch stops the next step with a visible error. No local/audit fallback repairs, backfills or replaces the response. Claims and RPC payloads are unchanged.
- The 1,000 THB local fixture preserves unpaid 100, company-paid 200, personal-paid 300/requested 200, and unknown 400 through save, server reload, edit save, Submit, stored/audit checks and TH/EN Review rendering. Pre-057 readers are warmed before applying the exact 057 artifact; a separate authorized reviewer also reads the same facts. No financial consequence occurs.
- The reported Production loss was not reproduced from the repository contracts. Its exact upstream cause was not established without the affected read response. That earlier UI-only task did not create a speculative migration. The separately approved 058 above corrects declaration authority, not historical missing facts.
- Completed Company item cards show the declaration; personal payment includes the exact selected person and requested amount. Opening Edit/Add/Duplicate focuses and scrolls to the editor once, respecting reduced motion. Existing list, categories, approval gates, sequential review, Claims and payee rules remain unchanged.

## Original 057 Operator Sequence (Historical)

057 is now reported applied and verified by the business owner. Do not repeat these application steps for the UI-only declaration regression fix.

Do not run any migration automatically. Execute each step manually and stop on any failed check or catalog/function difference.

1. Run SELECT-only `scripts/sql/preflight_expense_payment_fact.sql`. Require `expense_payment_fact_preflight_pass = true` and `failed_checks = []`.
2. Run `scripts/sql/dry_run_expense_payment_fact.sql`. It embeds the exact candidate, captures upstream hashes, verifies the catalog/functions and ends in ROLLBACK. Require `expense_payment_fact_verification_pass = true` with no differences. No business fixture is executed in this script.
3. After explicit approval, apply only `supabase/migrations/202607180057_add_company_expense_payment_fact.sql`, matching the SHA-256 in the preflight/verifier and isolated manifest.
4. Run SELECT-only `scripts/sql/verify_expense_payment_fact.sql`. Require PASS, no differences and `no_historical_backfill = true` before creating any new item. The NULL check is an initial post-apply guard, not a permanent operational invariant.
5. Reload Company Expenses to acquire the capability flag. Human UAT can then verify four-choice capture, supplier/personal recipient context, tax review and approval readiness. Do not create or approve Production items merely to verify deployment.

The rollback rehearsal hashes all protected existing fields, excluding only the newly introduced nullable column. Existing stored audit, tax, settlement, obligations, Payout and Cashbook rows must remain unchanged. PostgreSQL and browser fixtures are synthetic/local only.
