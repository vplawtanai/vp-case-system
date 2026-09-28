# Finance Go-Live Gate 1 — permission and authority foundation

Status: **Migration 078 HUMAN-APPLIED and Production verification PASS; Gate 1 B1–B5 application release authorized**. Migration 078 is applied, immutable history. No Production SQL or business-data mutation is part of this application release. Human Production Permission UAT follows deployment; B6/B7 and full Finance go-live remain outside this release.

## Project and candidate

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`
- Branch: `main`
- Starting HEAD and local `origin/main`: `756c102d4e404650ebb2affcd19342e3b76882a6`
- Candidate: `supabase/migrations/202607180078_finance_go_live_permission_authority_contract.sql`
- SHA-256: `b54d1eb36bba029289eaaea226fa5ab57a5e42710114893ed38d80867e00bc7c`
- Candidate: 111,843 bytes / 901 lines.
- SELECT-only Preflight: 41,446 bytes / 55 lines (one trailing space removed for the release whitespace check; SQL behavior and reviewed hashes unchanged).
- SELECT-only Post-Apply Verifier: 63,307 bytes / 58 lines.
- Scope: B1–B5. B6 Legacy freeze and B7 cutover inventory are not implemented.

## Existing mechanisms reused

The implementation retains `user_profiles.role`, existing capability fields, active/password-change guards, `people_admin_save_profile` optimistic concurrency and audit, existing Finance permission helpers, RPCs and RLS. It reuses `finance_treasury_account_authorities`, `set_finance_treasury_authority`, `get_finance_expense_accounts` and the existing account-authority editor.

Existing Payment, Direct Money, expense settlement, participant payout, Tax filing/remittance, Treasury, Distribution v1/v2, receipt and tax document engines remain the accounting engines. Their source identity, amounts, validation, locks, uniqueness, idempotency, WHT treatment and audit mechanisms are retained. No new account-scope table or generic RBAC engine is introduced.

The sole added profile field is `finance_operator boolean NOT NULL DEFAULT false`. An Admin assigns or revokes it through the existing audited profile RPC. A new trigger prevents assignment through unauthorized direct INSERT/UPDATE. Existing roles and old capability values are not rewritten. No user is automatically assigned.

Effective Operator assignment applies to `lawyer`, `assistant_lawyer` or `staff`. Admin authority is role-derived. Partner always retains the frozen Partner bundle, even if the flag exists; a Viewer flag grants no Finance authority. Active status and completed password onboarding are required by server helpers.

## Authority matrix

| Area | Admin | Partner | Finance Operator | Lawyer / Staff without assignment |
|---|---|---|---|---|
| Routine revenue documents | Manage/issue | Manage/issue | Manage/issue | Denied |
| Actual incoming confirmation, reversal, effective void/cancel | Yes, original integrity/reason rules remain | Denied | Denied | Denied |
| New Finance expense approval / internal tax review | Yes | Denied | Denied | Denied |
| Expense/payable operations | Full | Operational | Operational | Own requests/status only |
| Actual outflow | All accounts, original controls | Denied | Approved source + exact account execution right | Denied |
| Statement balance / movements | All | All read | Assigned right on exact account | Denied |
| Transfer / opening / control plane | Yes | Denied | Denied | Denied |
| Distribution | Global | Proven referral sources only | Denied | Denied |
| Compensation | Global | Own + permitted referral context | Minimal payment projection | Own only |
| Tax read | Yes | Yes | Yes | Denied |
| Tax filing/remittance | Yes | Denied | Yes; remittance uses account rights | Denied |
| Finance Overview | Full | Business overview | Operational, account-scoped | Denied |

Inactive users and forced-password-change sessions receive no operational authority. Legacy flags such as `can_confirm_finance_payments`, `can_approve_expense_claims` and generic cash flags cannot bypass New Finance ceilings. Existing Legacy expense flags are retained; this task does not retire Legacy workflows.

### B1 — incoming and high-risk authority

`current_user_can_confirm_finance_payments`, reverse/reallocate helpers, cash manage/confirm/reverse helpers, receipt void, `statement_transfer_allowed` and `money_allocation_admin` become Admin-only. Routine quotation/payment/receipt/tax-invoice/billable-charge helpers derive the operations bundle separately.

Additional Admin guards cover `void_finance_invoice`, `transition_finance_direct_money_receipt`, accepted quotation cancellation, status cancellation setters, paid-expense/Legacy bridge exceptions, signer/service-pattern mutations, retired-template override, tax correction create/approve/issue and document-template mutation RPCs. Effective lifecycle triggers cover ten existing document/money tables. Existing `TREASURY_CASH_CORRECTION_WORKFLOW_REQUIRED` and accounting-integrity guards remain enforced for Admin.

Restrictive INSERT/UPDATE/DELETE policies add an Admin ceiling on existing Finance configuration, document configuration and Legacy ledger/compensation control tables. The private `vp-document-assets` bucket receives an Admin mutation ceiling without changing other buckets or making storage public. Existing policies survive; the candidate does not replace or normalize their ACLs.

### B2 — approval before payment

`expense_can_manage` and `expense_can_tax_review` become Admin-only; `expense_can_view_all` is operational and `expense_can_claim` is self-service. `prepare_finance_expense_payout` requires an accepted source with reviewer evidence for non-Admin execution. `finance078_require_payout` rechecks approval and the requested exact account right during confirmation/cancellation paths. `record_finance_paid_expense` remains an Admin exception with its existing evidence controls.

Preparation, approval and confirmation are separate in the UI. Payment account options require `can_record`; confirmation still requires `can_confirm`. Company-paid retrospective capture is Admin-only. Employee views omit the internal economic-review panel, while the server projection also removes internal tax-review/audit payloads.

### B3 — account custody

`expense_account_allowed` is the common authority resolver. It validates one account identity and one of four rights: `view_balance`, `view_movements`, `record_outflow`, `confirm_outflow`. Admin gets all; Partner gets read only; Operator requires an existing explicit row/right. Neither generic cash flags nor `finance_bank_account_access` grants execution. The existing table constraint that confirmation requires recording remains unchanged; read rights are independent of execution.

`treasury_can_view` and the bank-view helper mean balance-read. Movement reads in Treasury, monthly flow, cash-flow summary, account Statement and cash RLS use `view_movements`. Balance-only access does not disclose movement totals. Movement-only Statement removes opening/running/closing balances. Account navigation returns metadata for either read right.

Expense payout and Tax remittance preparation use `record_outflow`; confirmation uses `confirm_outflow`. The one-action participant payment RPC requires both. `finance078_execution_account` is private and retains the existing internal account snapshot shape; it does not require or grant public balance visibility. Public account/remittance projections redact unauthorized balances and retain an opaque account token for stale-state comparison. Original opening-period and balance-integrity validations remain inside the existing payment engine.

### B4 — scoped privacy

Partner referral evidence is an existing frozen `finance_payable_entitlements` row with `bucket='referral'`, `recipient_type='user'` and `recipient_id=auth.uid()`, attached to the same source's finalized Distribution. Previously finalized evidence remains usable after Admin supersession for that same source. Names are never matched. Without that UUID evidence, access is denied.

Workspace, detail, formula-context, received-distribution save/confirm and lifecycle RPCs enforce source scope. Partner cannot supersede. Distribution and audit table RLS apply the same ceiling. Raw entitlements, sources, audit, broad payout workspace and broad compensation APIs are Admin-only. Operator has no Distribution route or inline panel.

New `get_finance_compensation_access`, `get_finance_participant_payments` and `get_finance_own_legacy_compensation` supply own compensation or a minimal execution projection. `get_finance_distribution_payment_context` returns recipient/amount/payee/authorized accounts, without company formula, percentage, pool or source-allocation evidence. `can_pay` is separate from scoped `can_manage`.

`finance078_expense_projection` returns only requester facts, approved amount, status and sanitized settlement/payment for self-service. It omits internal `tax_review`, internal audit and unrelated Finance-review fields. Company economics and global unpaid-participant aggregates remain Admin/Partner; Operator Overview does not fetch them. Legacy own compensation is matched by `recipient_user_id`, not display name.

### B5 — People assignment and navigation

`people_admin_save_profile` accepts the one additional boolean, using its existing version/audit transaction. `lib/people.ts` validates it. `lib/permissions.ts` derives role bundles instead of letting old Finance flags exceed their ceilings. Active Case/Office role behavior is regression-tested unchanged.

Admin User Management adds one bilingual responsibility checkbox and a link to the reused account-authority editor at `/finance/expenses/accounts`. Save responsibility first, then assign accounts. New-user onboarding stays unchanged: create the account, then use Edit to assign the responsibility. The Advanced/Legacy capability section stays available.

Navigation removes the temporary Admin-only UAT visibility switch. Direct-route guards, incoming actions, expense actions, Distribution payment actions and Overview fetches follow the same derived bundles. `/finance/participant-payments` provides the minimum self/payment entry point using the existing participant payment modal. Tax filing/remittance authority is derived independently of generic cash confirmation.

## Guard construction and preservation

The before contract derives from accepted corrected 066 Production capture (`a571aab4d3b46e17e5eeb42923a367e25110fb5d99f9be92e563213b83aa2cdd`), reconciled 066 definitions, accepted 067–071 manifests, applied 073/074 source and 076 profile preservation evidence. Synthetic fixture ACLs are not promoted to Production truth. The Human-reviewed Production Preflight confirmed this scoped baseline before Apply.

The candidate pins exact definition/owner/security/ACL/effective-grant evidence for 117 existing functions and existing security contracts for 28 tables, plus the account-authority catalog. It changes 97 existing functions, introduces 18 functions/RPCs, 69 additive policies and 11 triggers, and adds the single profile flag. The exact function signatures and policy/trigger inventory appear below.

Existing function edits are checked, count-pinned replacements against exact guarded definitions. Existing function attributes/ACLs survive; `expense_account_allowed(uuid,uuid,text)` receives the explicit authenticated EXECUTE required for the new RLS contract. New functions default to private; only public RPCs and necessary RLS boolean helpers receive authenticated EXECUTE. No anon grant is added.

The migration is transaction-wrapped and requires `postgres`. It uses a 5-second lock timeout and 120-second statement timeout. It takes SHARE locks on public ordinary/partitioned tables while comparing before/after snapshots, so the manual run needs a quiet window. A guard/lock/preservation error rolls back instead of silently continuing.

Preservation snapshots include counts and deterministic row hashes for all `finance_*` tables, user profiles excluding only the new false-default field, `case_audit_logs` and document numbering. Unrelated public functions, policies, triggers, columns, relation ACLs, constraints, indexes and views are fingerprinted for before/after preservation. Textual fingerprint ordering uses explicit `COLLATE "C"`; JSONB objects supply canonical key order. The broader 490 Finance differences remain outside scoped acceptance: `broader_finance_differences_accepted=false`.

Neither static gate invokes a mutable RPC. Both are a single SELECT/CTE statement, including SELECT-only dynamic row reads. Preflight also rejects broken account-authority references, invalid account identity/confirmation combinations, and orphan Distribution/recipient entitlement references.

The Post-Apply Verifier is now bound to these exact Human-reviewed Production Preflight values, not local fixture hashes:

| Reviewed field | Value |
|---|---|
| `gate_pass` | `true` |
| `failed_checks`, `function_differences`, `security_differences` | `[]` |
| `candidate_sha256` | `b54d1eb36bba029289eaaea226fa5ab57a5e42710114893ed38d80867e00bc7c` |
| `rows_sha256` | `751daa38ea6138c64943910d142cfd6955cf6fb62caa1f515ea3e3d219d3ecc1` |
| `preserved_sha256` | `86815007700473fe68ed04d66bb3d0d44730a56c87995fa0a3bb26ed215c6d1f` |
| `broader_finance_differences_accepted` | `false` |
| `finance_treasury_account_authorities` row count | `0` (legitimate current Production state) |

Binding replaces only five `NULL::text` baseline placeholders in the static verifier. Function/security expectations, row/reference/account checks, deterministic snapshot construction and component-level output are unchanged. The generator retains the reviewed values and refuses to generate a post-apply gate if the candidate SHA has changed. The existing verifier compares aggregate hashes; it does not require a separate component-baseline file. Per-table actual counts/hashes and function/security differences remain available in its output. No component-level Production fingerprints were invented from fixtures.

The verifier still fails closed on missing/partial/wrong pins or unexpected data/catalog/security/reference changes. Its zero-assignment check plus the false-default column check distinguish expected additive profile behavior from auto-appointment. The reviewed row hash also protects the empty account-authority table and all legitimate Legacy/New Finance rows. Local tests use explicit synthetic pins only for synthetic PASS simulations and prove that the actual Production-pinned SQL rejects the fixture. This one-time preservation baseline is archived evidence, not an ongoing gate after legitimate operational writes or future explicit assignments.

## Local validation

All results below are local, with synthetic fixtures; no Production persona or business record was used.

- Real disposable PostgreSQL 18, UNIX socket only: 23 scenario groups passed (one top-level Node test), rerun for release. Covers six personas, direct authenticated RPC/RLS paths, approval/account ceilings, own payloads, Tax filing/remittance, routine Receipt issue, retained Admin integrity guards, assignment/revocation audit, preservation and full candidate rollback.
- Four independent sessions retrying the same participant payment returned one payout/allocation/Cashbook outflow; two distinct simultaneous attempts for the same entitlement yielded one winner and one rolled-back loser.
- Synthetic reviewed-bound verifier PASS; unbound/partial/wrong baseline FAIL; actual Production-pinned static SQL rejects synthetic rows. Simulated row mutation/deletion, column/default changes, function body/search-path/ACL drift, policy/trigger drift, Operator auto-assignment, unexpected custody rows and orphan authority/entitlement references each FAIL. Each simulation is rolled back. Verifier SELECT leaves all fingerprints unchanged; planner row-order changes do not affect hashes.
- Existing Admin Payment confirmation, unchanged v2 professional basis and exactly two transfer cash legs/retry passed.
- UI/permission, People, document, Distribution, participant payout, expense-money and executive-dashboard regressions: 129/129 passed for release, including 23 targeted 078 tests and TH/EN render checks.
- Targeted ESLint: PASS. TypeScript `tsc --noEmit`: PASS. Production build: PASS. Artifact consistency/old migration SHA checks: PASS. `git diff --check`: PASS.
- No live browser visual smoke or Production UAT is claimed. Route/render tests and the production build validate the local UI contract; role-specific Human UAT follows a separately authorized database/application release.

Reproducible offline artifact check:

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web && node scripts/tests/finance-authority-artifacts.cjs
```

