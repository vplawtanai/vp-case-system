# 064 security-contract correction — completed manual Production gate

Release update: the operator reports the complete Production gate PASS, including manual apply and Post-Apply Verifier, with historical rows unchanged and empty function/catalog differences. Approved hash is the corrected fingerprint below. Historical next-step instructions are retained for audit; do not reapply 064.

Candidate changed under explicit authorization. Only ownership/grants were changed; all function bodies, tax semantics and non-security DDL are byte-for-byte preserved after removing the seven added security/comment lines and restoring the existing REVOKE line. No applied migration, Tax UI or other product file changed in this task.

## Provenance and decision

| Object | Repository lineage | 064 treatment |
| --- | --- | --- |
| `tax_position_source(text,uuid)` | Created in 050; PUBLIC/anon/authenticated execution revoked. Renamed/recreated in 055, with the same internal-helper restriction. No later replacement through 063. Captured owner postgres; ACL postgres/service_role EXECUTE. | Renames original and creates replacement. Replacement explicitly owned by postgres and granted service_role EXECUTE; client/PUBLIC execution revoked. SECURITY DEFINER and search_path=public unchanged. Renamed original retains the captured ACL. |
| `finance_tax_source_revisions` | Created with RLS/authenticated SELECT policy in 050. CHECK constraints changed in 055 and 059. | Only source-type CHECK changes. Captured owner/raw ACL/RLS/policies/triggers are frozen and preserved exactly. |
| `finance_tax_position_facts` | Created with RLS/authenticated SELECT policy in 050. CHECK constraints changed in 055. | Only date-basis CHECK changes. Captured owner/raw ACL/RLS/policies/triggers are frozen and preserved exactly. |

No repository historical default-privilege proof is asserted. The user authorized preservation of unchanged existing ACLs without that proof. The captured helper ACL is `{postgres=X/postgres,service_role=X/postgres}`; both existing tables retain `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}` and their authenticated SELECT policy using `tax_position_can_view()`.

The earlier proposal of ALL table privileges for service_role was narrowed to the operations this new append-only design uses: SELECT and INSERT. UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN are not required and are explicitly removed through REVOKE ALL. This affects only the two new tables, not any existing Finance service privilege. Client access continues through permission-checked SECURITY DEFINER RPCs. No permissive policies were added.

## Exact candidate security SQL

```sql
alter table public.finance_external_input_vat owner to postgres;
alter table public.finance_external_input_vat_reviews owner to postgres;
alter table public.finance_external_input_vat enable row level security;
alter table public.finance_external_input_vat_reviews enable row level security;
revoke all on public.finance_external_input_vat,public.finance_external_input_vat_reviews
 from public,anon,authenticated,service_role;
grant select,insert on public.finance_external_input_vat,public.finance_external_input_vat_reviews
 to service_role;
alter function public.tax_position_source(text,uuid) owner to postgres;
revoke all on function public.tax_position_source(text,uuid) from service_role;
grant execute on function public.tax_position_source(text,uuid) to service_role;
```

The existing final REVOKE removes PUBLIC/anon/authenticated EXECUTE from the helper and renamed original; existing authenticated grants to the three controlled RPCs remain unchanged. No ALTER DEFAULT PRIVILEGES was added to the candidate. New table ownership, RLS, no policies, exact ACL, effective grants, schema access and service_role BYPASSRLS are checked by the gates.

## Candidate fingerprints

- Before correction: `0266aeced8c08a5066de62a261cc787a7686e0cba7210ef476ac59ea4d96f297`
- Corrected candidate: `6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e`

Historical capture/reconciliation files intentionally retain the old fingerprint as historical evidence. Their generators now use the frozen `scripts/tests/fixtures/tax-064-pre-security.sql` and `tax-064-historical-artifacts.cjs`; neither is an active gate. All current gate artifacts use the corrected fingerprint.

## Scope and evidence

The dependency contract is `scripts/tests/tax-064-scoped-contract.json`. Existing-object entries come from `/private/tmp/post063-baseline-for-064.json`, SHA-256 `874e1058f0bea6b1cfce975adfd49be68983437c58510ebce89472cc00c4013c`, captured 2026-09-23T03:41:32.96862+00:00. The embedded accepted 063 PASS is checked against repository migration 063 and its 40 named function bodies independently. Local PostgreSQL supplies only canonical definitions for new objects and the two explicitly changed CHECK constraints, never the existing Production baseline.

This is a current-state preservation contract for the exact dependency/protected-object surface, not a claim that the whole current database has historical acceptance. The 490 broader unresolved differences remain unchanged in `scripts/tests/tax-064-reconciliation.json`. The three previously flagged unrelated helpers remain excluded; no further investigation of those differences was performed.

