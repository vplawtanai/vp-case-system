# Expense / Purchase & Settlement Foundation

Status: the business owner confirmed manual Production apply of Migration 055 and post-apply verification PASS, with empty failed checks, function differences and catalog differences. Repository finalization and frontend deployment are authorized; Production business writes are not.
Repository: `/Users/paolawyer/vp-case-app/vp-case-web`; branch `main`.
Baseline HEAD: `1bb4f7f4380b670986881153da7fdc0cb3a75bfb`.

## Focused Existing-System Audit

| Existing contract | Finding | Decision |
| --- | --- | --- |
| `app/finance/expense-claims/page.tsx` | Employee claims and Finance approval/payment use the legacy claim and company-ledger path. | Leave the route and code unchanged. Add separate routes. |
| Migration 048 payable entitlements | Immutable rights are tied to finalized Revenue Distribution components. | Do not insert supplier/reimbursement liabilities into this table. |
| Migration 051 Payout | Payout choices/allocations require an entitlement; Cash uses `source_payout_id`; WHT has source-line identity. | Add an exclusive Expense source branch to the existing parent/allocation/Cash/WHT engine. |
| Migration 049 Treasury | Account visibility and existing broad Finance controls exist, but no four-right canonical-user custodian grant. | Add account-scoped authorities; reuse the existing balance formula and cutover guards. |
| Migrations 050/053 Tax | Existing tax-source revisions and current monthly facts distinguish knowledge from allocation coverage. | Feed reviewed Input VAT once; retain unknown whole-period Input/net VAT. |
| Finance sidebar | Working desktop rail, 220ms reveal, mobile drawer, reduced-motion support. | Preserve the shell; change only role-aware Finance children/grouping and receiving-document accordion. |

The original Legacy claim table DDL is not in the tracked migration chain. The bridge uses the existing page's actual columns, locks the canonical `id::text`, and preserves the raw source in audit. No guessed UUID foreign key is added to Legacy. Preflight checks the referenced columns, guards, upstream functions and unused namespace before any apply.

## Three Independent Axes

1. Expense facts: date, description/category, supplier reference, optional client/case/advisory, THB gross, claimant/personal-payment facts, requested reimbursement, creator and review history.
2. Tax: append-only Finance-reviewed VAT/WHT facts, separate eligibility, explicit rate/base, server-calculated amounts, document metadata and reviewer/reason.
3. Settlement: explicit decision and, only if necessary, a payable obligation. Company cash moves only through confirmed Payout.

`finance_expenses` covers company purchases, employee claims and explicitly bridged Legacy claims. No fake employee claim is required for a direct purchase. Facts progress `draft -> submitted -> accepted/rejected`; only Draft facts may change. Submission freezes them. A rejected, already-paid factual purchase does not erase actual Cash history.

New tables: `finance_expenses`, `finance_expense_tax_reviews`, `finance_expense_settlements`, `finance_expense_obligations`, `finance_expense_obligation_waivers`, `finance_expense_audit`, `finance_treasury_account_authorities`, `finance_treasury_authority_audit`.

No customer document number counter is introduced. Full `EXP-<UUID>` identity is stored; the UI uses an eight-character short reference and full-ID links.

## Human Workflows

| Scenario | Workflow | Cash / tax boundary |
| --- | --- | --- |
| Direct company purchase | Create facts, submit, Finance accept, review tax, choose settlement. | Acceptance alone creates no Cash. |
| Unpaid supplier | Accept facts; choose supplier and full obligation; prepare Payout. | No Cash or outgoing WHT until explicit confirmation. |
| Employee claim | Own Draft, edit, save, submit; Finance accepts/rejects. | Employee supplies only facts and simple tax awareness, not eligibility/rate. |
| Personal payment / reimbursement | Finance sets approved reimbursement amount and canonical claimant Payee. | May be less than original gross; payable summary uses approved amount. |
| Personal payment / no reimbursement | Explicit noncash disposition and reason. | No payable, company Cash, revenue, capital or owner-funding inference. |
| Later reimbursement waiver | Explicit reason + acknowledgement, retaining original obligation and waiver event. | Blocked by an active Payout Draft or confirmed allocation; never deletes/fakes payment. |
| Already-paid company bank / Office Cash | Atomic minimal Expense + submitted facts + settlement + confirmed Payout/Cash. | No fake payable; tax remains pending. Existing opening/cutoff guards still apply. |

