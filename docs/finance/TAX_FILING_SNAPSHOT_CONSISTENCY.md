# Tax Filing Snapshot Consistency (Migration 053)

The business owner reports that Migration 053 was manually applied to Production and
post-apply verification passed with no failed checks, zero filings and zero allocations.
Repository finalization does not run Production SQL or create a Filing Draft, source
materialization or remittance. Migration 053 remains byte-identical to the prepared
artifact, SHA-256:
`5438f8dad942c3bdc9793c79434bebbeec576b1ff5b6c8a790f7e133d5575914`.
All applied migrations 001-052 remain unchanged. Migration 052 SHA-256:
`28717cf534fba05b7591b188b15646c0833177bf412caf1a35c3864fd7ed6b2b`.

## Confirmed persistence gap

Overview's `readMonthlyTaxSources` / `summarizeMonthlyTaxFacts` read current trusted
Finance sources without importing history into the 050 register. The 052 filing pool
only sums effective materialized register facts. The prior UI displayed the former
but `create_finance_tax_filing` froze only the latter. An empty pool therefore stored
Output VAT 0, omitting the known monthly Output VAT 700.

## Server source and priority

The new private, stable `tax_filing_monthly_facts(date)` enumerates the same monthly
sources as Overview and reuses the existing pure **`tax_position_source`** projection:

- Confirmed THB Direct Money, by received date: classification lines take priority
  over confirmed snapshot lines. Recognized VAT treatments supply already-stored VAT.
- Issued Tax Invoice children with approved tax points, by tax-point date. Standalone
  and Combined count the tax child once, not Receipt, Payment cash or Invoice gross.
- Issued credit/debit notes, by adjustment date. 050 already projects the signed
  stored VAT changes. Replacement copies and documentary reissues add no VAT.
- No manual totals, VAT-rate calculation, register materialization or browser totals.
  Missing required tax-document evidence produces unknown, never an invented zero.
  As in Overview, recognized Direct Money lines are a known subtotal when treatment
  warnings exist; warnings are retained and readiness remains blocked.

Each monthly source freezes its identity, date, reference, original source fingerprint
and projected VAT-line evidence. Ordering is deterministic; there is no clock value in
the fingerprint. Incoming WHT continues through the unchanged Overview reader and is
not part of VAT payable or allocation coverage. 051 confirmed-only outgoing WHT is
unchanged. Payout Drafts/cancellations cannot add obligations or Cash.

## Snapshot and row meanings

New VAT pool/Draft snapshots use schema 2:

```json
{
  "schema_version": 2,
  "period_month": "2026-09-01",
  "filing_type": "vat",
  "monthly_facts": {
    "output_vat": 700,
    "input_vat": null,
    "input_vat_complete": false,
    "net_vat": null
  },
  "allocation_coverage": {
    "output_vat": 0,
    "base_amount": 0,
    "source_count": 0,
    "sources": []
  },
  "tax_amount": null,
  "ready": false,
  "issues": [{"code": "input_vat_incomplete", "count": null}]
}
```

The example omits the additional frozen source evidence/contract metadata for brevity.
There is deliberately no ambiguous top-level `output_vat`, `base_amount`, `sources` or
`source_count` in schema 2. `finance_tax_filings.base_amount` remains the allocation-
covered base; it is 0 with zero allocations. Row `tax_amount` remains payable tax, NULL
while Input VAT is incomplete. **Output VAT 700 is not VAT payable.** No acknowledgement
can make this VAT Draft ready/filed. No new Input VAT authority is introduced.

## Minimal lifecycle changes

- Rename/preserve the exact 052 pool as private `tax_filing_allocation_pool_v1`.
  The public-name private pool wraps VAT with the two layers; WHT returns the exact
  original version-1 JSON, including all legal-entity and evidence guards.
- Replace only the Draft creation and integrity functions to route allocations and
  row base through `allocation_coverage`. RPC signature is unchanged, with no tax-total
  input. Server recomputation and the expected fingerprint cover both monthly source
  evidence and allocation coverage under the existing Payout/050/052 locks.
