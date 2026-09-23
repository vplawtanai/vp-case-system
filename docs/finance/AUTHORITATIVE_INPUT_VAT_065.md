# Migration 065 — authoritative Input VAT

Status: manual Production gate completed on 2026-09-23; application release authorized.
The user confirmed Preflight, rollback-only Dry-run, manual Apply and Post-Apply
Verifier all passed. Migration 065 retains its approved bytes; 064 and all earlier
applied migrations remain unchanged. This release executes no Production SQL.

## Cause and corrected contract

055 projected Input VAT only when the latest tax review was explicitly `eligible`.
064 treated accepted expenses with no VAT review as pending, and external saves did
not materialize VAT until a separate review. 053/055 also left Input VAT completeness
unconditionally false. These were workflow gates, not missing source amounts.

065 uses the existing source fact, without calculating VAT from gross/category:

- An accepted expense with `vat_state = exists`, stored positive `vat_amount` and
  stored base is included, unless its latest review explicitly excludes credit.
  This works for Company Purchase and any claim with explicit source VAT.
- `vat_state = none`, zero VAT, and expenses with no VAT evidence are omitted.
- An explicit `vat_state = pending` or `vat_awareness = yes` without complete
  source VAT remains ambiguous. Expense existence or `unknown` awareness alone
  never creates a candidate.
- A saved, acknowledged external document immediately projects and materializes
  its entered VAT. Normal saves create no review record. Existing explicit
  ineligible/pending exceptions still override the default inclusion.
- Authorized corrections use the existing expense/external revision RPCs.
  Exclusions remove active credit but preserve immutable history. The UI presents
  this as “Correct / exclude credit”, not a normal second approval.
- Net VAT is stored Output VAT minus usable source Input VAT. Explicit ambiguity
  blocks completeness; missing expense VAT does not. The signed net is retained.
  The existing filing/remittance amount stays nonnegative (`max(net, 0)`). Excess
  credit creates no automatic refund, carry-forward, payout or cash movement.

## Production records after the approved manual cleanup and 065 gate

The user confirmed the following result in the Production Post-Apply Verifier:

| Source | Result |
| --- | --- |
| Company Purchase `cf09f3ac-c2d2-4218-8005-575416589229` / Big C | Include stored VAT 19.63; preserve base 280.37 / gross 300 / inclusive 7% |
| Claim `0a7be430-a5b9-4be1-869d-0f8ef8fc4631` | No explicit VAT: omit from Input VAT and pending |
| Claim `839db839-524e-4988-b7d0-686801338bf9` | No explicit VAT: omit from Input VAT and pending |
| Claim `fb360ccc-2004-49bb-8541-3eb1dd079d4a` | No explicit VAT: omit from Input VAT and pending |
| External UAT vendor บริษัท UAT ผู้ขาย จำกัด / invoice 5647891231236 | Deleted in the separately approved manual UAT cleanup before 065; contributes no VAT |

September Output VAT is 700.00, Input VAT is 19.63 and net VAT is 680.37, with no
pending records from this set. September remains the tax period; October remains
its filing-month view. The cleanup preserved Big C, real records, the shared tax
period and all Payable/Cashbook/Reimbursement/Payout rows. Its reviewed preflight
SHA-256 was `c6c82fed55fcaa249ee56b3bad24996e497577bcce7d37f005881950fe010662`.

## Safe historical correction

The migration contains function DDL only: no backfill, historical row update,
review insertion or source materialization. Monthly totals read the canonical
`tax_position_source` projection directly, as Output VAT already does. They never
sum that projection together with ledger rows. Consequently old unmaterialized
source VAT becomes visible without rewriting evidence or appending artificial
review revisions.

Previously eligible source projections/fingerprints remain byte-identical.
Existing ledger revisions and frozen filings remain intact. New filing snapshots
carry `monthly_facts.input_contract = authoritative_input_v1` and retain full input
source evidence and fingerprints. Old snapshots retain their old validation
contract. A changed source marks a filing as changed; it never rewrites a filed
snapshot. An obsolete unfiled draft must use the existing controlled cancel and
recreate path before proceeding with the new source snapshot.

If historical ledger materialization is later required, separately review exact
source IDs and expected projection fingerprints, then use existing internal
`tax_position_sync` under the source/tax locks and an authorized actor, with an
explicit reconciliation reason. It appends one auditable revision for a genuinely
changed projection and returns the existing revision on retry. Do not delete or
update old facts, create duplicate expense/external evidence, replay approvals or
payments, or call the review RPC just to manufacture an “eligible” approval.
This is **not part of the migration** and has not been run on Production.

## Backend delta

One forward migration: `202607180065_use_authoritative_input_vat.sql`.
No new tables/columns, table ACL, RLS, role, RPC signature or money workflow changes.
The existing RPC response adds external `status`; its save behavior now includes
VAT immediately. Frontend reads remain compatible with the 064 response.

Replaced functions:

- `tax_position_source(text,uuid)`
- `save_finance_external_input_vat(uuid,jsonb,boolean)`
- `get_finance_tax_input_evidence(date)`
- `tax_filing_monthly_facts(date)`
- `tax_filing_pool(date,text)` — WHT delegates unchanged
- `tax_filing_assert(uuid)` — new input contract plus preserved old contracts

New private helpers:

- `tax_expense_input_vat_status(uuid)`
- `tax_input_vat_evidence(date)`

Existing function owners/ACLs are preserved. New helpers explicitly use postgres
ownership, SECURITY DEFINER and `search_path=public`; PUBLIC/anon/authenticated
execution is revoked, service_role execution is explicit. They are not client RPCs.

## Exact intended files

1. `supabase/migrations/202607180065_use_authoritative_input_vat.sql`
2. `app/finance/expenses/company-tax.tsx`
3. `app/finance/expenses/forms.tsx`
4. `app/finance/tax-position/expense-input.tsx`
5. `app/finance/tax-position/external-input.tsx`
6. `app/finance/tax-position/filings/shared.ts`
7. `app/finance/tax-position/period-data.ts`
8. `app/finance/tax-position/tax-home.tsx`
9. `lib/i18n/messages/tax-home.ts`
10. `lib/i18n/messages/tax-filings.ts`
11. `scripts/tests/authoritative-input-vat-postgres.test.cjs`
12. `scripts/tests/authoritative-input-vat-ui.test.cjs`
13. `scripts/tests/tax-simple-browser.cjs`
14. `docs/finance/AUTHORITATIVE_INPUT_VAT_065.md`
15. `scripts/sql/preflight_authoritative_input_vat_065.sql`
16. `scripts/sql/dry_run_authoritative_input_vat_065.sql`
17. `scripts/sql/verify_authoritative_input_vat_065.sql`
18. `scripts/tests/tax-065-gate.cjs`
19. `scripts/tests/tax-065-gate.test.cjs`
20. `scripts/tests/tax-065-dry-run.cjs`
21. `scripts/tests/tax-065-dry-run.test.cjs`
22. `scripts/tests/tax-065-verify.cjs`
23. `scripts/tests/tax-065-verify.test.cjs`
24. `scripts/tests/tax-065-prior-functions.json`

The two shared expense-form changes affect only labels inside the existing
`inputVatOnly` Tax exception form. Approval/create forms retain their behavior.
All 25 unrelated untracked files are preserved byte-for-byte and remain unstaged.
The three completed one-time UAT cleanup SQL files also remain local and unstaged;
they are not part of this application release.

## Validation

- Disposable PostgreSQL: 4 scenarios covering existing records, immediate source
  and external VAT, no-VAT claims, explicit ambiguity, exclusion/restoration,
  retry/conflict/duplicate rejection, atomic failure, immutable audit, signed net,
  new/old filing snapshots, unchanged WHT, permissions, table security and rollback.
- 17 targeted UI/derivation tests: new and historical response contracts, pending
  visibility, correction access, Thai/English labels, frozen net, period mapping,
  per-form WHT and filing regression checks.
- Local synthetic Chrome: TH/EN at 390/768/1024/1440, immediate external save,
  source VAT, absent no-VAT claims, no second review, correction/exclusion and no
  money mutation RPCs. External requests blocked.
- Targeted ESLint, TypeScript, production build and diff whitespace validation.
- Seven local gate tests cover exact dependency/security contracts, approved
  baseline binding, complete rollback and SELECT-only post-apply verification.

Local DB command (no Production connection):

```sh
PGLITE_MODULE_PATH=/private/tmp/vp-tax-filing-053-deps/node_modules/@electric-sql/pglite node --test --test-name-pattern='065 ' scripts/tests/authoritative-input-vat-postgres.test.cjs
```

Applied 065 SHA-256: `eea28bb1470b964547815c90ad4d0be0b22408da1978176b49ac194ad855a54e`.
Preserved 064 SHA-256: `6f5e5d1d97d3fbca03f6866038437fe355e5e4e2f4c15051aad029953828a85e`.

## Completed manual Production gate

Approved post-cleanup baseline SHA-256:
`e435c194590aaa322c061e600705613d3757d0e8a8ad5357f6d1a194e6027d59`.
Captured at `2026-09-23T12:40:41.750864+00:00`.

The user-reported Post-Apply Verifier has `gate_pass = true`,
`historical_rows_unchanged = true`, `exact_approved_baseline_matched = true`,
and empty failed checks, function differences and catalog differences.
The approved rollback rehearsal also confirmed full rollback and no Production
business-row changes. These Production results were supplied by the user;
the release agent runs only local synthetic validation and read-only web checks.

The 490 broader unresolved baseline differences documented in the 064 evidence
remain unresolved and unaccepted. They are outside 065's verified dependency
surface and remain a known non-blocking issue; this release does not resolve or
silently accept them.

The gate scripts are retained as reproducible operator artifacts, not automatic
deployment steps. Do not reapply 065 or rerun the completed cleanup during release.
