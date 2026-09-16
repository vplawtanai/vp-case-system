# Payee and Payout foundation (051)

Status: the business owner reported manual Production apply and successful
post-apply verification: `payee_payout_foundation_verification_pass = true`, with
empty failed checks, function differences and catalog differences. Reported state:
Payees 0, Payouts 0, Cash Transactions 2 and Opening Balances 2. Repository
finalization and UI deployment are authorized; Production business writes are not.

Migration 051 remains the exact prepared artifact, SHA-256
`574bfd3146875248bae796dec25ced0d5b367a6ae3f362148158466e29a3f490`.
Its dry-run embeds the same bytes. Production application is attested by the
business owner, not independently queried during finalization. Do not reapply it.

## Focused audit and decisions

- 048 entitlement components are immutable, full economic rights from frozen
  finalized Distribution evidence. Current internal recipients use user_profiles
  UUIDs. External display names alone deliberately fail closed at materialization.
- 051 was the next unused migration after the applied 050 at preparation. Applied migrations are
  not edited. There is no historical data rewrite, Payee population or cash cutover.
- Internal Payee ID equals user_profiles.id with a unique profile FK. An internal
  profile appears as a virtual read-only choice before the first explicit save;
  reads do not create rows. External Payees use independent UUIDs, never names or
  login accounts. Profile deletion cannot orphan existing internal entitlements.
- Prospective external Distribution choices carry recipient_payee_id. The shared
  exact-cent formula keeps its prior internal/legacy calculation contract. 051
  validates external UUID/name/active status before finalization. Historic frozen
  evidence is never silently assigned a Payee. An unresolved old external choice
  still fails closed and must be explicitly selected while editable.
- Payee name/entity are sufficient to establish a relationship. Tax ID and bank
  destination may be absent. A destination, when supplied, is one complete bank /
  account-name / account-number set. UI does not claim tax readiness from a role.
- Destination changes append a new row and deactivate the former one; Payee changes
  require expected version and append audit evidence. Normal UI masks tax/account
  numbers; authorized editors can see the fields needed to correct master data.

## Lifecycle and atomicity

One Payout belongs to one canonical Payee and one company Treasury source. Drafts
can select one or more FULL THB entitlement components and explicitly choose WHT
per component. No partial components, zero-net payout, cross-Payee settlement,
foreign-currency payout or rate inferred from role is supported in this V1.

Draft save has no financial effects. Draft cancellation is versioned/idempotent.
Confirmation requires acknowledgement, the saved Payout version, current Payee
version and the expected destination. It freezes identity, destination, source
account, opening evidence, paid date, gross rights and tax choices.

The transaction atomically creates:

1. One immutable confirmed Payout.
2. One allocation per selected full entitlement, UNIQUE(entitlement_id).
3. One confirmed Cash Transaction, UNIQUE(source_payout_id), for NET actual cash.
4. One outgoing-WHT obligation per positive-WHT allocation, UNIQUE(source_line_id).
5. Append-only Payout and Cash audit evidence.

Gross rights - per-component rounded WHT = net payment. Example: 3,104.00 minus
93.12 = 3,010.88. WHT is retained cash and an obligation, not a second cash outflow.
There is no government remittance, certificate, filing, VAT adjustment, incoming
WHT adjustment, company-share change, Ledger posting or legacy Compensation write.

Lock order: Payout lifecycle advisory lock, received-money sources in sorted order,
Distribution rows, entitlement rows, Payout, Payee/destination, then the existing
THB cutover lock and Opening Balance. The source order matches supersession.
The unique allocation index prevents a second Draft settling the same right.
Deferred integrity triggers verify all paired effects before commit; failures roll
back the whole confirmation. Confirmed retry returns the same ID with no duplicate
cash, tax or audit row. Settled Distributions cannot be superseded. Generic Cash
reversal cannot reverse a Payout leg. Confirmed correction/reversal is future work.

Raw entitlement rows remain immutable/open. The Payables RPC derives `settled`
from immutable Payout allocation coverage and excludes it from open payable totals.
The new status is a read-model value, not a rewrite of historical component rows.
Payouts use UUID short references, not a new permanent document-number series.

## Treasury and tax

Company bank source requires a complete recipient bank destination. Office Cash
does not. Positive outgoing WHT requires a tax ID. Confirmation requires an active,
authorized source, a confirmed Opening Balance and paid date strictly after its
Bangkok cutoff. Unknown system balance is not zero and blocks confirmation.

Existing Treasury has no negative-system-balance hard guard. 051 preserves that
policy, warns in the UI and never claims the system balance is bank reconciliation.
No opening is created by Payout. No external transfer is initiated by this system.

050 outgoing evidence is activated only through the paired Payout contract. Tax
Position exposes withheld and unremitted amounts for the selected month, separate
from incoming WHT and VAT. Filing and remittance stay unfiled/not_remitted/zero.

## Permissions and privacy

Mutation: active Admin, or an active non-Partner/non-Viewer with BOTH existing
manage-Payment and confirm-Cash permissions. Existing Treasury account access is
also required. No new user permission fields. Partner remains read-only here even
if stale write flags exist. Read RPCs require existing Payment view authority.

Six new tables have RLS enabled and no PUBLIC/anon/authenticated direct privileges.
Only the six public Payee/Payout RPCs are executable by authenticated users; private
helpers and predecessor functions are not. Non-managers receive masked sensitive
snapshot identity. Histories are scoped to the requested canonical Payee.

## UI and navigation

