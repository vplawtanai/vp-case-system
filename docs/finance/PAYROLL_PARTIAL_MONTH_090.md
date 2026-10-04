# Payroll P1 corrective gate 090

Status: Migration 090 Human-applied and verified PASS; application release
authorized. Migrations 089 and 090 are immutable. Release work performs no
Production SQL, business RPC, row mutation or backfill. Human application UAT
remains a separate step after deployment.

## Root cause and boundary

089 `payroll089_sources(date)` selected a rate only when its `effective_from`
was on/before the engagement service start used for that month. A first rate
starting later within the month therefore produced a null `rate_id`, even when
it covered valid service days. `payroll089_manage` then rejected creation before
a line could be reviewed. Banking is not consulted by that create guard.
The API also stripped person evidence from the error code.

This proves the contract defect. No Production rows were inspected to attribute
a particular failing payee ID or engagement date in the reported UAT case.

## Smallest corrective contract

Only `public.payroll089_sources(date)` is replaced, by additive migration 090.
Signature, owner, SECURITY DEFINER, STABLE and `search_path=public` remain;
its existing private EXECUTE grants are unchanged. The helper now also checks
active Admin when executed by its owner through an RPC.

No tables, columns, triggers, RLS policies, grants or public RPC signatures change.
`payroll089_manage`, `payroll089_read`, payment batch, 088 expense batch,
individual payouts and Statement/Cashbook functions remain byte-exact.

Engagement/rate intervals are half-open, derived from the next effective event.
They are intersected with the selected calendar month. Every active engagement
segment must have at least one rate with a nonempty intersection. Boundary-only
contact (e.g. rate starts on the engagement termination date) is not overlap.
The existing fail-closed multiple-engagement-segments-per-month guard remains.

A source records the original engagement, reference rate and every contributing
rate with the dates it covers. Effective end evidence is clipped to the service
interval so an unrelated future event cannot alter a current draft's evidence.
`source_json.manual_review_required` and `manual_review_reasons` describe:

- `engagement_starts_mid_month`
- `engagement_ends_mid_month`
- `rate_starts_after_service_start`
- `rate_ends_before_service_end`
- `rate_changes_during_service`

The existing `requires_base_review` column carries the enforcement flag. A full
month with one unchanged covering rate keeps its monthly amount. A flagged line
starts with **0.00 as an unresolved draft placeholder**, never calculated pay.
There is no proration, full-month assumption, tax or social security computation.
The UI leaves the unresolved base input blank so Admin must enter an amount.

Existing review controls are reused: `reviewed=false` initially; the `line` RPC
requires an explicit valid amount, adjustment reason and review note and records
the actor/input in the existing request/audit tables. Approval blocks unresolved
review, freezes the reviewed amount and source evidence, and creates no cash.
Contractors cannot have employee or employer social security (existing CHECK).
Payment continues to create one payout and one immutable cash outflow per person.

Missing overlap raises `PAYROLL_RATE_MISSING` with structured DETAIL containing
only payee ID, month, reason and service dates. The application resolves a name
from its already-authorized caller-visible People response; it never returns raw
SQL, raw detail, unrelated identities or bank data in errors. The entire draft
transaction rolls back if any selected source is missing a rate.

## Existing records

Migration 090 performs no business DML or backfill. Approved history is untouched.
Pre-090 drafts are not rewritten either. Their old source evidence differs, so
the existing approval guard requires Admin to use **Reload people / rates** and
review again. This explicit existing action resets draft reviews; it is not run
by the migration, gate, tests against Production or application deployment.

## Application changes

- `app/finance/payroll/model.ts`: read-only month readiness and masked destination
  projection from existing Finance payee/destination data; no storage duplicate.
- `app/finance/payroll/workspace.tsx`: per-person type/rate/effective dates,
  current-month readiness, separate payment setup status, one read-back and saved
  confirmation, selected-month guidance and explicit manual amount review.
- `app/finance/payroll/labels.ts`: TH/EN readiness, reason/date and person-specific
  missing-rate messages, with fallback for pre-090 historical source JSON.
- `app/finance/payroll/client.ts`, `lib/server/finance-payroll.ts`: transport only
  sanitized person-specific diagnostic context after Admin authorization.
- `app/finance/payroll/payroll.module.css`: compact readiness block.

Recipient/bank readiness is shown separately from permission to create a draft;
missing a bank destination does not falsely block period creation. Bank numbers
are masked to the final four digits on cards. The previous People eligibility,
search, creation/termination forms, internal-only scope, landing and shell remain.

## Gate provenance and preservation

`finance-payroll-overlap-artifacts.cjs` imports the accepted 089 full-object pins.
Its new fixture contains only the local hash of the changed helper, not invented
Production contract expectations. Column NOT NULL uses `attnotnull`; PG18's extra
NOT NULL constraint catalog rows are excluded as in the accepted 089 projection.
Text aggregation uses `COLLATE "C"` where order affects a fingerprint.