The Expense source currently settles one full approved obligation per Payout. Partial reimbursement approval is supported; partial installments against an already-approved obligation are not a new lifecycle in this phase. Revenue Payout retains its existing multi-component workflow.

Case/advisory choices use the existing RLS-scoped readers and stored client relationship. The backend validates exact client context and the one-matter rule. No mandatory attachments or upload store is added.

## VAT / WHT

VAT states are `pending`, `none`, `exists`. Eligibility is independently `pending`, `ineligible`, `eligible`. No category/name/payment-method inference. VAT is calculated on the server and must reconcile exactly to Expense gross.

Eligible review requires company-name status, supplier tax ID, document reference/date and explicit review reason. It creates a revision through the existing `tax_position_sync` contract. A latest-review duplicate supplier-tax-ID/document/date is blocked. One Expense is the whole-document review unit; multi-line input document splitting is not introduced. Later review revisions supersede prior facts instead of duplicating current VAT. Payment/reimbursement does not re-materialize it.

Tax Position displays `reviewedInputVat`; frozen monthly facts add `reviewed_input_vat` and `reviewed_input_sources`. This subtotal does NOT assert completeness of all company purchases. `input_vat_complete=false`, `input_vat=null`, `net_vat=null` remain truthful. Filing allocation/lifecycle, remittance and deadline logic are unchanged. No automatic Filing Draft or filing allocation is created. The pending-Input-VAT action links to `/finance/expenses?tax=pending`.

Expense WHT review is only preparation. An actual-withholding selection plus explicit payment confirmation creates the existing outgoing WHT obligation. Net Cash = approved gross minus actual WHT. Supplier tax identity, rate/base and source evidence are required. A person who already paid the supplier in full cannot retroactively create withholding through reimbursement; the review flags an exception instead. Late review after a zero-WHT payment also preserves that exception.

## Multi-Source Payables / Payout

The queue reads Revenue Distribution rights, employee reimbursement and supplier liabilities from their original domains. It does not duplicate them into a competing liability store. Canonical source IDs and payee IDs, not display names, identify items. Pagination completes before totals; currencies remain separate. The Expense detail uses the existing `finance_payouts`, `finance_payout_allocations`, outgoing WHT and source-linked Cash tables.

`source_model` distinguishes `revenue_distribution_v1` and `expense_v1`. An allocation has exactly one entitlement OR Expense source. Original revenue functions are retained as private delegates; their existing tests still run. The old entitlement editor cannot reinterpret an Expense Payout. Expense payment history is visible on its source detail.

Preparation freezes Expense/settlement/tax/obligation choices. Confirmation rechecks source equality, payee version/destination, account authority, active account, opening/cutoff and explicit acknowledgement under locks. One allocation, one Cash leg, actual WHT, source audit and Payout audit commit atomically. Deferred constraints reject inconsistent financial/audit relationships. Retry cannot add another Cash leg. Expense approval, personal payment and waiver never update Treasury balances.

Payee and destination management reuses the existing canonical Payee workflow. Expense-review permission alone does not grant Payee-master/Payout-manager powers. An authorized payment operator/Admin must register an absent canonical payee or destination through that existing workflow. Immediate already-paid purchases may retain supplier name/reference without inventing a payee master.

## Account Custodian / Permissions

| Authority | Granted scope |
| --- | --- |
| Employee | Existing submit permission; own Draft/edit/submit/status. No other claims, tax review or company payment authority. |
| Finance | Existing active non-partner/non-viewer expense-approval permission; authorized review, settlement and obligations. Tax review also requires existing tax-management authority. |
| Partner | Read-only Expense visibility; no new mutation power. |
| Admin | Controlled management and versioned account-grant changes with reason/audit. |
| Custodian | Explicit canonical user + bank/Office Cash rights: balance, movements, record outflow, confirm outflow. No cross-account access, Opening management or tax/master grant. |

