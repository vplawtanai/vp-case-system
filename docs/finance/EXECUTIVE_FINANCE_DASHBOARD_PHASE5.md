# Executive Finance Dashboard — Phase 5

Repository `vp-case-web`, `main`; implementation baseline `9c1663f3321df6293b7b3f8353568a0420f51c2e`.
Route `/finance/overview`; Finance navigation `ภาพรวมการเงิน` / `Finance overview`.
The approved composite mockup is the visual target: green liquidity, blue business results, adjacent receivables/payables, purple Tax and Distribution, compact attention cards, source trace, explanatory sidebar. Mobile puts liquidity, business net, VAT and the first available explicit alert before the detailed sections.

## Read contracts and scope

| Metric | Authoritative read | Time and currency |
|---|---|---|
| Total/bank/office liquidity | `get_finance_treasury`, complete visible account snapshot | Current, grouped by account currency; unknown covering opening/balance propagates to the currency total |
| External inflow/outflow and internal transfer information | 071 `get_finance_cash_flow_summary(from,to)` | Selected calendar month, `currencies[]`; transfer once, excluded from external flows |
| Company income | 069 `get_finance_company_statement(month,all,'',0).totals[]` | Selected month; frozen v1/v2 effective Company Share; separate currencies |
| Company expense | 070 `get_finance_unified_company_statement(from,to,all,'',0).expense` | Selected month, THB (existing expense schema); excludes recoverable VAT, participant payouts, transfers, client-recoverable/unclassified expenses |
| Business net | Display subtraction of the two authoritative aggregates above | Per currency; never cash plus tax plus obligations |
| Receivables | 071 `get_finance_receivables_summary()` | Current outstanding, overdue, due within 30 days, undated, amount/count per currency |
| General Payables | 071 `get_finance_general_payables_summary()` | Current Company Purchase and Reimbursement only; participants excluded |
| Unpaid individual shares / oldest unpaid | 071 `get_finance_unpaid_participants_summary()` | Current effective unpaid entitlement; Company Share excluded; WHT settlement does not leave a false liability |
| Revenue awaiting allocation | `get_finance_revenue_distribution_workspace` pending summary | Current, per currency; explicitly an allocation basis, never described as cash; unresolved basis remains unknown |
| VAT / Input VAT source drill-down / customer WHT credit | Existing `readTaxMonth`, `taxMonthSummary`, `VatSources` | Same default current filing month → prior tax period as Tax Home; independent of management reporting month |
| Outgoing WHT awaiting remittance | Existing `summarizeDashboard` with `get_finance_tax_position` register | Existing withheld-minus-remitted summary for that tax period |
| Per-form filing state | Existing `filingObligationsForDisplay` and `filingObligationDisplay` | Existing frozen/live Tax Calendar evidence; no deadline means Data ready, not Ready to file; unresolved WHT form never guessed |

The 070 scalar income is deliberately not used because it has no currency dimension. 069 supplies the existing per-currency income projection. No new DB contract is needed. Treasury account totals add only authoritative balances from one snapshot, not paginated cash rows. All other dashboard aggregates come from existing server summaries; no browser-wide source scan is added. Existing bounded Tax module reads are reused unchanged.

The selector displays the complete selected month and its exact inclusive dates. Current balances/liabilities/alerts carry current-position wording. The Tax section independently labels both tax period and filing month. Refresh clears the current view until the matching request completes; late previous-period responses cannot overwrite it.

## Attention and navigation

- Paid expenses still unclassified: existing 070 count across all dates through Bangkok today, with links to both Company Purchase and Reimbursement workflows. No monetary total is invented for this count.
- Tax evidence/classification: existing pending Input VAT and unclassified outgoing WHT source states.
- Missing covering opening: visible Treasury account evidence; the affected currency balance stays `—`.
- Overdue invoices, outstanding General Payables, unpaid individual shares, pending allocations: existing aggregate counts and separated currency amounts.
- No score, inferred priority or fabricated deadline. Mobile uses the first present alert in the displayed order.
- Accounts open a read-only account breakdown with Statement links. VAT opens the existing read-only source trace. Recent economic rows link to Distribution or the originating Company/Claim request. Totals never come from those recent rows.
- No payment, classification, filing, issuance, distribution or transfer confirmation controls exist on this page. Existing permissions/guards apply to each read; denied/failed sections are unknown rather than zero.
- Statement remains actual money; `Statement > บริษัท` is not restored. Legacy modules are untouched.

