# Phase 7B — New Finance UAT cleanup package

**Closure, 2026-09-26:** the user reports all four Production gates completed successfully. See [PHASE7B_PRODUCTION_EXECUTION.md](PHASE7B_PRODUCTION_EXECUTION.md) for the immutable execution record and subsequent read-only UI smoke. The preparation instructions below are historical evidence, not instructions to repeat cleanup. The approved pre-cleanup pins are intentionally retained; do not refresh or reuse them for another cleanup.

Prepared at repository `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`, HEAD/local `origin/main` `81c90a5e8632d3c087284d3a9634a38335032922`. **No Production execution, app changes, migration, commit, push or deployment.**

## Scope and the decision that supersedes Phase 7A

The user authorizes removing all New Finance simulated business data, plus UAT payees/destinations/audit and customer-specific tax profiles/audit where they have no retained dependency. Legacy need not first settle outstanding obligations. The 12 approved claims, finalized compensation, paid-link anomalies and Ledger history are neither repaired nor used as zero-obligation prerequisites. No cutover date or real opening position is required for this cleanup. Legacy remains operational afterwards.

The exact manifest is `docs/finance/PHASE7B_CLEANUP_MANIFEST.json`:

- **Hard KEEP:** `finance_expense_claims`, `finance_compensation_batches`, `finance_compensation_allocations`, `finance_company_ledger` — every row and column.
- **91 complete UAT table targets:** all 25 Phase 7A transaction headers and all 61 derived/child tables, plus the five newly decided master/audit tables. No hand-picked subset of descendants is omitted.
- **2 partial targets:** only approved Finance types in `finance_document_counters`; only shared `case_audit_logs` rows whose `table_name` names one of the 91 UAT targets. Legacy and non-Finance audit rows remain. Orphaned historical audit entries for those UAT modules are still UAT module history; they need not have a currently live parent row.
- **Everything else stays:** all remaining public table rows, retained portions of partial targets, all storage objects/buckets, schema, functions, RPCs, policies, grants, trigger enabled modes and sequence state. This includes Clients, Cases, Advisory, Parties, Users, tasks/work logs, bank/access masters and reusable configuration whether or not individually listed in Phase 7A.

Families include Quotations/items/terms/installments; agreements/items/versions/clauses; billing plans/installments/bridges; charges; invoices/items/composition/allocations; Payment/Direct Money/receipt/tax/combined source evidence; distribution/entitlements/payouts; new Company Purchase/Reimbursement/request/review/obligation/settlement/economic evidence; Cashbook/openings/transfers and legs; VAT/WHT facts/revisions/tax points/periods/filings/remittances/corrections/external VAT; and their audit children.

Removing New Finance UAT openings creates **no** replacement opening. Statement will have no UAT cash movement; real opening entry is a separate later task.

## Configuration and decided UAT masters

Preserve `document_numbering_profiles`, company profile/signers, bank accounts/access, cash locations, Treasury authorities, document/template/clause/variable libraries and versions/audit, Finance permissions, Tax Calendar rules, reusable quotation patterns and every other non-target public row. Source-controlled formula definitions are unchanged.

The five additional full-table UAT targets are:

1. `finance_payees`
2. `finance_payee_destinations`
3. `finance_payee_audit`
4. `finance_customer_tax_profiles`
5. `finance_customer_tax_profile_audit_events`

Migration 042 defines customer tax profiles as per-Client rows keyed by `client_id`, not system defaults. The gate additionally rejects any rows marked as system/default by new `scope` / `is_default` fields. Shared Client/User records remain. Migration 051 payee/profile references point from payees to shared users; deleting a payee must never imply deleting the user. Live FK/dependency checks stop if any retained row actually depends on a target.

Repo inspection found no use of New Finance customer-tax/payee records by the three Legacy pages. Gate 1 additionally checks actual retained FK rows (including incoming cross-schema FKs) and known soft Legacy Payment/Invoice/payee references. It reports exact offending Legacy IDs and fields. It does not rewrite them to enable cleanup.

## Counter reset

The exact approved type allowlist is `QT`, `fee_agreement`, `invoice`, `receipt`, `tax_invoice`, `receipt_tax_invoice`, `credit_note`, `debit_note`. The first five are the user's observed examples; all eight are implemented Finance document families covered by the all-UAT decision. All periods for those types are candidates. Other types, including `legal_report`, remain byte-for-byte unchanged.

The unchanged Migration 040 `generate_finance_document_no(text,date)` inserts `last_no=1` if the type/year/month counter does not exist, then increments on conflict. Agreement numbering respects its configured annual period; other configured document types respect their profiles. Migration 043 `tax_correction_number(text,date)` uses the same insert-at-1 behavior for credit/debit notes. The package deletes counter rows rather than altering generators/profiles or resetting PostgreSQL sequences.

Local tests run these exact extracted repository function definitions with synthetic permissions/configuration: every approved type returns sequence 1, then 2, then returns 1 again after its counter is removed; the non-Finance counter remains 77. No numbering function is called in the Production cleanup gates.