Preflight captures current protected row counts/hashes; it makes no claim about changes before this new capture. Post-Apply Verifier fails without the saved passing Preflight evidence. Dry-run compares before/after hashes and verifies restoration after ROLLBACK. Both existing table ACLs stay exact. The new evidence/review path creates no Payable, Reimbursement, Payout or Cashbook movement.

## Exact next step — SELECT-only

From the repository directory:

```sh
node scripts/tests/tax-064-gate.cjs print-preflight | pbcopy
```

This verifies the exact candidate file hash and regenerated gate bytes before copying the SELECT-only Preflight. Paste into the Production SQL editor, execute only that SELECT, and save the complete result (including historical_hashes) for the post-apply comparison. This local task did not execute Production SQL. `psql` is not installed on this host's PATH; the export command does not require it.

Where `psql` is available and `VP_DATABASE_URL` is securely configured, the equivalent read-only command with automatic local evidence capture is:

```sh
node scripts/tests/tax-064-gate.cjs preflight --baseline /private/tmp/tax064-security-preflight.json
```

It connects with `default_transaction_read_only=on` and refuses to overwrite existing evidence. Require gate_pass=true and empty differences. The Post-Apply Verifier requires the same saved baseline; it cannot report PASS without historical evidence.

Do not dry-run/apply yet. Stop at **MIGRATION REQUIRED — MANUAL PRODUCTION GATE**.

For a SQL-editor Post-Apply Verifier after separately authorized manual apply, save the complete passing Preflight JSON to `/private/tmp/tax064-security-preflight.json`, then export the verifier with that exact baseline:

```sh
node scripts/tests/tax-064-gate.cjs print-verify --baseline /private/tmp/tax064-security-preflight.json | pbcopy
```

This is preparation only; no dry-run/apply or Production SQL execution is authorized in this task.

## Exact files changed in this correction (21)

- [docs/tax-064-privilege-resolution.md](/Users/paolawyer/vp-case-app/vp-case-web/docs/tax-064-privilege-resolution.md)
- [docs/tax-filing-064-manual-gate.md](/Users/paolawyer/vp-case-app/vp-case-web/docs/tax-filing-064-manual-gate.md)
- [scripts/sql/dry_run_external_input_vat.sql](/Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/dry_run_external_input_vat.sql)
- [scripts/sql/preflight_external_input_vat.sql](/Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_external_input_vat.sql)
- [scripts/sql/verify_external_input_vat.sql](/Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_external_input_vat.sql)
- [scripts/tests/fixtures/tax-064-pre-security.sql](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/fixtures/tax-064-pre-security.sql)
- [scripts/tests/tax-064-baseline-capture.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-baseline-capture.cjs)
- [scripts/tests/tax-064-baseline-capture.test.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-baseline-capture.test.cjs)
- [scripts/tests/tax-064-build-contract.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-build-contract.cjs)
- [scripts/tests/tax-064-dependency-audit.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-dependency-audit.cjs)
- [scripts/tests/tax-064-gate.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-gate.cjs)
- [scripts/tests/tax-064-historical-artifacts.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-historical-artifacts.cjs)
- [scripts/tests/tax-064-privilege-resolution.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-privilege-resolution.cjs)
- [scripts/tests/tax-064-privilege-resolution.json](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-privilege-resolution.json)
- [scripts/tests/tax-064-privilege-resolution.test.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-privilege-resolution.test.cjs)
- [scripts/tests/tax-064-reconcile-capture.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-reconcile-capture.cjs)
- [scripts/tests/tax-064-scoped-contract.json](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-scoped-contract.json)
- [scripts/tests/tax-064-scoped-gate.test.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-064-scoped-gate.test.cjs)
- [scripts/tests/tax-simple-artifacts.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-simple-artifacts.cjs)
- [scripts/tests/tax-simple-postgres.test.cjs](/Users/paolawyer/vp-case-app/vp-case-web/scripts/tests/tax-simple-postgres.test.cjs)
- [supabase/migrations/202607180064_add_external_input_vat_evidence.sql](/Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202607180064_add_external_input_vat_evidence.sql)

## Local validation for this correction

- 21 targeted PostgreSQL tests PASS: candidate evidence/review/retries; no Payable/Reimbursement/Payout/Cashbook side effects; Company cash/bank + WHT; reimbursement cash/bank + idempotency; existing tax readiness/remittance; effective new permissions with ordinary and broad defaults; negative grant/RLS/history cases; complete DDL rollback and restoration. In-memory PGlite only.
- 10 static/evidence/export tests PASS; exact generated artifacts and SHA-256 checks PASS.
- Targeted ESLint and git diff --check PASS, including explicit checks of intended untracked files.
- TypeScript/build not required: no frontend/TypeScript artifact was changed in this correction. All existing Tax UI changes and unrelated working-tree files remain byte-for-byte as at task start.
- No Production connection, Production rehearsal/apply, commit, push, deploy or staging.