- Same UUID/exact-input retries are idempotent, conflicting retries fail. Changed
  monthly evidence fails the fingerprint even when register allocations remain empty.
- Existing transition, remittance, immutable-history triggers, RLS, permissions,
  duplicate coverage, audit and cash guards remain. No new table/column or backfill.

Version-1 rows are not rewritten. Integrity still validates their original allocation
contract. An old VAT Draft is marked source-changed under the new pool; the established
cancel/recreate workflow remains the only way to replace that evidence. Filed history
remains frozen and read-only. WHT stays version 1 with its unchanged lifecycle.

## Presentation

Current schema-2 review displays server monthly facts. Saved Draft review uses its
frozen monthly facts, never a live VAT replacement. The existing source-changed warning
still compares it with the current pool. Incoming WHT is secondary live context, not
part of the frozen VAT snapshot. Technical evidence stays Admin-only/default-collapsed
for VAT and labels monthly facts versus allocations in TH/EN. Version 1 is explicitly
labelled allocation-only; no historical monthly totals are invented.

## Preserved operator artifacts

The pre-apply sequence below has already been completed manually in Production.
These artifacts are retained as evidence; do not reapply the migration.

1. `scripts/sql/preflight_tax_filing_snapshot_consistency.sql`: SELECT-only, one row;
   exact 052 catalog/functions/permissions, zero filing/remittance state and hashes.
2. `scripts/sql/dry_run_tax_filing_snapshot_consistency.sql`: BEGIN, preflight guard,
   exact embedded 053, post-verifier, ROLLBACK. No business RPC is invoked, including
   Draft creation. The operator rehearsal cannot leave a Filing or materialized fact.
3. `supabase/migrations/202607180053_separate_tax_filing_monthly_facts.sql`: applied artifact.
4. `scripts/sql/verify_tax_filing_snapshot_consistency.sql`: SELECT-only, one row;
   exact function/catalog/permission differences; September 700 monthly / 0 allocated,
   input incomplete, net/payable NULL, not ready, unchanged WHT pool and zero filings.

Mutable Ledger/Compensation/Cash counts are observability only. Protected evidence
hashes must match pre/post; the rollback script checks them inside its transaction.
The September amounts are UAT acceptance checks, not values hardcoded into a reader.
Local in-memory PostgreSQL tests alone create synthetic Drafts to prove persisted
schema-2 evidence, audit, retries, guards, compatibility and remittance regression.

## Prepared files and validation

- The four operator SQL artifacts above.
- `app/finance/tax-position/filings/shared.ts`, `vat-review.tsx`, `workspace.tsx`,
  `technical-evidence.tsx`: versioned read contract and collapsed evidence presentation.
- `lib/i18n/messages/tax-filings.ts`: directly related TH/EN labels.
- `scripts/tests/tax-filing-snapshot-artifacts.cjs`, `tax-filing-snapshot-postgres.test.cjs`,
  `tax-filing-snapshot-static.test.cjs`, `tax-filing-snapshot-ui.test.cjs`.
- `scripts/tests/tax-filing-fixture.cjs`, `tax-filing-browser.cjs`: schema-2 browser fixture
  and TH/EN checks at 390/768/1024/1440 with all external requests blocked.
- This document and a focused clarification in `TAX_FILING_REMITTANCE_FOUNDATION.md`.

Run PostgreSQL groups 049, 050, 051, 052 and 053 in **separate processes**, with their
matching `--test-name-pattern='^NNN'`. The existing imported test helpers also register
tests; each group's final operator rehearsal intentionally commits synthetic setup
before literal ROLLBACK. Running multiple such groups in one database leaves fixture
DDL behind and causes unrelated `schema already exists` errors.

**Next human action after deployment:** reopen September 2026 Filing review and
confirm monthly Output VAT 700, incomplete Input VAT and unknown net VAT. Expand the
technical disclosure to inspect the separate zero allocation coverage. Stop before
creating a Production Filing Draft or recording any filing/remittance action.