No account rights are seeded by the migration. Existing broad payment-management + Treasury visibility remains an authorized Finance path. Assigned-only users receive limited Expense/account access and can confirm Finance-prepared payments without re-deciding tax. A custodian can record an actual already-paid purchase from the assigned account with tax pending.

New raw tables have RLS enabled and no browser/anon SELECT or write grants. Scoped SECURITY DEFINER readers expose authorized records; mutations are controlled RPCs. All private helpers and renamed delegates are revoked from browser roles. Admin-only raw JSON remains collapsed; employee/Finance audit display uses readable event/actor/time. Existing Opening RLS and lifecycle are not widened. Backend checks remain authoritative even when navigating directly or calling RPCs without the UI.

## Legacy Bridge / Future Cutover

Only an explicitly selected submitted/approved, unpaid and unlinked Legacy claim is eligible. The bridge locks that source, preserves its evidence, uses a unique canonical Legacy ID and is idempotent. It creates a submitted Expense, not a payable/payment. Any already-paid or ledger-linked Legacy claim is blocked. An opted-in source is protected against subsequent Legacy payment/update/delete and duplicate ledger linkage; unbridged Legacy remains operational.

No bulk migration, global cutover, disabling Legacy, reposting old paid rows or Ledger/Compensation entries occurs. A future approved cutover must first reconcile opted-in sources and outstanding obligations, then separately disable new Legacy creation/payment while keeping history readable. This foundation does not perform that step.

## UI / Final Finance IA

- Income: Quotations; Fee Agreements; Non-Quotation Charges; Invoices; Payments; receiving-document accordion with Receipt / Combined / Tax Invoice.
- Expenses: Purchases / Company Expenses; new Employee Expense Claims; Payables.
- Money: Treasury.
- Tax: Tax Position.
- Legacy: original Expense Claims; Lawyer Compensation; original income/expense ledger.

Routes: `/finance/expenses`, `/new`, `/[id]`, `/claims`, `/claims/[id]` beneath that prefix. The dynamic claim ID route handles `new` as the own-claim Draft form. There is no Cash Advance route/menu/schema.

The five reference images guide summaries, density, amounts, form rhythm, source badges, review sidebar and queue selection. Differences are intentional: real statuses only, no fabricated account availability/history, no mandatory uploads, existing VP shell, existing revenue payout groups, and Finance acceptance before tax/settlement controls. Mobile forms stack and rows become readable cards. Primary actions remain explicit and acknowledgement-gated.

## Prepared Files

Application:
- `app/finance/expenses/{layout,page,forms,workspace,admin-tools}.tsx`
- `app/finance/expenses/{shared,data}.ts`, `expenses.module.css`
- `app/finance/expenses/new/page.tsx`, `[id]/page.tsx`, `claims/page.tsx`, `claims/[id]/page.tsx`
- `app/finance/payables/{page,groups,multi-source}.tsx`
- `app/components/AppTopNav.tsx`
- `app/finance/FinanceSidebar.tsx`, `finance-navigation.ts`, `finance-sidebar.module.css`
- `app/finance/tax-position/{dashboard-data,shared}.ts`, `{dashboard,page}.tsx`, `filings/shared.ts`
- `lib/i18n/catalog.ts`, `lib/i18n/messages/{expenses,tax-position,tax-filings}.ts`

SQL/testing/documentation:
- `supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql`
- `scripts/sql/preflight_expense_purchase_settlement_foundation.sql`
- `scripts/sql/dry_run_expense_purchase_settlement_foundation.sql`
- `scripts/sql/verify_expense_purchase_settlement_foundation.sql`
- `scripts/tests/expense-foundation-{ui.test,postgres.test,browser,fixture,artifacts}.cjs`
- `scripts/tests/expense-foundation-catalog.json`
- `scripts/tests/payable-ui.test.cjs`, `payout-ui.test.cjs` (new IA/extracted renderer expectations; financial assertions retained)
- This architecture document.

## Validation / Operational Gate