## Validation evidence

- 071 local PostgreSQL/WASM DB/artifact suite: **16 PASS**. Existing scopes/security, read result shapes, currency separation, transfer anti-inflation, optional due date, paid/reversed/waived exclusion, WHT full-entitlement settlement, unchanged historical rows and existing objects.
- Dashboard and current Statement/Tax/General Payables (068)/Distribution/Invoice/Payment/Direct Money regression suite: **72 PASS**. Synthetic URL/anon key used by imports only; no Production connection.
- Browser: actual React/components/styles and VP shell, closed local synthetic read adapter; **TH/EN × 390/768/1024/1440**, keyboard/focus restoration, account and VAT source modal, report-month switching, independent tax period, multi-currency/unknown/empty/denied/error states. All RPC calls are reads; external requests blocked.
- Targeted ESLint, `npx tsc --noEmit`, Production build and `git diff --check` are release checks.
- Known pre-existing limitation: `payable-ui.test.cjs` has three obsolete navigation assertions (pre-Statement/Distribution/Admin visibility architecture). They also fail with the exact baseline HEAD navigation. That legacy test file is preserved. Current General Payables separation is covered by 068 UI and 071 DB tests.
- The 490 broader baseline differences remain documented outside the accepted dependency scope; this release neither accepts nor resolves them.

## Immutable applied database artifact

071 SHA-256: `2eea6e2ae7f2f3d127680a3912dd286b0cdb8073d09e997f15c138f2bbec342c`.
071 and all existing SQL/gate files are unchanged. No 072, Production SQL, backfill or financial transaction is performed by this release. Operator-reported 071 Preflight/Dry-run/Apply/Verifier success is the release authorization; do not rerun these during deployment.

## Exact release manifest (21 files)

```text
app/finance/FinanceSidebar.tsx
app/finance/finance-navigation.ts
app/finance/overview/data.ts
app/finance/overview/overview.module.css
app/finance/overview/page.tsx
app/finance/overview/workspace.tsx
lib/i18n/catalog.ts
lib/i18n/messages/executive-finance.ts
scripts/tests/executive-dashboard-fixture.cjs
scripts/tests/executive-dashboard.test.cjs
scripts/tests/executive-dashboard-browser.cjs
docs/finance/EXECUTIVE_FINANCE_DASHBOARD_PHASE5.md
docs/finance/EXECUTIVE_FINANCE_READ_CONTRACTS_071.md
scripts/tests/executive-finance-postgres.test.cjs
scripts/tests/executive-finance-artifacts.cjs
scripts/tests/executive-finance-artifacts.test.cjs
scripts/tests/executive-finance-contract.json
scripts/sql/preflight_executive_finance_071.sql
scripts/sql/dry_run_executive_finance_071.sql
scripts/sql/verify_executive_finance_071.sql
supabase/migrations/202607180071_add_executive_finance_read_contracts.sql
```

## Human UAT (read-only)

1. การเงิน → ภาพรวมการเงิน: compare current total/bank/cash with Statement and open the account breakdown. An account without a covering opening must remain unknown.
2. Select the reporting month; compare external flows and transfers with Statement. Check Company Purchase cash 1,070, economic expense 1,000 and eligible Input VAT 70 stay in separate sections. Incoming WHT and opening balances must not inflate inflow.
3. Compare invoice outstanding/overdue/undated amounts and Company/Reimbursement liabilities with their source workflows; compare unpaid individual shares separately with Revenue Distribution.
4. Compare the labeled tax period, VAT/WHT figures and per-form readiness with Tax Position; open VAT source details. Changing management month must not silently change the Tax filing month.
5. Check TH/EN and mobile, select an attention item and a recent source; confirm navigation lands in the existing workflow. No financial action is needed for this UAT.
