# Tax Position Foundation (050)

Migration 050 was manually applied by the business owner, who reported a passing
Production post-apply verifier with empty failed checks, catalog differences and
function differences. The approved closeout exposes the UI; it performs no
Production SQL, historical materialization or other business action.
Applied migration SHA-256:
`8960d14f7738a9b14675846b81a3cb7ddf0fd5688242bf5b79f45f5275047bc6`.
Migration 050 and all earlier applied migrations remain unchanged.

## Focused source audit

| Evidence | Existing authoritative contract | Projection |
| --- | --- | --- |
| Direct Money | 047 confirmed snapshot, stable line UUID, explicit classification overlay, received_on | Known line VAT and incoming WHT; receipt-date basis explicitly identified |
| Payment WHT | 036/041/047 persisted components, base/rate/calculated amount, received_on | Positive WHT components only; zero/non-applicable lines excluded |
| Legacy Payment WHT | Confirmed Payment amount without reconciling structured components | Credit retained with NULL base/rate; never reverse-engineer a percentage |
| VAT documents | 039/040 Tax Invoice items and approved finance_tax_point_events | Issued standalone/Combined tax child is the single VAT key; occurred_on is the date, not issue date |
| CN/DN | 043 issued correction document and structured correction lines | Signed base/VAT delta on adjustment_date; original facts retained |
| Replacement/copy | 043 documentary identity/copy corrections | No new economic VAT; original tax point/value unchanged |

Invoice issue alone is not interpreted as tax-point approval. Invoice items with
VAT but no approved issued tax evidence are reported as a coverage gap, not a
zero liability. Direct Money has no approved tax-point-event row: its known
VAT is explicitly labelled `confirmed_receipt` using the frozen receipt date,
not presented as an approved document tax point. No earlier-event date is
invented. This register is a source-evidence position, not a statutory filing
calculation or a claim that all output VAT has been collected.

Current source scope is THB. Non-THB Payment credits are not relabelled or
converted; the private source projection reports `currency_outside_phase_scope`.
No VAT is reconstructed from Cashbook, received cash, distribution or payables.

## Evidence and corrections

`finance_tax_source_revisions` freezes the full source envelope, fingerprint,
source identity, revision, predecessor, actor and reason. Stable line IDs plus
revision/tax kind uniquely own facts in `finance_tax_position_facts`. Latest
source revisions are effective; predecessor revisions remain queryable history.
MD5 is a deterministic change fingerprint, not an authenticity signature.

Existing sources: explicit Admin-only one-source import/rebuild with exact
expected-source comparison, acknowledgement and reason. No automatic migration
backfill. Repeated unchanged import returns the same revision and writes nothing.
Source-row locking and a tax-domain advisory lock serialize import and filing.

Future qualifying status changes: deferred source hooks project the completed
transaction. Failure rolls the source transaction back. Payment/Direct reversals
append an empty successor revision instead of deleting facts. Direct explicit
classification creates a new frozen revision. Tax Invoice issue and CN/DN issue
project authoritative frozen tax evidence once. No existing RPC is replaced.

Changed source evidence reopens affected periods, preserving the previous filed
state/reference in an append-only audit. Corrections retain original history;
CN/DN deltas are not a rewrite or a second copy of the original VAT amount.

## Monthly VAT and incomplete input VAT

Monthly period keys use the source effective date. `known_output_vat` is only
the effective facts in this register, not a completeness assertion. The current
Expense Claim UI has an amount/attachment workflow, not a complete structured
supplier-tax-invoice eligibility/coverage register. Accordingly input VAT remains
`incomplete`; input and net totals are SQL NULL, enforced in the schema and UI.

Future input-VAT integration must establish supplier identity/tax document and
line identity, tax date, period, currency, gross/base/VAT, eligibility/exclusions,
original evidence/fingerprint, duplicate coverage, review authority and correction
history before completeness or net VAT can be asserted. No Expense Claim changes.

Period states: open -> ready_for_review -> filed; review/filed can reopen with a
reason. Filed requires explicit external filing reference/date/acknowledgement.
It records a human's external filing evidence even while the register remains
incomplete; it does NOT certify net VAT or perform government filing. There is
no paid/remitted flag, remittance RPC, cash movement or statutory deadline.

