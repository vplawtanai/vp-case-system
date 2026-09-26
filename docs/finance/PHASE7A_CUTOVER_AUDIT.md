# Phase 7A — Legacy cutover audit, no Production execution

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`; branch `main`.
Inspected HEAD and local `origin/main`: `81c90a5e8632d3c087284d3a9634a38335032922`.
No network fetch/deployment inspection was needed for this audit. The user identifies this as the latest deployed commit.

All New Finance **transactional** data is UAT by the user's explicit declaration. Real Finance history is in the three Legacy modules. This does not authorize deleting account masters, configuration, shared entities, or files. No cutover date has been approved: **CUTOVER_DATE_REQUIRED = true**.

This report establishes repository facts and prepares a current-state Production read. It does **not** assert current Production row counts, outstanding amounts, or bank balances. Those require the manual audit result. The 490 broader unresolved catalog differences remain unresolved and are not accepted by this report.

## Artifacts and execution boundary

- `scripts/sql/audit_finance_cutover_phase7.sql`: one self-contained SELECT; no application RPCs, DML, DDL, temporary tables, sequence advancement or write locks.
- `docs/finance/PHASE7A_DATA_CLASSIFICATION.json`: complete table-level manifest, creation provenance, selected date/amount fields, row exceptions, retained views and file configuration.
- `scripts/tests/finance-cutover-phase7-audit.test.cjs`: focused static/coverage checks and opt-in isolated local PostgreSQL fixture validation. Its fixture writes are confined to a fresh synthetic database on the fixed `/private/tmp/vp-phase7a-local/socket`; it does not load project secrets or accept a remote connection string. Never paste this test harness into Production.

Run the audit SQL manually as the normal authorized SQL Editor `postgres`/BYPASSRLS role. A restricted role is reported as incomplete or fails on missing SELECT permissions; an inaccessible relation is never interpreted as an empty dataset. Missing required tables fail at parse time. Unknown `finance_*`/`document_*` relations are reported for classification rather than presumed disposable.

The result contains one `audit_result` JSON object. Per-table counts, date ranges, status/currency totals and SHA-256 row digests cover the manifest in one statement snapshot. Exact items are returned for outstanding Legacy obligations, anomalies and decisions; complete transaction snapshots are not dumped. Selected date columns can be absent on evidence/bridge tables: `date_column_present` and `rows_without_selected_date` make that explicit. Missing selected amount columns are blockers. `UNSPECIFIED` means no stored currency; it is never silently converted to THB. Header totals, child allocations, tax and cash are separate measures and must not be summed together.

## Complete classification summary

The manifest covers **122 public tables**: all **111** table families created by tracked repository migrations, plus four pre-existing Legacy tables, two shared Finance bank/access tables, and five shared core/audit tables. It also preserves five derived view definitions and both relevant storage buckets. All application code, schema, functions, constraints and permissions remain unchanged.

| Classification | Tables | Treatment |
| --- | ---: | --- |
| LEGACY_REAL_KEEP | 4 | `finance_expense_claims`, `finance_compensation_batches`, `finance_compensation_allocations`, `finance_company_ledger`; all statuses and history retained. |
| NEW_FINANCE_UAT_PURGE | 25 | Future cleanup candidates: document/source headers, expense/request headers, distributions/entitlements/payouts, cash/openings/transfers, tax periods/filings/remittances/external evidence. No deletion authorized in 7A. |
| DERIVED_PURGE_WITH_PARENT | 61 | Items, allocations, reservations/coverage, bridges, snapshots, reviews, tax facts/revisions, economic decisions, transfer legs and transaction audit. Only with verified UAT parent/dependency closure. |
| CONFIG_KEEP | 23 | Banks/access, cash locations, Treasury authority configuration/audit, company identities/signers, customer tax profiles/audit, document template/clause/variable/version libraries, numbering profiles, service patterns and Tax Calendar rules. |
| CONFIG_DECISION | 4 | `finance_document_counters`, `finance_payees`, `finance_payee_destinations`, `finance_payee_audit`. Keep until exact state/row decisions are approved; not blanket-purge tables. |
| SHARED_CORE_NO_TOUCH | 5 | `clients`, `cases`, `advisory_matters`, `user_profiles`, `case_audit_logs`. Shared identities, permissions and history remain. |

The machine-readable manifest enumerates every table individually. Configuration with test-like names is a review hint, not proof of disposability. UAT Client/Case/Advisory/People references are reported only as optional broader go-live decisions; no shared entity cleanup belongs to 7A.

Additional retained configuration lives in source code: `app/finance/compensation/formula-definitions.json`, `formula-calculation.ts`, `app/finance/payments/vp-formula.ts`, `lib/permissions.ts`. Frozen formula results inside individual UAT distributions remain transaction evidence, distinct from the reusable formula definitions.

`case_audit_logs` must never be purged wholesale. Entries whose `table_name` identifies Legacy remain real history. Only exact New Finance parent-linked entries are potential later derived cleanup candidates; all other shared audit entries remain untouched.

## Legacy storage and every repository write path found

All three pages use direct browser Supabase table DML. No separate API route/server action/RPC writer was found in the current `app`/`lib` search for these tables. All invoke `lib/auditLog.ts:createAuditLog`, which appends to shared `case_audit_logs`. UI permission helpers alone are not a backend write lock.

| Module | Storage | Current action / source |
| --- | --- | --- |
| `/finance/expense-claims` | `finance_expense_claims` | `app/finance/expense-claims/page.tsx`: create submitted claim (299–333); `updateClaimStatus` (350); approve (366), reject (383), void (405). No general claim deletion/edit workflow found. |
| Legacy claim payment | claims + `finance_company_ledger` | `markPaid` (418): reread claim; insert active Ledger expense with `source_expense_claim_id` (482); then set claim `paid`, `paid_at`, `ledger_entry_id` (499). Separate requests, not an atomic combined transaction. |
| `/finance/compensation` | `finance_compensation_batches`, `finance_compensation_allocations` | `saveDraft` (313): new batch or update draft; editing deletes allocations (339) and recreates them (390). `finalizeBatch` (415) validates formula then sets finalized. `voidBatch` (531) voids draft/finalized batch with no Ledger posting. |
| Legacy company-share posting | batches/allocations + Legacy Ledger | `postCompanyShare` (431): finalized batch → Ledger income → posted batch backlink. It uses **company share only**, bank `short_name=KBANK`, and posting-day date. Separate requests can leave partial-posting evidence. Custom formula with zero company share can legitimately be posted with no Ledger row. |
| Legacy individual paid flag | allocations | `markAllocationPaid` (546): sets `payment_status=paid`, `paid_at`, `updated_at`. It does **not** insert a Ledger outflow. UI permits marking a non-voided batch's individual allocation paid; draft vs finalized liabilities must be distinguished. |
| `/finance/ledger` | `finance_company_ledger` | `saveEntry` (415): edit active non-transfer entry (457), insert income/expense (500), or insert paired `transfer_out`/`transfer_in` sharing `transfer_group_id` (468–492). `voidEntry` (525) voids an entry or transfer group (542/555). No hard-delete action found. |

Claim statuses: submitted, approved, paid, rejected, voided. Audit reports exact submitted/approved items, separated totals and paid/source/backlink inconsistencies. It does not pay a claim again just because one side of the link is missing.

Batch statuses: draft, finalized, posted, voided. Audit lists unpaid non-company allocations, distinguishes draft proposals from finalized/posted obligations, excludes company-share allocations from individual outstanding totals, and reports unknown/orphan states. A historical `paid` flag is not bank-payment evidence; reconcile it separately before declaring obligations settled.

Ledger supports `bank_account_id`; a null value remains unattributed. Audit uses active income/transfer-in minus expense/transfer-out per stored account and currency, excludes voided rows, reports minimum running/ending position and transfer-pair anomalies. Equal-date ordering uses creation time/id only as a deterministic diagnostic, not proof of intraday chronology.

**Do not equate Legacy Ledger position with actual bank/cash closing balance.** Company-share-only income posting and individual paid flags without Ledger outflows make independent bank statements/cash counts necessary. No per-bank values are invented and no actual balance is supplied before the manual audit.

The initial Legacy DDL predates the tracked Finance migrations. The committed `202606290001_allow_partner_compensation_drafts.sql` adds authenticated partner/admin draft policies and read helpers `current_user_is_admin_or_partner()` / `compensation_batch_is_draft(uuid)`. The SQL audit reads live Legacy owners, RLS/forced-RLS, policies, grants, triggers and function metadata, including direct Legacy references and transitive callers. It never invokes those functions.

Catalog function discovery is conservative text/call-graph evidence, not proof against arbitrary constructed dynamic SQL, external service jobs or direct administrator SQL. External writers/cron/integrations must be inventoried at the freeze. Dynamic-SQL candidates are explicitly flagged.

## Cross-system boundary risks

Migration 055 adds `finance_expenses.legacy_claim_id` and `bridge_finance_legacy_expense(text,uuid,text,boolean)`. This creates a New Finance expense from a Legacy claim, but does not migrate or remove the Legacy row. `expense_legacy_bridge_guard` / `expense_legacy_double_payment_guard` prevent conflicting Legacy updates/payments while a bridge exists. Removing a UAT bridge could release that guard: any non-null link is an explicit cutover decision, never automatic permission to delete or repay Legacy.

Older invoice/payment integrity/void code also checks optional `source_invoice_id` / `source_payment_id` references in Legacy tables (including migrations 022/024/027/028/029/037/039). Audit returns these exact live Legacy references if present. Shared bank masters and shared audit logs are further keep/purge boundaries.

All declared FKs touching manifest tables are returned with columns, definition, deletion behavior, validation flag, parent/child classification and, where both tables are in scope, orphan counts. KEEP/unknown → UAT FKs require review. Unknown-table rows are not dumped or assumed absent. Tax source revisions additionally use polymorphic source identifiers; missing/unknown source parents are reported separately.

Immutable triggers, coverage constraints, source guards, audit chains and restrictive FKs deliberately prevent ordinary deletion of many UAT rows. Classification is not an executable deletion plan. Phase 7B must review dependency order and a separately approved maintenance contract; do not disable constraints/triggers globally or cascade into Legacy/shared records.

## New Finance families and source-of-truth

- Commercial: Quotations → agreements/versions/clause selections → billing plans/installments/items → billable charges → invoice composition/allocations/audit.
- Received money: confirmed Payment and Direct Money sources, receipt/tax/combined documents, coverage, tax points and corrections. Document presentation/coverage does not constitute a second receipt of cash.
- Distribution: money allocations, frozen v1/v2 Revenue Distribution, entitlement sources/individual entitlements, participant payouts/allocations. Company Share economic projections are not additional cash. Formula masters stay; frozen UAT evidence is parent-bound.
- Spending: Company Purchase and employee/Legacy-linked claims, multi-item requests, reviews/settlements, obligations/waivers, payouts and economic decisions. General Payables is a projection of expense obligations; there is no separate generic Payables header to invent or purge.
- Money foundation: opening balances/audit, confirmed Cashbook movements/audit, Treasury transfer headers and the two-leg bridge. Treasury, Statement and Executive Dashboard read contracts/views stay.
- Tax: source revisions, facts, audit, outgoing WHT obligations, external VAT/review history, corrections, periods, filings/coverage/audit and remittances/audit. All New Finance tax transactions are UAT under the frozen declaration; unknown/Legacy-linked evidence is still a boundary decision.

## Opening position / Cashbook

`finance_bank_accounts`, `finance_bank_account_access`, `finance_cash_locations` and Treasury authority masters are configuration. Legacy uses the bank masters too. Masked account identifiers are returned for review, not secrets/full account details.

`finance_account_opening_balances` stores account, currency, `as_of`, `balance_amount`, lifecycle state and supersession evidence. Its UAT rows are not go-live opening values. `finance_cash_transactions` holds dated confirmed/draft/cancelled inflows/outflows and Payment, Direct Money, payout, remittance, reversal and account references. Phase 070 transfers link two cash rows through `finance_treasury_transfer_legs`.

The audit computes a clearly labelled **simulated** balance using confirmed opening plus confirmed signed cash strictly after `as_of`, matching the current balance basis in Migration 055's `expense_account_balance_private`. It preserves currency separation, flags multiple/missing opening situations, and does not call Treasury RPCs/views. No confirmed opening means no authoritative simulated closing figure. Source breakdowns count underlying transfer legs as cash rows, not new income; payout allocation links distinguish expense origins without duplicating their amount as extra cash.

Later: confirm cutover instant and real bank/cash evidence, reconcile Legacy closing postings and uncleared transactions, settle or explicitly carry each live obligation, then establish approved real opening positions exactly once. Do not carry UAT openings or duplicate original historical receipts/distributions.

## Numbering findings and later reset plan

`finance_document_counters` stores `doc_type`, `year`, nullable `month`, `prefix`, `last_no`; this is state. `document_numbering_profiles` stores display prefix, period scope and width; this is configuration. The current general generator is defined in Migration 040, not derived from document-row maxima.

| Type | Current default pattern / period |
| --- | --- |
| Quotation (`QT`) | Company quotation prefix, normally VP-QT; monthly; four-digit counter |
| Fee Agreement (`fee_agreement`) | VP-AG; annual; six-digit counter |
| Invoice (`invoice`) | VP-IV; monthly; six-digit counter |
| Receipt (`receipt`) | VP-RC; monthly; six-digit counter |
| Tax Invoice (`tax_invoice`) | VP-TI; monthly; six-digit counter |
| Combined (`receipt_tax_invoice`) | VP-RTI; monthly; six-digit counter; shared issued identity, not three independent numbers |
| Credit/debit corrections | Migration 043 `tax_correction_number`; VP-CN / VP-DN; monthly; six-digit counter |

The audit returns actual profiles, counters, issued-number counts/ranges and Finance/document-named PostgreSQL sequence state without advancing sequences. Some UUID/reference-based sources have no permanent fiscal counter. Non-Finance profiles such as legal reports must remain intact.

Deleting UAT documents **does not reset** `finance_document_counters`. Later reset only explicitly approved Finance type/period rows after writer freeze, complete document/coverage cleanup and external-number collision review. Retain numbering profiles, generator definitions, prefixes and uniqueness constraints. Do not reset shared/Legacy identity sequences or unrelated document numbers. No reset SQL is included here.

## Tax evidence interpretation

Migration 050 introduces immutable `finance_tax_source_revisions` and `finance_tax_position_facts`; later 055/064/065 add expense/external sources and authoritative Input VAT behavior. The audit groups existing stored facts into Output VAT, Input VAT and incoming WHT with source/period/currency/treatment and latest-vs-historical revision. These sums are **stored evidence**, not a recomputed Tax Position and not all revisions added as current tax.

Outgoing WHT obligations are separate from incoming customer WHT credits. Filing/remittance statuses and amounts are grouped by period/form; tax-point events, invoice items/source coverage and all evidence/audit tables have individual counts. Tax Calendar configuration survives. Neither a paid receipt nor issuing a tax document authorizes a second VAT/cash fact. No tax derivation or filing RPC is invoked by the audit.

## Recommended later read-only enforcement and navigation

Not implemented in Phase 7A:

1. Choose cutover date/instant after the manual audit. Reconcile/settle approved Legacy claims and final individual compensation where practical; explicitly resolve drafts, anomalies and any remainder. Preserve a final independently verified snapshot/hash/export and rollback plan.
2. Freeze all three Legacy write surfaces together. Remove create/edit/approve/pay/void/delete/post actions and keep search, detail, history and permitted exports. Label them “ระบบเดิม / ประวัติ”. Prevent old bookmarked forms from submitting.
3. Enforce backend denial, not just hidden buttons: narrowly block INSERT/UPDATE/DELETE/TRUNCATE on the four Legacy tables; remove/deny relevant authenticated write policies/grants; guard/revoke write RPC paths and the Legacy bridge after cutover. Retain existing historical SELECT permissions and shared bank/profile reads. Security-definer/service-role bypass must be covered; RLS alone is insufficient. Do not blanket-revoke shared Finance masters or all Finance RPCs.
4. Preserve Legacy audit entries inside `case_audit_logs` with row-scoped protection; do not lock unrelated shared audit usage. Inventory jobs/service callers, and exercise denied direct REST/RPC/stale UI writes plus permitted reads in a later gated candidate. A database owner can override protections administratively; operational freeze controls must cover that route.
5. Put the existing Legacy group behind a clearly secondary collapsed “ระบบเดิม / ประวัติ” with the three historical routes. Current `app/finance/finance-navigation.ts` already recognizes a Legacy group; audit does not edit it or change route/permission semantics.
6. New Finance becomes the only source for new operations. Carry only approved opening position and unavoidable live obligations. No permanent sync, dual-write, dual-posting or automatic full-history migration.

## Decisions still required

- Current Production audit result; outstanding balances are **unknown**, not zero.
- Cutover date/instant and independently reconciled real opening balances.
- Submitted/approved Legacy claims; unpaid final/posted participants; draft/finalized batches, partial postings and invalid/unknown states.
- Any Legacy↔New references, orphaned/dependent rows, unknown Finance relations or keep/purge boundary FKs.
- Account/config/payee test-specific rows and exact Finance numbering-reset scope.
- Object storage: `fee-agreement-executed-documents` evidence is matched through `signed_evidence_json.evidence_file.storage_path`. Optional/missing files and unlinked objects need separate review. Keep `vp-document-assets` logo/signature masters. Never equate deleting `storage.objects` metadata with safely removing a stored file.
- Production-only functions/jobs/dynamic SQL and actual RLS/grants must be checked from the returned writer surface before declaring a complete lock plan. No approval of the broader 490 catalog differences is implied.

## Validation and stop point

Focused static tests verify one SELECT, a reviewed builtin-only call set, all tracked Finance families, Legacy/config/shared KEEP classifications and no mutating SQL/RPC calls. The local PostgreSQL test executes the exact static SQL inside `BEGIN READ ONLY` with empty and populated synthetic fixtures: nonzero obligations, valid Ledger links, zero-company custom batches, multicurrency separation, simulated balance, latest tax revision, FK orphans, unknown tables, parent-scoped shared audit, storage reference and writer/caller discovery. Repeated row hashes remain unchanged; inspected writer functions are never invoked.

Migration hashes and pre-existing untracked-file hashes are compared with the start-of-task guard; no tracked application or migration file was edited. `git diff --check` and untracked-artifact whitespace checks are required. No TypeScript/build is needed for these audit-only artifacts.

Completed on 2026-09-26: **3/3 focused checks PASS**, including the exact SQL against an isolated local PostgreSQL 18 fixture under READ ONLY. All **98 tracked migration files** (including Finance 001–071) and **28 pre-existing untracked files** matched their starting SHA-256 hashes. HEAD/local origin/main remained unchanged; no staged files or tracked diff. The static SQL is **54,600 bytes / 667 lines**. These are local artifact results, not Production audit results.

No Production SQL executed; no Production/Legacy data modified; no Migration 072; no Legacy lock/navigation change; no cleanup SQL; no commit/push/deploy. **Stop after preparing this SELECT-only audit. Phase 7B requires the manual Production result and further decisions.**
