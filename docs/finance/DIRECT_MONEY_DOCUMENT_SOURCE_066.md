# Direct Money → existing document engine — candidate 066

Status: Production database gate COMPLETE, reported by the operator on 24 September 2026. Migration 066 was manually applied and the compact SELECT-only Post-Apply Verifier passed. Release is authorized. Do not reapply the migration or perform Production business transactions during release.

Reported verification: `gate_pass = true`, `historical_rows_unchanged = true`, `applied_state_exact = true`; empty failed checks, function differences, catalog differences and object differences. Approved baseline SHA-256: `3f33c39290834b7bcdcd436b0af957422b400e06e626b3d07d3952569e1e588e`, captured `2026-09-24T00:27:30.857727+00:00`. This is operator-reported Production evidence; the implementation agent runs only disposable local database tests.

Repository baseline: `main` at `478b9571ae75924f24ba6ba7e0c9e5d8e3f17806`.

Candidate: `supabase/migrations/202607180066_add_direct_money_document_source.sql`

SHA-256: `010093343be8675823b8e9459c979d1dc6efe75959c7f12c0268eecb17db3f9e`

## Implementation

Confirmed Direct Money is a typed documentary source. Receipt, Tax Invoice and Combined documents keep their existing tables, numbering, preview/issue screens, renderers and correction lifecycle. No Invoice/Payment surrogate is created. Eligibility derives from confirmed, classified source lines and existing verified customer/legal evidence. Unknown/non-revenue sources and missing identity fail closed. Known financial fields are not re-entered.

The source stores schema version 3 with `source`, `money`, `document_lines` and `tax_lines`. `source` includes the genuine Direct UUID, version, line UUIDs, canonical evidence and fingerprint. Payment/Invoice keys are absent. Existing versions remain readable.

Common taxable path: confirm the existing external-coverage/tax-point acknowledgements → **จัดทำเอกสารรับเงิน** → existing preview → required preview/issue acknowledgements → **Issue**. Two main buttons, plus required checkboxes (and delayed-issue acknowledgement when applicable). Receipt-only retains its existing final confirmation, making three main actions. Already-created coverage opens the existing document. No arbitrary three-way document-type choice.

## Exact schema and RPC change

No new business table and no backfill. Seven existing tables gain a nullable, real `direct_money_receipt_id` FK with mutually exclusive source constraints:

- `finance_receipts`
- `finance_tax_invoices`
- `finance_combined_documents`
- `finance_receipt_invoice_allocations`
- `finance_tax_invoice_items`
- `finance_tax_invoice_source_coverages`
- `finance_tax_document_corrections`

Direct-source rows have null Payment/Invoice references. Documentary allocations, items and coverages additionally carry real `direct_source_line_id`. Active-source/header and source-line uniqueness prevent duplicate coverage. Receipt coverage retains its existing documentary table despite its historical Invoice-specific name.

`finance_tax_point_events` accepts the typed `direct_money_received` event. `finance_direct_money_receipts` gains one dependency guard protecting documented sources from invalidating status/classification changes. Existing RLS, ownership and table ACLs are unchanged.

Two new public entry points (permission-checked, authenticated/service_role):

- `get_finance_received_document_decision(text,uuid)`
- `create_finance_received_document_draft(text,uuid,boolean,boolean,boolean)`

The optional final boolean records the user's explicit no-earlier-tax-point acknowledgement. It never invents agreement. The existing Payment entry points/signatures remain available.

New private helpers (postgres owner; no PUBLIC/anon/authenticated execution; service_role execution):

- `document_direct_action(text,uuid,text,jsonb)`
- `document_direct_blockers(jsonb)`
- `document_direct_decision(uuid)`
- `document_direct_snapshot(jsonb,jsonb,date)`
- `document_direct_source(uuid)`
- `guard_direct_document_dependencies()`
- `validate_direct_document(text,uuid)`

Existing functions replaced with source dispatch or narrowly extended integrity/tax-source checks:

- `cancel_finance_combined_document_draft(uuid,text)`
- `cancel_finance_receipt_draft(uuid,text)`
- `cancel_finance_tax_invoice_draft(uuid,text)`
- `create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)`
- `finance_tax_invoice_draft_snapshot(jsonb,jsonb,date)`
- `finance_tax_invoice_issue_blockers(jsonb)`
- `guard_finance_receipt_lifecycle()`
- `guard_receipt_logo_issue()`
- `issue_finance_combined_document(uuid,jsonb,boolean,boolean,boolean,boolean)`
- `issue_finance_receipt(uuid,boolean,jsonb)`
- `issue_finance_tax_invoice(uuid,jsonb,boolean,boolean)`
- `refresh_finance_combined_document_draft(uuid,timestamp with time zone)`
- `refresh_finance_receipt_draft(uuid)`
- `refresh_finance_tax_invoice_draft(uuid,timestamp with time zone)`
- `save_finance_combined_document_draft(uuid,date,jsonb,timestamp with time zone)`
- `save_finance_tax_invoice_draft(uuid,date,jsonb,timestamp with time zone)`
- `tax_correction_source(uuid,uuid)`
- `tax_filing_monthly_facts_before_expense(date)`
- `tax_position_source(text,uuid)`
- `validate_finance_combined_document()`
- `validate_finance_receipt_integrity()`
- `validate_finance_tax_invoice_integrity()`
- `validate_tax_correction_document()`
- `void_finance_receipt(uuid,text,boolean)`

`direct-money-documents-migration.cjs` derives the unchanged predecessor branches from applied migration files and verifies them byte-for-byte. New source lifecycle branches use existing permission helpers, source advisory locks, counters, audit tables, freeze checks and correction engine. New helpers explicitly pin owner/search_path/ACL; no default-privilege dependency. The existing applied migrations are not edited.

## Tax and money invariants

`direct_money_receipt + source_line_id` remains the sole economic VAT/WHT source. Direct-backed Tax Invoices return documentary-only inactive tax evidence; they do not create tax facts or source revisions. The existing monthly collector excludes these documentary copies from both money totals and completeness/fingerprints. The dashboard uses the same ownership rule. The original Direct tax period is preserved.

Tests verify source VAT 700 and WHT 300 occur once, cash remains 10,400, and documentary issue adds no source revision/fact. Before/after hashes preserve Payment, Invoice, Cashbook/Treasury, Payables, Payouts, expenses/reimbursements, revenue distribution and compensation. Credit/debit notes retain the existing intentional signed tax adjustment; replacement copies/reissue do not duplicate VAT.

## Frozen visual contract

The existing `ReceiptDocument`, `TaxInvoiceDocument`, `CombinedReceiptTaxDocument`, `DocumentIdentityHeader`, `LegalDocumentLayout`, authorization, logo loader and styles are reused. The three renderers change only the Invoice-specific reference wording in the existing slot. No CSS, logo size/position, A4 margins, header/footer, numbering display or template is changed.

Tests compare shared layout/styles against the starting commit and run existing historical-source rendering tests. TH/EN operational smoke covers 390/1440 and existing issue controls. Existing fixed-A4 horizontal scrolling on small screens is preserved; operational controls have no page overflow. Browser-generated PDFs verify one A4 page and one logo for all three document types using actual locally issued synthetic snapshots. Existing bilingual document-body wording remains the same in either UI language.

## Gate contract and boundary

The contract artifact is generated from the repository migration chain through accepted 065 (SHA `eea28bb1470b964547815c90ad4d0be0b22408da1978176b49ac194ad855a54e`) and the exact candidate. It is **not** a claim that a local fixture equals all Production state. Preflight must establish the actual current dependency match before rehearsal.

The SELECT-only preflight checks the candidate hash, exact dependency definitions/structural contract, target pre-migration state, owner/RLS/policies and required effective access. It captures current ACLs (including pre-existing service_role grants), default privileges, current public functions/catalog and hashes of 89 protected Finance/customer/user/numbering tables. Current ACLs are preserved exactly through rehearsal/verification, rather than replaced with historical local defaults.

The calculation helper below additionally has its full ACL and all effective EXECUTE flags pinned to reconciled Production evidence. A broader PUBLIC/anon/authenticated grant fails Preflight; loss of service_role access fails verification. The dependency is retained, not ignored.