Disposable database suite (requires local PostgreSQL binaries, never a Production URL):

```sh
cd /Users/paolawyer/vp-case-app/vp-case-web && node scripts/tests/finance-authority-local-postgres.cjs
```

The three existing regression tests adjusted in this task retain their assertions: Distribution now tests scoped management without pay authority; Overview uses a real Staff bundle; navigation tests assert the existing grouped menu plus the new self/payment entry. No failed expectation was removed to conceal a security regression.

## Production database gate and release handoff

The user confirmed Human Apply and post-apply verification PASS before authorizing this application release:

- Applied SHA: `b54d1eb36bba029289eaaea226fa5ab57a5e42710114893ed38d80867e00bc7c`
- `gate_pass=true`, `failed_checks=[]`
- `function_differences=[]`, `security_differences=[]`
- `historical_rows_unchanged=true`
- Reviewed row/preservation hashes remain the exact values recorded above.
- `broader_finance_differences_accepted=false`

Migration and bound verifier are retained byte-for-byte unchanged as evidence. The release whitespace check removed one trailing space on an otherwise blank Preflight line and adjusted its generator; no gate expression or reviewed baseline changed. Do not regenerate or reapply Migration 078. Release validation executes migrations only against a disposable local fixture. The application release uses the existing Vercel Git integration for `origin/main`; commit/deployment identifiers are reported in the release response.

