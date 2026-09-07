# Phase 6B: Tax Invoice Foundation V1

The business owner reported manual Production apply and post-apply PASS for Migration
039: `tax_invoice_foundation_verification_pass = true`, `failed_checks = []`, and
`catalog_differences = []` on PostgreSQL 17.6 (`catalog_server_version_num = 170006`).
Repository finalization does not execute SQL or perform Production business actions.

Applied Migration 039 SHA-256:
`ba3ac87475330ebfd59d985099ff6e2c1836b90c7966739fced0b75809e0abab`

All five Tax Invoice foundation tables remain empty according to that verification.
Protected Invoice VP-IV-202609-000003, Payment 9E2F601E, and Receipt
VP-RC-202609-000001 remain unchanged. The buyer identity is intentionally incomplete
and must continue to block Issue; finalization must not fill it in or change Client data.

## Scope and authority

- Tax Invoice is a separate documentary/tax domain, not a settlement or cash source.
- An issued V2 Invoice must contain exactly one active frozen line. One effective
  confirmed Payment must settle that entire Invoice. Partial/mixed scope is blocked.
- Original line base/VAT/gross are copied without recalculation. WHT is frozen as
  settlement credit and never reduces VAT base or creates a cash movement.
- Active header uniqueness prevents duplicate Payment documents; active source-line
  coverage uniqueness prevents duplicate VAT coverage. Cancelled Drafts release
  reservations while preserving their history. Issued coverage remains permanent.
- Creation and Issue retry the same document. Payment locks serialize lifecycle
  actions; row locks and unique constraints protect numbering and coverage.
- Separate view/manage/issue capabilities require an active profile. Admin receives
  those capabilities by policy. Ordinary Finance/Receipt rights do not imply them.
  Browser writes to authoritative tables and direct calls to private helpers are denied.

## Decisions and evidence

- Persisted tax point is `payment_received` using Payment `received_on`, with an
  explicit human acknowledgement that no earlier VAT-triggering event applies.
  Event records have their own ID/evidence/approver. New event types need a future
  controlled extension; existing issued records do not need to be rewritten.
- `issue_date` defaults to today's Bangkok date, never the older Payment date.
  Earlier than tax point / future dates are rejected. A later date requires a
  separate delayed-issuance acknowledgement, recorded in the Issue audit.
  System `issued_at` remains separate from both dates.
- Seller VAT registration follows the approved VP policy. Name/address/13-digit
  tax ID and explicit stored Head Office evidence must still be present.
- Buyer name/address and explicit VAT registration decision are required. A VAT
  registered buyer also needs tax ID and Head Office/branch code evidence.
- Missing buyer facts may be supplemented in this document only, with an evidence
  reference. Already-frozen name/address/tax ID cannot be overwritten. Client master
  data and historical Invoice/Receipt snapshots are never repaired automatically.
- Positive-VAT and explicit zero-rated treatment must match frozen source facts.
  Zero-rated treatment additionally needs evidence. Exempt/outside-scope/ambiguous
  zero-VAT sources are blocked in V1. Economic classification is never a tax rule.
- Human confirmation of no external Tax Invoice / prior external VP-TI use is
  mandatory. SQL cannot establish facts in an external manual document register.

## Lifecycle and integration

Draft -> Issued or Draft -> Cancelled. No issued Void/correction path is exposed.
Only Issue allocates `VP-TI-YYYYMM-NNNNNN` atomically. Failed Issue rolls back its
number. Frozen issued evidence includes identities, source Invoice/item, treatment,
tax event/approver, Payment, optional issued Receipt reference, issue date/number/actor,
and immutable logo evidence from Migration 038. Rendering never falls back to a live
company logo. Manual DocumentAuthorization is a signing space, not signature evidence.

Active Tax Invoice evidence blocks upstream Payment reversal/reallocation, Invoice
Void, and reversal of a referenced Receipt. Existing non-Tax dependency checks remain.
Cancelled Tax Drafts do not create a permanent false blocker. No lifecycle RPC writes
Payment, Cash, Ledger, Compensation, Revenue Allocation, or Receipt rows.

## UI and layout