The existing DetailModal provides focus management and Escape restoration. One
compact workspace shows recipient, full component selection, explicit per-component
WHT, company source/date, note, strong net-payment summary and recipient history.
Saving recipient details preserves current unsaved component/tax selections.
Confirmation restates gross/WHT/net, payer source and recipient destination. A
confirmed Payout shows frozen identity and no edit/cancel/confirm action.

Mockup adaptation: left workflow/right summary at desktop; WHT and source adjacent
when space permits; narrower layouts stack. Repeated components remain individually
visible. Existing VP UI v1 controls are reused; unframed section separators avoid
nesting decorative cards. The horizontal Finance navigation is intentionally removed.

The application sidebar contains Finance routes in this order: Quotations,
Agreements, Charges, Invoices, Payments, Payment Documents (all existing children),
Treasury, Tax Position, Payables, Expenses, Legacy. Legacy exposes the REAL existing
`/finance/compensation` and `/finance/ledger` links under a subdued heading, not a
dropdown. Payout detail highlights Payables. Desktop Finance navigation remains
open; mobile uses the existing drawer with added Tab trapping/Escape restoration.
The Finance utility bar contains language selection and the existing account route.
No fake search/notification control is added. The redundant Finance heading is
omitted on Payout, which retains its own breadcrumb and page title.

## Operator artifacts

- `scripts/sql/preflight_payee_payout_foundation.sql`
- `scripts/sql/dry_run_payee_payout_foundation.sql`
- `supabase/migrations/202607180051_add_payee_payout_foundation.sql`
- `scripts/sql/verify_payee_payout_foundation.sql`

Preflight/verifier: one SELECT-only statement, one result row, named checks,
failed_checks, exact function/catalog differences, upstream hashes, observability.
Mutable Ledger/Compensation/Cash/Opening row counts are NOT pass/fail invariants.
The dry-run uses BEGIN/ROLLBACK, embeds 051 exactly, and compares unchanged upstream
evidence excluding only the new null Cash source column. It creates no business rows.
The post-apply verifier requires empty new Payee/Payout/outgoing foundations. Compare
upstream hashes from the operator's preflight and post-apply output as well.

## Prepared file inventory

New implementation:
`app/finance/payouts/[id]/page.tsx`, `shared.ts`, `workspace.tsx`,
`payee-modal.tsx`, `payout.module.css` (all under `app/finance/payouts`);
`app/finance/FinanceSidebar.tsx`, `app/finance/finance-sidebar.module.css`;
`lib/i18n/messages/payouts.ts`.

Existing integration points:
`app/components/AppTopNav.tsx`, `app/finance/FinanceSubNav.tsx`,
`app/finance/finance-navigation.ts`, `app/finance/payables/page.tsx`,
`app/finance/payables/shared.ts`, `app/finance/payments/vp-formula-editor.tsx`,
`app/finance/compensation/formula-calculation.ts`,
`app/finance/compensation/formula-engine.ts`,
`app/finance/tax-position/dashboard-data.ts`, `dashboard.tsx`, `page.tsx`,
`shared.ts` (last four under `app/finance/tax-position`),
`lib/i18n/catalog.ts`, `lib/i18n/messages/tax-position.ts`.

Tests/artifact generation under `scripts/tests`:
`payout-artifacts.cjs`, `payout-catalog.json`, `payout-integration-sql.cjs`,
`payout-postgres.test.cjs`, `payout-static.test.cjs`, `payout-ui.test.cjs`,
`payout-fixture.cjs`, `payout-browser.cjs`, `payable-ui.test.cjs`,
`vp-formula-presentation.test.cjs`, `tax-dashboard.test.cjs`.

The four SQL artifacts are listed above. This architecture document is the only
new documentation file. Unrelated untracked files are preserved.

## Validation commands

```sh
PGLITE_MODULE_PATH=/private/tmp/vp-direct-evidence-runtime/node_modules/@electric-sql/pglite node --require ./scripts/tests/receipt-render-fixture.cjs --test --test-name-pattern='^051' scripts/tests/payout-postgres.test.cjs
node --require ./scripts/tests/receipt-render-fixture.cjs --test scripts/tests/payout-static.test.cjs scripts/tests/payout-ui.test.cjs scripts/tests/payable-ui.test.cjs scripts/tests/vp-formula.test.cjs scripts/tests/vp-formula-presentation.test.cjs scripts/tests/tax-dashboard.test.cjs
node scripts/tests/payout-browser.cjs
npx tsc --noEmit
npm run build
git diff --check
```

The browser fixture bundles actual React/CSS and a synthetic RPC adapter, blocks
all non-loopback requests, tests TH/EN at 390/768/1024/1440, keyboard focus,
acknowledgement, save/confirm and readonly states. Financial behavior is separately
tested in isolated PostgreSQL, not asserted from that UI adapter.

Finalization checks: 50 focused UI/static/regression tests and seven isolated 051
PostgreSQL scenarios passed. Browser QA also exercises external-Payee creation,
empty required identity feedback and incomplete destination state, in both locales
at all four widths. Targeted ESLint, TypeScript, optimized build and tracked/new
file whitespace checks passed. No unrelated broad suites or Production UAT run.

After verified deployment, the next HUMAN step is Payables -> Pam -> Payout.
Inspect the selected recipient, full rights 1,940 + 1,164, explicit component WHT
choices and KBANK before/after system-balance preview. Do not assume historical
29,560 is still the current balance. Stop before Save or Confirm and send screenshots;
incomplete Payee master data must be completed only through a separately approved
human action. The implementation agent performs no Production UAT actions.

The operator SQL artifacts above are retained apply/rehearsal evidence, not
instructions to rerun the already-applied migration.