Local-only validation uses synthetic in-memory PostgreSQL via PGlite, not a Production connection. Tests cover the required expense/tax/settlement matrix, privacy/permissions, account isolation, stale preparation, duplicate VAT, old entitlement payout, retry, forced audit failure and rollback. The catalog fixture derives exact function signatures/hashes, columns/constraints/indexes/policies and the Treasury view. Injected schema drift is reported as exact differences. Multi-session contention/load testing is not claimed by this in-memory suite.

Preflight and verifier are one SELECT statement and one result row, with named checks, `failed_checks`, exact function/catalog differences, upstream evidence hashes and row-count observability. No fixed mutable Ledger/Compensation count determines success. The rollback-only dry-run embeds the exact candidate, gates on preflight, runs the verifier and ends with ROLLBACK. It creates no business fixture data. Apply files never contain fixture IDs or company business rows.

Commands used:

```sh
node --test scripts/tests/expense-foundation-ui.test.cjs scripts/tests/payable-ui.test.cjs scripts/tests/payout-ui.test.cjs scripts/tests/tax-dashboard.test.cjs scripts/tests/tax-filing-monthly-facts.test.cjs
env PGLITE_MODULE_PATH=/private/tmp/vp-tax-filing-053-deps/node_modules/@electric-sql/pglite node --test --test-name-pattern='^055' scripts/tests/expense-foundation-postgres.test.cjs
node scripts/tests/expense-foundation-artifacts.cjs
node scripts/tests/expense-foundation-browser.cjs
npx tsc --noEmit
npm run build
git diff --check
```

Targeted ESLint includes all changed TS/TSX and test CJS files. Browser checks render the actual components/CSS with isolated fixtures, block external requests, and cover TH/EN at 390/768/1024/1440, keyboard, receiving-document accordion, drawer, all five flows plus Draft/confirmed states. No Production action is tested by clicking its actual UI.

All original migration files are compared against the pre-task SHA-256 baseline; tracked applied migrations and the Legacy claim page/sidebar shell are additionally compared against HEAD. Unrelated untracked diagnostics remain untouched.

The human apply/post-apply gate has passed. Retain the SQL files as the exact deployment evidence; do not reapply Migration 055. The operator reported all eight new Expense/authority tables empty, Cash rows 2, Opening rows 2, Legacy claims 246 and Legacy Ledger rows 323. These mutable counts are reported evidence, not hard-coded financial invariants.

**Next HUMAN UAT after verified deployment:** open Purchases / Company Expenses and verify the empty-state, then open the new form without saving or selecting the already-paid action. As an employee, inspect the own-claim form and absence of Finance tax/settlement decisions. Check Payables retains existing Revenue Distribution rights and Legacy routes remain available. Send screenshots before creating a first agreed test Draft. Later claim submission, Finance review, settlement, account assignment and payment confirmation require their own explicit human UAT actions; deployment performs none of them.

## Final Local Validation Record

- Applied artifact SHA-256: `518588ec6146c770f14c46b57484d512b5b3f709e21c179f1aed28df08bd1086`.
- Focused UI/read-model/Payables/Payout regression: 44/44 passed.
- Isolated PostgreSQL: 12/12 passed, including exact catalog and literal rollback-only rehearsal.
- Browser: 56 flow renders (7 flows x 2 languages x 4 widths), plus receiving-document keyboard/drawer checks and Expense-only Finance menu access; external requests: zero.
- Targeted ESLint, TypeScript, production build, tracked diff whitespace and new-file whitespace: passed.
- All 84 original migration files match the pre-task SHA baseline. Applied tracked migrations also match HEAD.
- 41 intended files (15 modified, 26 new). The 25 unrelated untracked files remain excluded from finalization.
- Validation uses no Production database connection, migration apply or business-data mutation. Deployment is limited to the validated repository commit.

Finalization screenshot directory: `/var/folders/jq/3xy92bf51ksff5n692600n9c0000gn/T/vp-expense-browser-qwsljL`. All five reference flows were compared visually; the existing VP shell and Revenue Payout presentation remain intentional differences. Forms, amount emphasis, review summary, source badges and narrow layouts passed the local fixture review.