The prior 490 unresolved broader baseline differences remain unresolved. They are not silently accepted. They block 066 if they intersect its verified dependency contract. The quotation permission helper's branch in the shared numbering function is unreachable for the three fixed RC/TI/RTI kinds, so its historical fixture stub is not treated as authoritative. The final compact gates do not assert whole-database exactness or attest unrelated catalog objects.

The final compact gates derive exact per-object hashes from the approved PASS baseline, whose full state SHA is validated offline. They cover 82 existing plus 9 new functions, 34 dependency tables/views and counts/hashes of 89 protected business tables. Existing owners, ACLs, effective permissions, RLS, policies and untouched definitions are preserved; only the candidate's intended definition/structural changes are allowed. Historical new Direct source columns must remain null. They embed neither business rows nor the broader Production catalog.

The rollback-only Dry-run checks preconditions, locks protected business tables, executes the exact candidate inside a transaction, validates postconditions, then ROLLBACKS and verifies restoration. It is 243,956 bytes / 1,379 lines. The SELECT-only Post-Apply Verifier is one read-only statement, 64,079 bytes / 55 lines, reduced from 2,587,429 bytes / 1,348 lines. It returns `gate_pass`, detailed failures, historical-row preservation and the candidate/baseline hashes. Exact target object sets reject missing or duplicate structures; catalog state does not independently prove manual execution count. The original oversized verifier and approved baseline are preserved under `/private/tmp/066-compact-verifier-evidence/`.

Any failing dependency/ACL/catalog/business-row check is a STOP for reconciliation. Do not make Production match a local artifact or ignore a difference.

## Failed Preflight reconciliation — 24 September 2026

The reported failure affected only `calculate_finance_billable_charge_amounts(numeric,numeric,text,numeric)` execution privileges. The old test prerequisite extracted its CREATE FUNCTION from Migration 030 but omitted that migration's explicit `REVOKE ALL ... FROM public, anon, authenticated` (lines 1228–1229). Thus the synthetic gate manifest incorrectly expected implicit PUBLIC EXECUTE. No change to Production or candidate 066 is warranted.

Migration 030 creates this helper at line 387 and hardens it at line 1228. No later applied migration changes its definition, owner or ACL. The earlier SELECT-only post-063 capture (`/private/tmp/post063-baseline-for-064.json`, captured `2026-09-23T03:41:32.96862+00:00`, SHA-256 `874e1058f0bea6b1cfce975adfd49be68983437c58510ebce89472cc00c4013c`) contains the same definition, postgres owner, `search_path=public` and ACL `{postgres=X/postgres,service_role=X/postgres}` now reported by Production 066 Preflight. Captured Supabase postgres/public function defaults include service_role EXECUTE; Migration 030 removes public/anon/authenticated only. This is consistent with a retained platform default grant, but the exact creation-time service_role grant event is not independently recorded in repository history.

Accepted 065 evidence: candidate `eea28bb1470b964547815c90ad4d0be0b22408da1978176b49ac194ad855a54e`; baseline `e435c194590aaa322c061e600705613d3757d0e8a8ad5357f6d1a194e6027d59`, captured `2026-09-23T12:40:41.750864+00:00`; operator-reported Post-Apply PASS. **This helper was outside 065's individual dependency contract**, so 065 PASS alone does not attest its ACL. Reconciliation rests on the explicit 030 private-helper contract, earlier actual capture, absence of later repository changes, and current reported Production ACL. The broader 490 differences remain unresolved.

The failed report is retained in `scripts/tests/direct-money-documents-acl-evidence.json`, explicitly labelled an operator-reported excerpt, not a raw database export. It records hashes of the original failed contract/SQL, which are also archived under `/private/tmp/vp-066-failed-preflight-acl/`.

Actual call paths:

```text
get_finance_received_document_decision
  → document_direct_decision → document_direct_source
create_finance_received_document_draft
  → document_direct_source / document_direct_decision / document_direct_action
issue_finance_receipt / issue_finance_tax_invoice / issue_finance_combined_document
  → document_direct_action → document_direct_source

document_direct_source → vp_received_source → vp_direct_frozen_source
  → direct_money_lines → calculate_finance_billable_charge_amounts
```

