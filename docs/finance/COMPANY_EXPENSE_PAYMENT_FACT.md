# Company Expense Payment Fact (057)

Scope: `/finance/expenses`, creator declaration and the existing inline Finance review. No new Item Type, settlement architecture, payment path or navigation change.

## Contract Audit

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

## Deployment Gate

`access.creator_payment_fact_supported === true` enables four-choice capture. Before 057, the flag is absent: old compatible capture remains available and no unsupported field is sent by the editor. Money/payee/readiness improvements use existing 051/055/056 RPCs and can deploy safely before 057. Opening/reviewing the page performs reads only.

## Declaration Pipeline Regression (After 057)

- `ExpenseFactsForm.save` captures `creator_payment_fact` with the existing VAT/WHT awareness, claimant and reimbursement fields. Reopening an item in the same Create modal reads local `items` state; that alone does not prove a database save.
- `ExpenseRequestModal.save` passes those items to `save_finance_expense_request`. The 056 request RPC adds only origin and delegates to the unchanged 057 private save core. It stores the declaration in `finance_expenses` and links the exact expense ID in `finance_expense_request_items`.
- Request Submit calls the existing per-expense Submit core. It changes status/version/timestamps, not declarations. The submission audit captures the entire stored row. There is no separate submitted declaration snapshot/projection.
- Both request readers use `expense_request_document` -> `expense_document` -> `expense_document_before_requests` -> `to_jsonb(e)`. The application reader and workspace pass the item through directly to `CompanyItemReview`.
- Proven display defects: the former `creator_payment_fact || 'unknown'` fallback concealed missing values as an explicit unknown declaration; `tax_review` previously took precedence over creator VAT/WHT awareness in the same display. Missing now means unavailable, and creator tax awareness and Finance tax decisions have separate labels.
- Save/Submit now compare the actual server read-back with the submitted Company declarations, payer and requested amount. A mismatch stops the next step with a visible error. No local/audit fallback repairs, backfills or replaces the response. Claims and RPC payloads are unchanged.
- The 1,000 THB local fixture preserves unpaid 100, company-paid 200, personal-paid 300/requested 200, and unknown 400 through save, server reload, edit save, Submit, stored/audit checks and TH/EN Review rendering. Pre-057 readers are warmed before applying the exact 057 artifact; a separate authorized reviewer also reads the same facts. No financial consequence occurs.
- The reported Production loss has not been reproduced from the repository contracts. Its exact upstream cause is not established without the affected read response. No Production access was performed and no speculative 058 was created. This change does not claim to restore facts already missing from a Production row.
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