The preflight is one static SELECT. It reports exact function/table differences,
component row counts/hashes, and aggregate `rows_sha256` / `preserved_sha256`.
Rows include ALL existing Finance and Payroll tables, user_profiles,
case_audit_logs and document_numbering_profiles. Preservation captures all public
tables (columns/ACL/policies/constraints/indexes/triggers), all public functions
except the one intended replacement, views and default grants.

The migration locks public business tables while comparing before/after rows
and unchanged catalog evidence in the same transaction. It fails if the accepted
089 input contract differs, if already applied, if a row changes, or if the final
installed object differs. The SELECT-only verifier executes no business RPC.

The verifier is bound to the exact Human-reviewed Production baseline:

- `rows_sha256=d6effc8fcf950a4526d7258f08c456eb915d3bf50848f82e76f71efd540cbe01`
- `preserved_sha256=6e27eeeec1ca4b15def77cf4b254249cc1227d06a22eb966c286254776a56c81`

Human reported post-apply `gate_pass=true`, empty failed checks and table/function
differences, and `business_rpc_executed=false`. Baselines are never learned from
disposable fixtures or replaced with subsequent business activity. The verifier
retains its row/catalog equality checks and its unbound-baseline fail-closed test.
File immutability is validated locally; SQL reports the pinned 089 SHA as artifact
metadata, not as a claim that PostgreSQL can inspect repository file bytes.

Immutable 089 SHA:
`d08607902bb1e04ade69c320d7538336168f83fe627aad19985234a9fb71d53b`

090 candidate SHA:
`ac132aca894486c8652f47ad01a7a864a3cd765fd79273d4ab331595eaece74b`

## Targeted local validation

- `node scripts/tests/finance-payroll-overlap-artifacts.cjs`
- `node scripts/tests/finance-payroll-overlap-local-postgres.cjs`
- `node --test scripts/tests/finance-payroll.test.cjs scripts/tests/finance-payroll-overlap.test.cjs`
- `node scripts/tests/finance-payroll-overlap-browser.cjs`
- touched-file ESLint, `npx tsc --noEmit`, `npm run build`, whitespace/scope review.

The disposable PostgreSQL 18 runner has a private Unix socket, no network listener,
no .env loading and no Production mode. It runs relevant 089/payout regressions
then 090 overlap/review/freeze/privacy/preservation/drift/rollback/payment checks.
The existing fixture includes approved October 2026 history; the new PostgreSQL
October draft scenario uses October 2027 to preserve that history. The application
readiness test explicitly covers 4 October 2026. No real People are used.
Browser validation uses the actual components with synthetic adapters and blocks
non-loopback traffic: Thai desktop and English 390px, no overflow/runtime errors,
manual review, masked bank save/read-back, immediate month guidance.

## Archived Human Gate commands (do not rerun applied migration)

Preflight:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_finance_payroll_partial_month_090.sql
```

After fresh preflight review and baseline binding, Human Apply:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610040090_finance_payroll_partial_month.sql
```

Post-Apply Verifier, after binding reviewed baselines:

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_finance_payroll_partial_month_090.sql
```

## Application release and Human UAT

Release uses the established push-to-main Vercel Git integration. Only these 18
files are staged; deployment/commit correspondence is recorded in the release
response. Unrelated work and all prior migration bytes are preserved.

- `app/finance/payroll/client.ts`
- `app/finance/payroll/labels.ts`
- `app/finance/payroll/model.ts`
- `app/finance/payroll/payroll.module.css`
- `app/finance/payroll/workspace.tsx`
- `lib/server/finance-payroll.ts`
- `docs/finance/PAYROLL_PARTIAL_MONTH_090.md`
- `scripts/sql/preflight_finance_payroll_partial_month_090.sql`
- `scripts/sql/verify_finance_payroll_partial_month_090.sql`
- `scripts/tests/finance-payroll-overlap-artifacts.cjs`
- `scripts/tests/finance-payroll-overlap-body.sql`
- `scripts/tests/finance-payroll-overlap-browser.cjs`
- `scripts/tests/finance-payroll-overlap-local-postgres.cjs`
- `scripts/tests/finance-payroll-overlap-postgres.test.cjs`
- `scripts/tests/finance-payroll-overlap.test.cjs`
- `scripts/tests/fixtures/finance-payroll-overlap-contract.json`
- `scripts/tests/fixtures/finance-payroll-overlap-reviewed-baseline.json`
- `supabase/migrations/202610040090_finance_payroll_partial_month.sql`

Human UAT after deployment:

1. Open People; confirm the Contractor's rate/effective date, review readiness,
   recipient status and masked bank summary in Thai/English and on mobile.
2. Create the October period for an overlapping mid-month rate. Confirm the line
   requires review and has no automatically prorated/full-month payable amount.
   If a pre-090 draft already exists, use the explicit reload action and re-review.
3. Confirm approval is unavailable before review; enter the actual amount, reason
   and note, save, then verify the reviewed state. Contractors show no SS fields.
4. Approve only an accounting-reviewed real period; verify facts freeze and no cash
   is created by approval. Actual payment remains a separate existing workflow.

STOP for Human Production UAT. Do not create automated Production test records.