## Four static manual gates

| Gate | File | Prepared size |
| --- | --- | --- |
| 1 — Preflight | `scripts/sql/preflight_finance_phase7b_cleanup.sql` | 22,283 bytes / 106 lines |
| 2 — rollback rehearsal | `scripts/sql/dryrun_finance_phase7b_cleanup.sql` | 90,833 bytes / 379 lines |
| 3 — Apply | `scripts/sql/apply_finance_phase7b_cleanup.sql` | 66,810 bytes / 282 lines |
| 4 — Verifier | `scripts/sql/verify_finance_phase7b_cleanup.sql` | 24,098 bytes / 117 lines |

**Gate 1 Production PASS was returned by the user; only Gate 2 is ready to run next.** Gates 2–4 now contain the exact approved pins below, with no approval placeholders. Gate 3 is not opened by this binding task. No user JSON/CSV download, baseline file, psql connection or Python wrapper is required. Give only the next gate's pbcopy command after its predecessor passes.

### Approved Production binding evidence

| Gate 1 field | Approved SHA-256 |
| --- | --- |
| manifest_sha256 | `a60f80f6436d0cd7fcad2944f5e859775011648d44d2415f9d980a2def107e1b` |
| state_sha256 | `48cae7e4af2a1144ae2de9c0c6fb3a6851757b87ed7b6a48ff38d570b19e989b` |
| catalog_sha256 | `b7185e5e607218112b85a54ea005df2bfb84550c6a809ad626acc27265af2293` |
| sequences_sha256 | `f45149c3e1a98d9301f26907badbaad3d26a84f5d10aa3538dac281bb7834ded` |
| preserved_rows_sha256 | `ae1724585c19d6b207476e1cbd3b3b8b6e878c19b219eb052c77211f196a5bd0` |

Gate 1 reported `gate_pass=true`, `failed_checks=[]`, `legacy_reference_blockers=[]`. The approved preserved-row aggregate cryptographically binds each retained table's name, exact count and full-row hash, including these four Legacy KEEP records; Gate 4 verifies that aggregate and returns the individual Legacy counts/hashes:

| Legacy table | Rows | Approved row SHA-256 |
| --- | --- | --- |
| finance_company_ledger | 356 | `9ad45c71555f78e480398bb0f84561676fc20eb5066f761e9ff87e24ff39acce` |
| finance_compensation_allocations | 139 | `254ebc1f8bca193425f194d8d03e018070b31a27fc95b596ca4c83fdcaad3dbe` |
| finance_compensation_batches | 38 | `230fcddfd491457b35c26e9765d46366f8395233edcf377b41c09d937a2a0d05` |
| finance_expense_claims | 274 | `0b86ab890eb01c79d6e49379059cc0a9ef770238cd6e0d389036e14c8e6faa88` |

The earlier unbound Gate 2 correctly returned `P0001: PREFLIGHT_PASS_HASHES_REQUIRED` and `ROLLBACK_STATE_MISMATCH`, with `production_changes_committed=false`. Its current state hash still equalled the approved Gate 1 state; the comparison target was the invalid placeholder. This is a missing binding, not data corruption. Any subsequent real state change still fails closed and requires a new approved Gate 1; no silent refresh is allowed.

Reproduction uses the unchanged generator and exact approved CLI values (run from the repository root; output is isolated for comparison):

```sh
VP7B_ARTIFACT_OUTPUT=/private/tmp/phase7b-approved-binding python3 scripts/tests/finance-phase7b-artifacts.py \
  --state 48cae7e4af2a1144ae2de9c0c6fb3a6851757b87ed7b6a48ff38d570b19e989b \
  --keep ae1724585c19d6b207476e1cbd3b3b8b6e878c19b219eb052c77211f196a5bd0 \
  --catalog b7185e5e607218112b85a54ea005df2bfb84550c6a809ad626acc27265af2293 \
  --sequences f45149c3e1a98d9301f26907badbaad3d26a84f5d10aa3538dac281bb7834ded
```

The generated manifest and Preflight must match the existing files byte-for-byte. Only Gates 2–4 are copied back. Their only SQL changes are substitution of the four runtime approval placeholders; cleanup selectors, assertions and transaction behavior are unchanged. The focused test reproduces all four SQL artifacts and the manifest, and compares every byte. Generator defaults intentionally remain fail-closed for future unapproved generation.

Gate 1 discovers the **actual current** FK graph in Production. The prior Phase 7A result is not available locally as a complete authoritative FK artifact; this package does not pretend that a fixture is Production truth. It reports current graph/retained dependencies and counts/hashes for approval. Structural row hashes cover all public base tables and storage metadata; no business row payload dump is needed. The gate fingerprint includes the cleanup manifest and generator SHA so changing the cleanup implementation changes the approval identity.

Preflight and Verifier each consist of one SELECT. Their `query_to_xml` calls execute only internally constructed, identifier-quoted SELECT count/hash/join queries. No application RPC, tax calculation, number allocation or source materialization function is invoked. An unknown Finance table, missing required relation, foreign table, inherited/partitioned delete target, delete rewrite rule or dependent KEEP row prevents proceeding. A permissions/query error is not an empty dataset.