Confirmed Payment and issued Receipt expose the Tax Invoice next action, showing
scope/identity/tax-point blockers. Missing identity can be kept in a Draft but cannot
pass Issue. The workspace presents source amounts, only genuinely missing identity
fields, explicit VAT/tax-point decisions, saved/dirty state, frozen Preview, then final
Issue acknowledgements. Draft cancellation/refresh are subordinate. Refresh of changed
source evidence clears decisions and requires review again. Issued documents are read-only.

The indigo Tax Invoice theme uses shared identity/logo and A4 infrastructure. On narrow
screens the workspace stacks and the fixed A4 document pans inside its own viewport;
financial columns are not rearranged. Browser Print/PDF hides application chrome.

## Prepared files

- `supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql`
- `scripts/sql/preflight_finance_tax_invoice_foundation.sql`
- `scripts/sql/dry_run_finance_tax_invoice_foundation.sql`
- `scripts/sql/verify_finance_tax_invoice_foundation.sql`
- `app/finance/tax-invoices/`: access, loading, list/detail/preview, document, review,
  next action, shared decoding/messages, and scoped styles.
- `app/finance/payments/[id]/page.tsx`, `app/finance/receipts/[id]/page.tsx`: next action.
- Payment/Invoice/Receipt `shared.ts`: actionable new dependency error only.
- `lib/permissions.ts`, Finance navigation and Quotation profile selection: capability wiring.
- `DocumentAuthorization.tsx`, `DocumentTheme.module.css`: new kind/scoped theme only.
- `scripts/tests/tax-invoice-*`: isolated PostgreSQL, catalog/workflow generation,
  lexical/static checks, renderer/review and network-blocked A4/narrow fixtures.
- `scripts/tests/document-theme.test.cjs`: new approved palette regression.

## Review and validation limits

The preflight/verifier each contain one SELECT statement with named checks and
`failed_checks`. Existing mutable Ledger counts are observations, never pass conditions.
Protected Payment/Invoice/Receipt facts and complete row hashes are reported; compare
hashes before/after the manual apply to establish byte-level evidence preservation.
The old Tax-Invoice-object-absence UAT condition is superseded by exact 039 catalog and
zero-row checks after installation. New tax tables/counters must remain empty at apply.

Catalog comparison checks nullability through `pg_attribute.attnotnull`, excluding the
additional table NOT NULL constraint rows introduced by PostgreSQL 18. Types, positions,
defaults, other constraints, and indexes remain exact checks. The verifier reports
property-level `catalog_differences` and the server version rather than hiding mismatches
behind a single boolean. Its rollback-only dry-run embeds the applied migration exactly.

PostgreSQL tests use PGlite and synthetic predecessor fixtures. They exercise actual
037/038/039 functions, constraints, RLS, permissions, failures, retries, and rollback.
The fixture's base schema is intentionally minimal; Production catalog preflight and
rollback-only rehearsal remain necessary. PGlite serializes requests, so independent
multi-session contention has not been load-tested. Uniqueness/locks are reviewed and
duplicate reservation / sequential retry / atomic rollback are tested.

Local tests cannot establish actual statutory identity or an earlier tax event. The
protected WHT chain is for Draft/blocker UAT only until a human supplies mandatory
identity and evidence. It must not be issued automatically.

## Manual deployment history

1. Run only the preflight and review every named check.
2. After separate approval, run the dry-run; it embeds exact 039 and ends ROLLBACK.
3. After separate approval, manually apply 039, then run the post-apply verifier and
   compare protected hashes. Stop on any mismatch. No business data is created.
4. Only after schema approval may the frontend be committed/deployed for human UAT.

The business owner has completed steps 1-3 and authorized repository finalization and
frontend deployment. Applied migrations 001-039 must remain unchanged.

## Next human UAT

After deployment, open the existing confirmed Payment 9E2F601E or issued Receipt
VP-RC-202609-000001 and inspect the Tax Invoice next-action eligibility messages.
Verify that incomplete buyer identity is explicitly reported as an issuance blocker.
Do not create a Tax Invoice Draft, change buyer identity, or Issue a Tax Invoice in this
initial check. Stop and send screenshots of the blocker UI for review.