The next Human Gate is Production Permission UAT. No Finance Operator or Account Custodian is assigned by this release. No opening balance, UAT cleanup, Legacy migration, B6 or B7 action is authorized here.

## Known limits / deferred work

- Partner referral scope cannot bootstrap an unproven referral; Admin must establish canonical frozen UUID evidence. No text-based inference or new referral model is added.
- Existing account authorities and user flags are preserved, not automatically reassigned. Old custody rows become effective for execution only when the permitted Operator assignment is present.
- Participant projection intentionally omits formulas; outgoing WHT still comes from the existing explicit payout decision, never incoming customer WHT.
- Prior anonymous/service grants on existing functions are preserved where captured; authority depends on the active authenticated actor. New private helpers do not gain public execution.
- Scoped Production contract compatibility and immediate post-apply preservation were confirmed by the Human-reviewed database gate. PostgreSQL fixtures cover permission dependencies and business regressions, not a replica of all Production data. Production permission UAT remains for the user after application deployment.
- No Legacy write freeze, opening-balance setup, UAT cleanup, historical cutover, Case/Advisory feature change or Finance calculation redesign is part of 078.

## Exact implementation manifest and contract inventory

The following 41-file inventory is the explicit Gate 1 release scope, excluding the 34 unrelated files already untracked at task start. Staging uses this exact list; unrelated files remain outside the commit.