The helper is a real runtime dependency used to revalidate frozen source economics. It is SECURITY INVOKER and runs as postgres inside the existing permission-checked SECURITY DEFINER call chain. End-user authenticated and anon roles require no direct EXECUTE. Local tests deny a direct authenticated helper call while permitting authorized authenticated document decision/create/issue, including standalone Tax Invoice completion. The fixture restores the omitted 030 REVOKE and explicitly reproduces the captured retained service_role grant **only inside the disposable test database**.

Candidate 066 SHA-256 remains `010093343be8675823b8e9459c979d1dc6efe75959c7f12c0268eecb17db3f9e`. No candidate SQL, application file or applied migration was changed during this reconciliation. Preflight, rollback-only Dry-run and Post-Apply Verifier were regenerated with the corrected contract.

Exactly ten files changed in this reconciliation task (relative to the existing candidate working tree):

```text
docs/finance/DIRECT_MONEY_DOCUMENT_SOURCE_066.md
scripts/sql/preflight_direct_money_documents_066.sql
scripts/sql/dry_run_direct_money_documents_066.sql
scripts/sql/verify_direct_money_documents_066.sql
scripts/tests/direct-money-documents-acl-evidence.json
scripts/tests/direct-money-documents-security.cjs
scripts/tests/direct-money-documents-artifacts.cjs
scripts/tests/direct-money-documents-contract.json
scripts/tests/direct-money-documents-gate.test.cjs
scripts/tests/direct-money-documents-postgres.test.cjs
```

## Independent-session concurrency evidence boundary

No executable PostgreSQL server/client (`postgres`, `initdb`, `pg_ctl`, `psql`), Postgres app, Docker/Podman runtime or local cached server was available. Therefore **independent-session PostgreSQL races were not run and are not claimed as proven by PGlite**. The test name now states that its duplicate requests use PGlite's serialized connection.

The database enforcement, unchanged in candidate 066, is:

| Attempt | Existing constraint/lock |
| --- | --- |
| Duplicate create for one Direct source | `vp_received_lock(NULL,id)` (047) takes `pg_advisory_xact_lock(hashtextextended('direct_money:'\|\|id::text,0))` and the source row `FOR UPDATE`; 066 create acquires it before looking up/reserving documents. Partial unique indexes `receipt_active_direct_066`, `tax_active_direct_066`, `combined_active_direct_066` allow at most one draft/issued header per source/type. |
| Duplicate coverage reservation | `tax_direct_coverage_once_066` uniquely covers `(direct_money_receipt_id,direct_source_line_id)` for reserved/issued rows. `receipt_direct_line_once_066` and `tax_direct_line_once_066` prevent repeated document lines. |
| Simultaneous Issue / idempotent retry | `document_direct_action` takes the same source lock, then document/child rows and tax-point row `FOR UPDATE`. It returns the existing ID for an already-issued document before allocating another number or inserting allocations. |
| Permanent numbering across sources | `generate_finance_document_no` (040) atomically upserts the counter with `ON CONFLICT (doc_type,year,(coalesce(month,0))) DO UPDATE ... last_no+1 RETURNING`. `uq_finance_document_counters_period` (202607090001) enforces the counter key; `finance_receipts_receipt_no_key`, `finance_tax_invoices_tax_invoice_no_key`, and `finance_combined_documents_combined_no_key` enforce unique stored numbers. Combined child records intentionally share their single RTI identity. |
| Transaction rollback | Document creation, coverage, numbering counter update and issue writes are in the caller's transaction; there is no external/nontransactional number allocation. Failed or rolled-back issue cannot commit its counter increment. |

These constraints and locks enforce serialization/uniqueness; independent-session timing remains an explicit untested validation limitation, not a passing test result.

## Completed manual gate commands — archive only

These steps are completed operator history, not release instructions. Do not execute Production SQL during release.