The catalog fingerprint freezes the current logical schema/function/security state to prove preservation. It is **not** an acceptance/reconciliation of the broader 490 historic differences. Those remain unresolved outside the cleanup acceptance decision.

## Atomic deletion and rollback safety

Use a quiet window through the four gates. Legacy remains writable between gates, but any actual row/schema/sequence change invalidates the approved full-state hash and requires fresh Preflight approval. The cleanup never demands that Legacy obligations become zero.

The write gates take short transaction locks (5-second acquisition timeout; 120-second statement/idle limits): ACCESS EXCLUSIVE only on the 93 delete targets, SHARE on protected public/storage tables. These briefly prevent races; they do not implement a permanent Legacy read-only policy.

Existing immutability/audit/business triggers prevent ordinary DELETE. Inside the guarded transaction only, the package records and disables **non-internal triggers on explicit targets**, then restores each original `O`, `D`, `A` or `R` mode. It does not disable FK/internal triggers, set replica mode, drop/alter constraints, change RLS/grants or replace functions. No trigger on a hard-KEEP Legacy table is disabled. Shared audit/counter predicates still limit deleted rows to the approved subset.

Deletion order is derived from the live approved FK graph. A child-first dependent data-modifying CTE statement deletes all selected rows. Cycles remain within that single statement so PostgreSQL's normal FK checks can validate the final state. There is no TRUNCATE/CASCADE command or broad `finance_*` deletion. Existing FK cascades are never permitted to cross into retained rows; Preflight explicitly counts and blocks such dependencies before mutation. Deferred FK checks are forced before postconditions.

Both write gates compare exact approved starting hashes, run the identical cleanup body, assert every target count is zero, and compare retained-row/catalog/sequence hashes. A PL/pgSQL exception subtransaction automatically undoes all cleanup and temporary trigger-mode changes on any error/mismatch. Apply commits only after this body succeeds; failure commits no business/schema change and reports `cleanup_pass=false`. Unexpected setup/connection errors are a failed gate, never success.

Dry-run always executes ROLLBACK, then recomputes the scoped state. A session-only prepared SELECT carries the actual inside-transaction success/failure across rollback; restored state alone cannot falsely imply the deletes succeeded. Stale prepared results are cleared before BEGIN. Apply uses the same session-only result mechanism after COMMIT; no persistent audit/helper table or function is installed.

The SELECT-only Verifier requires zero selected UAT/counter rows, exact retained-row hashes, exact unchanged schema/security and unchanged sequence state. It returns individual Legacy counts/hashes for inspection. This includes preservation of configuration and shared core, rather than merely checking that some configuration rows still exist.

## Storage and later app smoke

**No storage objects or metadata are deleted.** Buckets, master logos/signatures and reusable assets are preserved. UAT signing evidence may remain as an unreferenced object after its UAT agreement is removed. An exclusive parent/path mapping for the current Production objects has not been approved, so no object-deletion package is prepared. A later separately authorized storage cleanup can use exact path evidence; never delete bucket contents broadly or only remove `storage.objects` rows.

No Production UI smoke has been performed before cleanup. After Apply and Verifier pass, inspect empty states at `/finance/overview`, `/finance/quotations`, `/finance/fee-agreements`, `/finance/billable-charges`, `/finance/invoices`, Payment/received-money/document pages, `/finance/revenue-distribution`, `/finance/expenses`, `/finance/expenses/claims`, Payables, `/finance/statement` and Tax pages. Inspect the three Legacy routes for unchanged real history and existing write access. Do not create UAT transactions or real opening balances as part of that smoke.

## Validation and boundaries

Focused local checks: **5/5 PASS**. Approved-pin artifact reproduction is exact. The synthetic PostgreSQL 18 fixture exercises 303 captured FK edges with cyclic dependencies, all target tables, immutable triggers and original O/D/A/R modes; successful rollback and Apply; SELECT-only verification; missing approval rejection; stale approval rejection in both Dry-run and Apply; cross-schema/KEEP reference blocking; failure injected after deletions restoring every row and catalog hash; failed Dry-run never reporting PASS merely because rollback worked; retained core tampering detected; non-Finance counters preserved; exact existing Finance generators restarting at 1. Production-bound pins reject the unrelated synthetic local baseline; successful fixture tests use separately generated local-only pins in `/private/tmp`, never in repository artifacts.

`scripts/tests/fixtures/finance-phase7b-fk-fixture.json` contains only test schema/FK shapes from local historical catalog artifacts. Its reduced columns/types/constraints and synthetic rows are not a replacement for Production Gate 1 or the manual Production rollback rehearsal. It contains no Production business records or credentials.

No TypeScript/build is needed: application code is unchanged. Migration/file hash and whitespace checks cover the release boundaries. There is no Migration 072, no edits to 001–071, no destructive Production execution, no Legacy write retirement, no opening-balance creation and no app release. **Stop after preparing bound Gate 2; do not open Gate 3.**