The baseline-binding continuation changes only these five existing task files: this document, `scripts/sql/verify_finance_permission_authority_078.sql`, `scripts/tests/finance-authority-artifacts.cjs`, `scripts/tests/finance-authority-postgres.test.cjs` and `scripts/tests/finance-authority-ui.test.cjs`. It changes no migration, Preflight, application file or contract fixture.

### Files (41)

- `app/admin/users/page.tsx`
- `app/components/AppTopNav.tsx`
- `app/finance/direct-money/[id]/page.tsx`
- `app/finance/direct-money/new/page.tsx`
- `app/finance/expenses/accounts/page.tsx`
- `app/finance/expenses/admin-tools.tsx`
- `app/finance/expenses/claim-review.tsx`
- `app/finance/expenses/forms.tsx`
- `app/finance/expenses/purchase-request-review.tsx`
- `app/finance/finance-navigation.ts`
- `app/finance/overview/data.ts`
- `app/finance/participant-payments/page.tsx`
- `app/finance/payments/[id]/page.tsx`
- `app/finance/payments/page.tsx`
- `app/finance/quotations/shared.tsx`
- `app/finance/revenue-distribution/[sourceType]/[id]/page.tsx`
- `app/finance/revenue-distribution/detail.tsx`
- `app/finance/revenue-distribution/page.tsx`
- `app/finance/revenue-distribution/participant-payment.tsx`
- `app/finance/revenue-distribution/shared.ts`
- `app/finance/tax-position/filings/workspace.tsx`
- `app/settings/document-settings/page.tsx`
- `docs/finance/FINANCE_PERMISSION_AUTHORITY_078.md`
- `lib/people.ts`
- `lib/permissions.ts`
- `scripts/sql/preflight_finance_permission_authority_078.sql`
- `scripts/sql/verify_finance_permission_authority_078.sql`
- `scripts/tests/distribution-payout-ui.test.cjs`
- `scripts/tests/executive-dashboard.test.cjs`
- `scripts/tests/expense-foundation-ui.test.cjs`
- `scripts/tests/finance-authority-artifacts.cjs`
- `scripts/tests/finance-authority-body.sql`
- `scripts/tests/finance-authority-fixture.cjs`
- `scripts/tests/finance-authority-local-postgres.cjs`
- `scripts/tests/finance-authority-migration.cjs`
- `scripts/tests/finance-authority-pg-adapter.cjs`
- `scripts/tests/finance-authority-postgres.test.cjs`
- `scripts/tests/finance-authority-ui.test.cjs`
- `scripts/tests/fixtures/finance-authority-after.json`
- `scripts/tests/fixtures/finance-authority-before.json`
- `supabase/migrations/202607180078_finance_go_live_permission_authority_contract.sql`

