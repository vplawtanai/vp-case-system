# Company Expense Review: Candidate 059

## Release Gate

Not applied by the agent. Do not push/deploy the dependent frontend until a human
runs the preflight, rollback-only rehearsal, Migration 059 and post-apply verifier.
Compare upstream evidence hashes before/after. Never change applied 001-058.

- `scripts/sql/preflight_company_expense_tax_review.sql`
- `scripts/sql/dry_run_company_expense_tax_review.sql`
- `supabase/migrations/202607180059_simplify_company_expense_tax_review.sql`
- `scripts/sql/verify_company_expense_tax_review.sql`

## Six Changes Only

1. First normal, non-personally-paid Company approval/tax/settlement notes may be
   empty. Rejection, historical personal reimbursement, Claim, tax corrections,
   authority overrides and actual-withholding exceptions still require reasons.
   Empty notes remain empty, including automatic tax-source revision evidence.
2. `company_expense_tax_calculation` is the single PostgreSQL calculation for the
   read-only preview and saving review. None/inclusive/exclusive VAT, rates 0/7;
   standard outgoing WHT choices 1/3/5. No supplier/category tax inference.
3. None means input VAT is not applicable (existing stored `ineligible` value).
   Eligible input VAT requires the existing seller/document/company-name evidence.
   Pending or ineligible credit does not require irrelevant document metadata.
4. WHT is calculated on the reviewed before-VAT amount. Company-paid WHT requires
   explicit actual-withholding acknowledgement, evidence note and existing known
   tax-identified supplier. Confirmed payment without WHT can never be rewritten
   as a withholding event. No new payee creation/selection workflow is added.
5. The creator's `finance_expenses.gross_amount` stays immutable. Review evidence
   stores `schema_version: 2`, exact `raw_input` and server `calculation` in the
   existing `request_json`. Read documents expose `declared_gross_amount` and the
   reviewed `gross_amount`. Settlement uses that same reviewed gross. Existing
   Payable/payout/Tax/Cashbook posting functions then consume existing columns.
6. WHT must be resolved before an accepted Company expense payout. Structured
   payout withholding must match its frozen tax decision. Input-credit metadata
   can remain pending while monetary review completes; it remains in the tax queue.
   The existing submitted custodian cash-fact path and Claim contracts are retained.

## Safety Boundaries

No data backfill, cash posting, number allocation or Production mutation during
migration. No changes to create, categories, request submission, Supplier setup,
account authority, payout confirmation, Cashbook posting or Claim forms.
The expense/payout locks, exact retries, filing-source lock, RLS and audit trail
remain. Once settlement exists, its gross is immutable; confirmed cash/WHT is
also immutable. Tax metadata can be corrected with a reason without repricing it.
Client-supplied calculated amounts are overwritten; legacy payloads cannot inject
structured totals. New private functions are not browser-executable. Only the
permission-checked, read-only preview is granted to authenticated users.

## Fixture Expectations

Declared 300: no VAT = 300; inclusive 7% = 280.37 + 19.63 = 300;
exclusive 7% = 300 + 21 = 321. WHT 3% of 300 = 9, net cash = 312.
One Payable 321, one confirmed Cashbook outflow 312, one outgoing WHT obligation 9.
No eligible input-VAT fact without the required document evidence. Eligible VAT
creates 21 once. Invalid/stale preview cannot enable approval.

## Human UAT After Release

Review a test Company item: select VAT treatment and WHT explicitly; check the
live summary, then normal approval without a note. Rejection requires a reason.
Toggle input-credit eligibility and inspect the disclosed fields. Test paid and
unpaid paths without inventing retrospective withholding. After successful human
UAT, freeze Company Expense; no additional feature scope is included here.