## Incoming WHT

Base/rate/amount come from stored structured semantics only. Certificate metadata
already stored under Payment `wht_certificate` evidence is frozen and marked
received, not verified. Otherwise awaiting_evidence. Explicit received/verified
or return-to-awaiting decisions require reference/reason and acknowledgement.
Append-only events have a monotonic sequence so successive decisions in one
transaction remain ordered. Superseded facts cannot receive new evidence actions.
No claimed/used state is inferred. Period_month also safely identifies receipt
year; no tax-return eligibility/year election is invented.

Synthetic acceptance examples: Direct receipt base 10,000 / VAT 700 / WHT 300 /
actual cash 10,400; separate Payment WHT 120. Production 028430C3 and 95E22D0E
are not read or materialized during implementation.

## Outgoing WHT: reserved, not operational

`finance_outgoing_wht_obligations` reserves payout/source-line/fingerprint,
payee, explicit treatment/rate, base, withheld amount/date/period/currency,
frozen evidence, filing status and a separate remittance status/amount.
An insert guard rejects all writes until a future controlled payout migration.
There is no create RPC, payout engine or outgoing record in this phase.
No role, name or economic classification determines a WHT rate.

Future gross 3,104 with WHT 100: payout cash 3,004; held tax liability 100;
later government remittance cash 100. These are distinct future cash legs.
This phase implements neither. The UI says the workflow is unavailable rather
than displaying a fabricated 0.00 obligation.

## Cash and document boundary

VAT is already part of receipt cash; incoming WHT is credit, never cash.
Tax facts/filing/evidence actions write only this tax domain. They cannot create
Cash, Ledger, Compensation, Payout, Revenue Allocation or customer documents.
No Receipt, Tax Invoice, Combined or WHT certificate is issued automatically.
Payment/Direct confirmation retains the independent existing Treasury behavior.

Future available-money concept only: system cash minus held VAT/outgoing-WHT
liabilities, client money and restricted funds. This is NOT profit, retained
earnings or free cash flow. No available-cash metric is implemented here.

## Permissions and UI

Backend: active Admin/Partner or existing Tax Invoice view/manage/issue grant can
view; existing Tax Invoice management authority controls period/evidence actions.
Historical imports are Admin-only. Partner is read-only unless explicitly granted
existing tax-management authority. RLS has SELECT-only policies, browser DML and
private helper execution are revoked, frozen rows cannot be rewritten/truncated.

`/finance/tax-position` uses VP UI System v1: monthly VAT, incoming WHT, future
outgoing WHT, secondary source import/audit. Explicit acknowledgement/reference,
stale-source errors, busy lock, focus management, readable narrow layout and TH/EN.
Following human Production verification, the Finance navigation exposes
Treasury -> Tax Position -> Expense Claims to existing tax viewers and Partners.
Action visibility still comes from the authoritative backend permission response.
The empty register also identifies incomplete input VAT and undetermined net VAT;
external filing remains explicitly separate from remittance.

## Local/operator workflow

1. Preserve the exact applied migration and operator artifacts; do not rerun SQL
   against Production during repository finalization.
2. Run focused local PostgreSQL/static/browser tests, lint, TypeScript and build.
3. Commit the intended files and deploy that exact commit after validation.
4. Human UAT first opens Tax Position and checks the empty register, incomplete
   input VAT, undetermined net VAT and unavailable outgoing workflow in TH/EN.
5. Historical one-source materialization is a separate explicit human action.
   Do not import Direct Money 028430C3 or Payment 95E22D0E during deployment.

Artifacts: `scripts/sql/{preflight,dry_run,verify}_tax_position_foundation.sql`.
Generation: `node scripts/tests/tax-position-artifacts.cjs --write` uses the exact
isolated catalog manifest. Verification reports exact catalog/function diffs.
The preflight and verifier each return one row from one SELECT-only statement.

Focused validation: tax-position PostgreSQL/static/browser fixtures; targeted
ESLint, TypeScript, build and whitespace checks. Browser fixture blocks all
non-loopback requests. No Production credentials, SQL or application actions.