### Changed existing function signatures (97)

- `approve_finance_tax_correction(uuid,jsonb,boolean,text,boolean)`
- `approve_retired_template_use_for_fee_agreement(uuid,text)`
- `bridge_finance_legacy_expense(text,uuid,text,boolean)`
- `cancel_finance_accepted_quotation_engagement(uuid,text)`
- `cancel_finance_payout(uuid,integer,boolean)`
- `clone_document_template_version(uuid)`
- `confirm_finance_expense_payout(uuid,integer,integer,uuid,boolean)`
- `confirm_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean)`
- `create_finance_tax_correction_draft(uuid,uuid,uuid,text,text,text,text,date,date,jsonb)`
- `create_finance_tax_remittance(uuid,uuid,uuid,uuid,date,text,text,jsonb)`
- `current_user_can_approve_finance_billable_charges()`
- `current_user_can_confirm_finance_cash_transactions()`
- `current_user_can_confirm_finance_payments()`
- `current_user_can_issue_finance_receipts()`
- `current_user_can_issue_finance_tax_invoices()`
- `current_user_can_manage_finance_billable_charges()`
- `current_user_can_manage_finance_cash_transactions()`
- `current_user_can_manage_finance_payments()`
- `current_user_can_manage_finance_quotations()`
- `current_user_can_manage_finance_receipts()`
- `current_user_can_manage_finance_tax_invoices()`
- `current_user_can_reallocate_finance_payments()`
- `current_user_can_reverse_finance_cash_transactions()`
- `current_user_can_reverse_finance_payments()`
- `current_user_can_view_finance_billable_charges()`
- `current_user_can_view_finance_cash_bank_account(uuid)`
- `current_user_can_view_finance_cash_transactions()`
- `current_user_can_view_finance_payments()`
- `current_user_can_view_finance_receipts()`
- `current_user_can_view_finance_tax_invoices()`
- `current_user_can_void_finance_receipts()`
- `delete_finance_authorized_signer(uuid)`
- `expense_account_allowed(uuid,uuid,text)`
- `expense_account_balance(uuid,uuid)`
- `expense_can_claim()`
- `expense_can_manage()`
- `expense_can_tax_review()`
- `expense_can_view_all()`
- `expense_document(uuid)`
- `get_finance_account_statement(uuid,uuid,date,date,text,text,integer)`
- `get_finance_cash_flow_summary(date,date)`
- `get_finance_company_statement(date,text,text,integer)`
- `get_finance_direct_vp_formula_context(uuid)`
- `get_finance_distribution_payment_context(uuid,uuid)`
- `get_finance_expense_access()`
- `get_finance_expense_economics(uuid)`
- `get_finance_payable_entitlements(text,text,text,text,integer)`
- `get_finance_payout_workspace(uuid,uuid)`
- `get_finance_payout_workspace_before_expense(uuid,uuid)`
- `get_finance_revenue_distribution_detail(text,uuid)`
- `get_finance_revenue_distribution_workspace(date,text,text,text,integer)`
- `get_finance_statement_accounts()`
- `get_finance_tax_filings(date)`
- `get_finance_treasury(integer)`
- `get_finance_treasury_month_flow(date)`
- `get_finance_unified_company_statement(date,date,text,text,integer)`
- `get_finance_unpaid_participants_summary()`
- `get_finance_vp_formula_context(uuid)`
- `get_finance_vp_received_distribution(uuid,uuid)`
- `issue_finance_tax_correction(uuid,jsonb,boolean,boolean)`
- `money_allocation_admin()`
- `pay_finance_distribution_participant(uuid,uuid,uuid,integer,date,uuid,uuid,text,numeric,text,boolean)`
- `payout_can_manage()`
- `payout_confirm_distribution_outflow(uuid,integer,integer,uuid,boolean,boolean)`
- `people_admin_save_profile(uuid,jsonb,jsonb,uuid)`
- `prepare_finance_expense_payout(uuid,uuid,integer,date,uuid,uuid,boolean,text)`
- `record_finance_paid_expense(uuid,jsonb,uuid,uuid,date,boolean)`
- `replace_document_template_draft_structure(uuid,jsonb)`
- `save_document_template_alternative_group_draft(uuid,uuid,text,text,integer,integer,boolean,uuid,jsonb,text,integer,jsonb)`
- `save_document_template_clause_slot_draft(uuid,uuid,text,uuid,integer,uuid,text,text,text,integer,text,uuid,jsonb,boolean,boolean,boolean,boolean,text,jsonb)`
- `save_document_template_family_draft(uuid,text,text,text,text,jsonb)`
- `save_document_template_section_draft(uuid,uuid,text,text,integer,uuid,text,text,text,integer,text,jsonb,boolean,boolean,text,jsonb)`
- `save_document_template_variable_binding_draft(uuid,uuid,uuid,boolean,jsonb,text,jsonb)`
- `save_document_template_version_draft(uuid,uuid,text,jsonb,date,date)`
- `save_finance_direct_money_receipt(uuid,integer,jsonb)`
- `save_finance_payout_before_expense(uuid,uuid,date,uuid,uuid,jsonb,text,integer)`
- `save_finance_quotation_service_pattern(uuid,text,text,text,text,text,text,text,integer)`
- `save_finance_vp_received_distribution(uuid,uuid,uuid,integer,jsonb,jsonb,text)`
- `set_document_template_version_status(uuid,text,text,text)`
- `set_finance_authorized_signer_active(uuid,boolean)`
- `set_finance_authorized_signer_default(uuid,uuid,text,text)`
- `set_finance_billing_plan_status(uuid,text)`
- `set_finance_fee_agreement_status(uuid,text)`
- `set_finance_quotation_service_pattern_active(uuid,boolean)`
- `set_finance_quotation_status(uuid,text,text,uuid,text,text)`
- `set_finance_quotation_status_v2(uuid,text,text,uuid,text,text)`
- `statement_transfer_allowed(uuid,uuid,uuid,uuid)`
- `tax_filing_account(uuid,uuid)`
- `tax_filing_can_manage()`
- `tax_filing_can_remit()`
- `tax_position_can_manage()`
- `tax_position_can_view()`
- `transition_finance_direct_money_receipt(uuid,integer,text,boolean,text)`
- `transition_finance_tax_remittance(uuid,integer,text,boolean)`
- `transition_finance_vp_distribution(uuid,integer,jsonb,text,boolean,text)`
- `treasury_can_view(uuid,uuid)`
- `void_finance_invoice(uuid,text,boolean)`