Validate artifacts and copy only the SELECT-only Preflight:

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web &&
node scripts/tests/direct-money-documents-artifacts.cjs &&
node scripts/tests/direct-money-documents-artifacts.cjs --preflight | pbcopy
```

This validates/copies text only. It does not connect to or execute against Production. Preserve the complete passing Preflight result JSON (including `baseline`) for the later steps. Do not copy a truncated result. Once separately authorized, export Dry-run or Verifier with:

```sh
node scripts/tests/direct-money-documents-artifacts.cjs --dry-run /private/tmp/approved-066-preflight.json
node scripts/tests/direct-money-documents-artifacts.cjs --verify /private/tmp/approved-066-preflight.json
```

The same exact baseline must be used. The operator has completed and verified the Production gate; no Production SQL was executed by the implementation agent.

## Local validation

- Final release database/artifact suite: 73 checks pass across four test files (shared 066 scenario imports repeat); disposable PostgreSQL/WASM only. Includes restrictive-helper authenticated execution, standalone Tax Invoice completion, legacy Payment paths, money/tax preservation, idempotency and corrections.
- Dependency gate preflight under READ ONLY, rollback restoration, compact post verifier, deliberate privilege/RLS/schema/business-row drift detection: pass.
- Final release UI/presentation/dashboard/legacy regression suite: 106 tests pass; 28 additional document/static/i18n checks pass. The provenance unit fixture now stubs the newly mounted document-action panel, like its other independent panels; the panel itself is covered by 066 browser tests.
- TH/EN 390/1440 operational browser smoke, existing Receipt reopening, all three A4 renderers: pass.
- Targeted ESLint, `npx tsc --noEmit`, production build and `git diff --check`: pass for release. A sandbox-stalled local build was stopped and rerun successfully with the required local build-worker access.
- Candidate/gate exporter exact-hash validation: pass.
- Applied Migration 066 retains its approved SHA; prior applied migrations and 28 pre-existing unrelated untracked files remain unchanged. Only the manifest below is included in this release.

Concurrency scope: eight simultaneous caller requests are tested against PGlite's serialized connection, with duplicate reservation constraints and one number/document asserted. See the precise independent-session limitation and lock/constraint evidence above. Existing React SSR test harness emits its pre-existing styled-jsx `jsx`/`global` attribute warnings; browser assertions and compilation pass.

## Exact intended file manifest (39 files)

All paths below are relative to `/Users/paolawyer/vp-case-app/vp-case-web`. Pre-existing untracked files are excluded.

```text
app/finance/combined-documents/document.tsx
app/finance/combined-documents/page.tsx
app/finance/combined-documents/shared.ts
app/finance/combined-documents/workspace.tsx
app/finance/direct-money/[id]/page.tsx
app/finance/document-decision/next-action.tsx
app/finance/document-decision/shared.ts
app/finance/document-decision/source.ts
app/finance/receipts/[id]/page.tsx
app/finance/receipts/receipt-document.tsx
app/finance/receipts/shared.ts
app/finance/tax-corrections/document.tsx
app/finance/tax-invoices/editor.tsx
app/finance/tax-invoices/shared.ts
app/finance/tax-invoices/tax-document.tsx
app/finance/tax-invoices/use-tax-invoice.ts
app/finance/tax-position/dashboard-data.ts
docs/finance/DIRECT_MONEY_DOCUMENT_SOURCE_066.md
lib/i18n/messages/direct-money.ts
scripts/sql/dry_run_direct_money_documents_066.sql
scripts/sql/preflight_direct_money_documents_066.sql
scripts/sql/verify_direct_money_documents_066.sql
scripts/tests/direct-money-documents-acl-evidence.json
scripts/tests/direct-money-documents-artifacts.cjs
scripts/tests/direct-money-documents-browser.cjs
scripts/tests/direct-money-documents-contract.json
scripts/tests/direct-money-documents-dry-run-contract.json
scripts/tests/direct-money-documents-dry-run.cjs
scripts/tests/direct-money-documents-dry-run.test.cjs
scripts/tests/direct-money-documents-fixture.json
scripts/tests/direct-money-documents-gate.test.cjs
scripts/tests/direct-money-documents-migration.cjs
scripts/tests/direct-money-documents-postgres.test.cjs
scripts/tests/direct-money-documents-security.cjs
scripts/tests/direct-money-documents-verifier.cjs
scripts/tests/direct-money-documents-verifier.test.cjs
scripts/tests/direct-money-documents.test.cjs
scripts/tests/direct-money-provenance-display.test.cjs
supabase/migrations/202607180066_add_direct_money_document_source.sql
```