### New function signatures (18)

- `finance078_account_projection(jsonb)`
- `finance078_active()`
- `finance078_admin()`
- `finance078_distribution_allowed(uuid,uuid)`
- `finance078_distribution_id_allowed(uuid)`
- `finance078_effective_lifecycle_guard()`
- `finance078_execution_account(uuid,uuid)`
- `finance078_expense_projection(uuid,jsonb)`
- `finance078_operations()`
- `finance078_operator()`
- `finance078_partner()`
- `finance078_profile_guard()`
- `finance078_remittance_projection(uuid,jsonb)`
- `finance078_require_payout(uuid,text)`
- `finance078_self_service()`
- `get_finance_compensation_access()`
- `get_finance_own_legacy_compensation()`
- `get_finance_participant_payments(integer)`

### Added policies (69)

- `public.document_clause_libraries.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_clause_libraries.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_clause_libraries.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_clause_version_variable_bindings.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_clause_version_variable_bindings.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_clause_version_variable_bindings.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_clause_versions.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_clause_versions.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_clause_versions.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_numbering_profiles.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_numbering_profiles.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_numbering_profiles.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_template_alternative_groups.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_template_alternative_groups.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_template_alternative_groups.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_template_clause_slots.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_template_clause_slots.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_template_clause_slots.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_template_sections.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_template_sections.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_template_sections.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_template_variable_bindings.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_template_variable_bindings.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_template_variable_bindings.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_template_versions.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_template_versions.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_template_versions.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.document_templates.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.document_templates.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.document_templates.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_account_opening_balance_audit_events.finance078_opening_audit_scope` (RESTRICTIVE, SELECT)
- `public.finance_authorized_signers.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_authorized_signers.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_authorized_signers.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_bank_account_access.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_bank_account_access.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_bank_account_access.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_bank_accounts.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_bank_accounts.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_bank_accounts.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_cash_transaction_audit_events.finance078_cash_audit_scope` (RESTRICTIVE, SELECT)
- `public.finance_cash_transactions.finance078_cash_movements_read` (PERMISSIVE, SELECT)
- `public.finance_cash_transactions.finance078_cash_movements_scope` (RESTRICTIVE, SELECT)
- `public.finance_company_ledger.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_company_ledger.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_company_ledger.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_company_ledger.finance078_legacy_ledger_read` (RESTRICTIVE, SELECT)
- `public.finance_company_profiles.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_company_profiles.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_company_profiles.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_compensation_allocations.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_compensation_allocations.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_compensation_allocations.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_compensation_allocations.finance078_legacy_compensation_read` (RESTRICTIVE, SELECT)
- `public.finance_compensation_batches.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_compensation_batches.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_compensation_batches.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_compensation_batches.finance078_legacy_compensation_batch_read` (RESTRICTIVE, SELECT)
- `public.finance_payable_entitlement_audit.finance078_entitlement_audit_scope` (RESTRICTIVE, SELECT)
- `public.finance_payable_entitlement_sources.finance078_entitlement_sources_scope` (RESTRICTIVE, SELECT)
- `public.finance_payable_entitlements.finance078_entitlement_scope` (RESTRICTIVE, SELECT)
- `public.finance_quotation_service_patterns.finance078_admin_delete` (RESTRICTIVE, DELETE)
- `public.finance_quotation_service_patterns.finance078_admin_insert` (RESTRICTIVE, INSERT)
- `public.finance_quotation_service_patterns.finance078_admin_update` (RESTRICTIVE, UPDATE)
- `public.finance_vp_revenue_distribution_audit.finance078_distribution_audit_scope` (RESTRICTIVE, SELECT)
- `public.finance_vp_revenue_distributions.finance078_distribution_scope` (RESTRICTIVE, SELECT)
- `storage.objects.finance078_document_assets_delete` (RESTRICTIVE, DELETE)
- `storage.objects.finance078_document_assets_insert` (RESTRICTIVE, INSERT)
- `storage.objects.finance078_document_assets_update` (RESTRICTIVE, UPDATE)

### Added triggers (11)

- `finance_billing_plans.finance078_effective_lifecycle_guard`
- `finance_cash_transactions.finance078_effective_lifecycle_guard`
- `finance_combined_documents.finance078_effective_lifecycle_guard`
- `finance_direct_money_receipts.finance078_effective_lifecycle_guard`
- `finance_fee_agreements.finance078_effective_lifecycle_guard`
- `finance_invoices.finance078_effective_lifecycle_guard`
- `finance_payments.finance078_effective_lifecycle_guard`
- `finance_quotations.finance078_effective_lifecycle_guard`
- `finance_receipts.finance078_effective_lifecycle_guard`
- `finance_tax_invoices.finance078_effective_lifecycle_guard`
- `user_profiles.finance078_profile_guard`
