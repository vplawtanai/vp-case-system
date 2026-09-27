# Phase 8B.2 — Admin User Management & People Alignment

Status: **CLOSED — Production release READY; non-mutating Admin smoke passed**.
Migration 073 was manually applied by the owner and its Production verifier passed. No Production SQL, invitation or user/profile mutation has been performed by this agent.

## Production release evidence — 2026-09-27

- Implementation commit: `00228dc818a7ecc371b1e8c3d0b9a3cc9444bc02`, message `Phase 8B.2: add admin people management`.
- Push: `main -> origin/main` successful; local HEAD and origin/main matched the implementation commit.
- Vercel Git workflow deployed that exact commit to the existing `vp-case-system` project, target `production`, after the new Production-only secret was present.
- Verified deployment: `dpl_Dxk6mzZ3QvjKX5KdiZszVMFppnXJ`, **READY**, `aliasAssigned = true`.
- Deployment URL: `https://vp-case-system-8juss3m9m-vplawtanais-projects.vercel.app`.
- Canonical alias: `https://vp-case-system.vercel.app`.
- These details identify the verified application deployment. This closeout documentation is a subsequent evidence-only commit; no application, test or migration content changes accompany it.

Non-mutating Production smoke used a separate Chrome tab so the owner's already-open edit form was not disturbed:

- Active Admin successfully loaded `/admin/users`; table showed all 10 existing profiles, active and unclassified, with roles and existing capability counts. Classification is not a login prerequisite.
- Add User opened with email/name/staff-name/main-role/account-type controls and disabled assignable while unclassified; there was no password field or creation wizard.
- Edit opened for an existing Lawyer with special Finance capabilities. Account Type, Assignable, active state, collapsed capability controls and secondary account actions rendered. Existing checked Finance flags were displayed; no checkbox/selection was changed or saved.
- Delete action was disabled for the active/unclassified account; deactivate guidance rendered. No delete-check, delete, save, resend or create action was executed.
- Desktop visual inspection passed. Narrow layout displayed a horizontally scrollable table and stacked forms; at **390 CSS px**, the Create dialog matched viewport width without horizontal overflow. Viewport override was reset afterwards.
- Browser console: no warning/error entries during the smoke. No visible runtime error occurred.
- Other existing users were not impersonated or logged in during smoke; access-role denial and 072 compatibility are covered by the local release tests. No Production business row or profile was written.

Email delivery remains **PENDING FIRST REAL HUMAN UAT**. Next Human actions: Admin classifies existing profiles, marks real assignable personnel and personally creates the two real lawyers; the first actual invitation tests delivery/password setup. No Phase 8C work started.

## Release readiness — 2026-09-27

- Owner-reported Migration 073 Production result: `gate_pass = true`, `failed_checks = []`; 10 profiles and 10 Auth identities preserved, roles/active/Finance flags unchanged, no auto-classification, historical rows and 072 contracts preserved, update/delete guards enabled. Recognized as applied; **do not re-run or edit 073**.
- Applied candidate file SHA-256 remains `502635eeed9a2a2065c1235ed12c83b9b6bdc156e2c0eb29dd193ba618173a8a`.
- Repo/main guard passed; HEAD = origin/main = `1e5556b763b3a160a99bf8506439063a01128f71`. Only the intended old Admin page differs among the 1,107 starting files; the unrelated files remain intact.
- Production environment presence checked with the established authenticated Vercel CLI, project `vp-case-system` (`prj_KsOeIsRp13cSvekfvkLXADSo9gAh`), scope `vplawtanais-projects`. Normal list output was captured and reduced to presence only; no variable value was printed, downloaded, written to documentation/tests or committed.

| Production variable | Presence |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | **PRESENT — Production only** |
| `NEXT_PUBLIC_SUPABASE_URL` | PRESENT |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | PRESENT |

- The owner added the secret after the initial blocked readiness check. Presence was rechecked for Production, Preview and Development: service-role key exists only in Production; no `NEXT_PUBLIC_` service-role variant exists in any environment. No environment value was printed or written to disk.
- The service-role variable is referenced only by `lib/server/people-admin.ts`, protected by `import "server-only"`, and reached through the server API route. Its name is absent from the freshly built client JavaScript. No key value was accessed.
- Invite code review: create a banned/unconfirmed identity without a password, initialize its profile, unban and call `auth.admin.inviteUserByEmail`; validate returned ID. Fixed redirect: `https://vp-case-system.vercel.app/account/security`, with no browser-supplied redirect or Host-derived destination.
- The existing browser Supabase client uses the installed SDK's implicit callback detection (`detectSessionInUrl: true`); Auth initialization is awaited before session use. Existing `/account/security` calls `auth.updateUser({ password })`. The application therefore has a compatible password-setup destination without a new callback route. Supabase's remote redirect allowlist and SMTP configuration have not been verified; no local Supabase config file supplies that evidence.
- Email status: **PENDING FIRST REAL HUMAN UAT**. Invite implementation ready; actual email delivery will be verified by first real-user Human UAT. No test invitation or test Auth identity was created.
- Fresh complete release validation: Admin/API/UI/Core 20/20 PASS; PostgreSQL 073 12/12 PASS; PostgreSQL 072 regression 12/12 PASS, including independent-session concurrency/history protection. Targeted ESLint, standalone `tsc --noEmit`, production build and `git diff --check` PASS. All test databases were isolated local Unix-socket clusters, not Production.
- The approved 11-file manifest below is the complete release scope. Existing unrelated/untracked files are excluded. The live remote `main` still matched the starting baseline before staging.
- App-side invite/callback wiring is ready. Actual Supabase SMTP delivery remains pending first real-user Human UAT; no invitation is sent to prove readiness.
- No existing profile, Finance permission, assignment or Production account was changed. No Phase 8C work started.

## Project guard and scope

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
- Starting HEAD and origin/main: `1e5556b763b3a160a99bf8506439063a01128f71` (remote branch checked read-only).
- Previously untracked audit/Finance SQL files are preserved. No applied migration is edited.
- User profiles remain the authenticated personnel foundation; there is no People table, HR module, team assignment or Phase 8C work.

## Existing architecture audited

`app/admin/users/page.tsx` was a client page with `AuthGuard`, `AppTopNav`, `buildPermissions().canManageUsers`, direct profile SELECT/UPDATE and best-effort `createAuditLog`. It edited name, staff name, role, `financial_access` and active status. Its role check did not itself check active; `AuthGuard` separately rejects inactive accounts. No user-create/delete UI or privileged Auth orchestration existed.

`app/api/finance/quotations/[id]/pdf/route.ts` established caller Bearer-token validation using a server Supabase client; this pattern is reused. No existing server service-role helper was found. The browser Supabase client continues using the public anon key.

`app/account/security/page.tsx` already allows the signed-in user to set their own password through Supabase Auth. Its existing language/layout are unchanged. Admin User Management now uses Thai labels, consistent with the currently disabled Admin/Core EN switch; no translation framework or global language behavior changed.

Existing Finance capability guards, including payment/receipt/tax/cash/billable-charge guards and migration 051's `payout_profile_delete_guard`, remain unchanged. The ordinary update RPC runs with the caller JWT (`auth.uid()`), not the service JWT, so those guards still see the real active Admin.

## New contract

Only two profile fields are added:

| Field | Contract |
| --- | --- |
| `account_type text NULL` | `operational`, `uat`, or unclassified `NULL`. No classification of existing records. |
| `assignable boolean NOT NULL DEFAULT false` | May be true only for active operational profiles. |

Future assignment eligibility is exactly `active = true AND account_type = 'operational' AND assignable = true`, exposed in `lib/people.ts` and `people_is_assignable(uuid)`. Existing assignments and selectors are untouched. Existing accounts continue using their existing roles/capabilities before classification.

Active Admin authorization is checked by the page's management API response, every API request, and each management RPC. New restrictive profile-write policies and an UPDATE trigger deny non-Admin writes even if an older permissive policy exists. Existing profile read policies remain. Partner, Lawyer, Lawyer with Finance flags, Assistant Lawyer, Staff, Viewer and inactive Admin cannot administer users. Admin cannot deactivate, demote or delete their own account through this surface.

Profile edits send only changed allowlisted keys and compare the full prior profile to reject concurrent stale edits. No role-to-capability normalization occurs. Advanced controls show existing capability columns only. Lawyer+ remains `role = lawyer` plus explicit capabilities; no new role is introduced. Profile updates and their audit snapshots commit together.

## Creation and onboarding

Normal path: **เพิ่มผู้ใช้ → fill essential fields → สร้างและส่งคำเชิญ** (two primary actions). Email, full name, role, explicit account type and assignable flag are required; staff name is optional. Finance permissions remain secondary edit controls.

1. Validate the caller as active Admin and validate inputs server-side.
2. Supabase Admin creates an unconfirmed, temporarily banned Auth identity with a unique server-only operation ID. No permanent password is fabricated or shared.
3. Caller-scoped RPC verifies server Auth metadata, recent creation, ban and never-signed-in state. It creates or completes the matching signup-trigger profile, without overwriting an existing classified profile.
4. Once the profile is complete, unban and invite that exact identity to the fixed trusted `/account/security` URL. The recipient sets their own password.
5. If profile completion fails, compensate only the Auth ID returned by this creation. The delete guards still apply. If cleanup fails, the account remains banned and the Admin sees a recovery reference. An uncertain Auth response never triggers a guessed-ID deletion.
6. Email failure keeps the completed profile/Auth pair and exposes resend. Existing confirmed accounts are not re-invited. Creation and Auth are explicitly an orchestration, not a claimed cross-service transaction.

Supabase's [Admin API](https://supabase.com/docs/reference/javascript/auth-admin-createuser) must remain server-only. Its [invite implementation](https://github.com/supabase/auth/blob/master/internal/api/invite.go) permits inviting an existing unconfirmed identity; the returned ID is checked against the created identity.

Release prerequisites: configure server-only `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment; configure invitation delivery and allowlist `https://vp-case-system.vercel.app/account/security`. Production presence-only results are recorded above; no secret values were printed or configuration changed. SMTP delivery and a real invitation/password setup remain Human UAT after release.

## Deactivation and safe permanent deletion

Deactivation is the normal departure/removal path. It preserves history and clears assignment eligibility. Existing AuthGuard/account behavior remains; the new management API and RPCs always recheck active state.

Permanent deletion is secondary, requires inactive + classified + not self, a successful read-only dependency check, and exact email confirmation. The server calls Auth Admin deletion. A BEFORE DELETE trigger on `auth.users` rechecks history under locks and removes the profile inside the same database transaction. Any Auth FK error, existing Finance guard, or new history reference aborts both deletions. Direct profile deletion is prohibited.

Protection is driven by the **live** catalog, not a hardcoded historical list:

- All incoming profile/Auth foreign keys in public/storage and other non-Auth schemas, including `CASCADE` and `SET NULL`; profile-to-profile references are included.
- Public/storage UUID, text/name/email and JSON snapshot references. Free-name columns used by Case/Non-Litigation time logs, tasks/responsibility, Office Work and legacy audit paths are conservatively matched.
- Finance entitlements, payouts/payables, documents/templates and their actor/audit references are protected. Soft-deleted history still blocks deletion. Existing payout guard remains enabled.
- A name collision may conservatively block deletion; names never determine classification or authorization. Unknown historical aliases without an ID cannot be proven exhaustively from repository code; unclassified accounts cannot be deleted and existing profile-edit audit evidence blocks deletion. Prefer deactivation for historical personnel.
- The narrow exception is an audit snapshot of **only deactivation/assignment clearing**, performed by another Admin. It is kept unchanged and does not by itself make a newly created unused UAT account undeletable. Other profile edits, actor references and business audits block deletion. No audit row is deleted by this workflow.
- Auth-internal identity/session cascade behavior stays with Supabase; the guard does not delete business history. Fresh banned, never-used provisioning failures may be compensated before normal inactive/classification conditions are met.

Delete locks serialize against current business writes and re-evaluate committed history before removal. Local independent-session tests prove a racing entitlement insertion is preserved and blocks deletion. This intentionally favors safety over allowing deletion.

## Migration and single manual gate (completed by owner; retained as implementation evidence)

File: `supabase/migrations/202607180073_user_profile_people_alignment.sql`.

The file contains one transaction, preconditions, the two columns/constraints, management RPCs, profile RLS/write/delete guards and Auth deletion guard, explicit function owner/search_path/ACL, preservation assertions, COMMIT and a final SELECT-only verifier result. No static historical Production fixture is treated as current truth.

Before DDL it snapshots current public business rows and Auth users, existing functions (including 072/Finance), policies and triggers. It compares the same state after DDL, excluding only the two new profile columns from old-row hashes. It explicitly verifies unclassified existing profiles, new column types/defaults/constraints, active Admin security, function grants and enabled guards. A mismatch raises before COMMIT. It reports user/Auth counts/hashes and `gate_pass`, `failed_checks`, preservation facts; no row contents or credentials are output.

The gate briefly freezes public tables/Auth users for consistent before/after comparison. Lock timeout is 10 seconds and statement timeout 120 seconds; a busy/unsupported database fails rather than bypassing checks. This is the requested manual apply file, not a rollback rehearsal. Do not run fragments or retry after a successful apply.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202607180073_user_profile_people_alignment.sql
```

The owner already completed this gate. Do not repeat it. Its reported result matches the expected `gate_pass = true`, `failed_checks = []`, `historical_rows_unchanged = true`, `roles_active_finance_permissions_unchanged = true`, `existing_accounts_auto_classified = false`.

## Local validation and limits

- 10 API/contract tests plus 4 real-page SSR tests: PASS. Auth/RPC doubles have no network and send no emails.
- 12 migration/DB tests: PASS on isolated PostgreSQL 18 over a private Unix socket, including broad pre-existing RLS/default grants, role denial, explicit Finance capability preservation, Auth/profile compensation/deletion, live FK/JSON/name/history checks and concurrent history insertion.
- Existing migration 072 PostgreSQL regressions: 12 PASS; existing Case/Non-Litigation application regressions: 6 PASS. The post-073 DB suite also repeats the 072 create-role matrix.
- Targeted ESLint, standalone `tsc --noEmit`, production build and `git diff --check`: PASS (final file review recorded at handoff).
- DB fixture is explicitly synthetic and extends the verified 072 fixture; it is not a complete Production Supabase/Auth catalog. The manual file checks live preconditions and preservation before committing. Actual invitation delivery and supported Production Auth trigger integration are not claimed as automated Production UAT.
- Admin UI is Thai; Production browser smoke is recorded above and performed no account mutation. SSR tests exercise list/create/edit/denied presentation. Existing shared modal provides focus handling/mobile layout.

## Intended change manifest

1. `app/admin/users/page.tsx`
2. `app/admin/users/users.module.css`
3. `app/api/admin/users/route.ts`
4. `lib/people.ts`
5. `lib/server/people-admin.ts`
6. `supabase/migrations/202607180073_user_profile_people_alignment.sql`
7. `scripts/tests/fixtures/people-admin.sql`
8. `scripts/tests/people-admin.test.cjs`
9. `scripts/tests/people-admin-ui.test.cjs`
10. `scripts/tests/people-admin-postgres.test.cjs`
11. `docs/core/PHASE8B2_PEOPLE_ALIGNMENT.md`

No other existing tracked product file is changed. The two new lawyers are to be created by the Admin personally after release; no users are created during this task.

## Repository FK declaration evidence

The inventory below lists repository SQL declarations referencing user_profiles/auth.users. Occurrences include historical/additive migrations; they are not a claim about today's live FK count. Core definitions are not fully represented in historical migrations, so runtime catalog discovery supplements this inventory and guards newly introduced references too.

```text
supabase/migrations/202607090009_create_finance_fee_agreements.sql:28  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607090009_create_finance_fee_agreements.sql:29  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607090010_create_finance_billing_plans.sql:16  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607090010_create_finance_billing_plans.sql:17  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607090010_create_finance_billing_plans.sql:51  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607090010_create_finance_billing_plans.sql:52  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607140008_create_quotation_payment_terms.sql:5  created_by_user_id uuid null references public.user_profiles(id) on delete set null, updated_by_user_id uuid null references public.user_profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:33  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:34  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:51  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:67  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:68  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:83  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:104  add column if not exists sent_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:106  add column if not exists signed_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:109  add column if not exists cancelled_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607170001_document_platform_fee_agreement_foundation.sql:147  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:23  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:24  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:55  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:56  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:82  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:83  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:129  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:130  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:145  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:146  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:163  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:164  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:181  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:182  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:204  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:205  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:220  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:228  add column if not exists reviewed_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:230  add column if not exists published_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:232  add column if not exists retired_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:245  add column if not exists updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:263  add column if not exists reviewed_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:265  add column if not exists published_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:267  add column if not exists retired_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:277  add column if not exists updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180001_document_template_clause_management_foundation.sql:293  add column if not exists retired_template_use_approved_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180004_add_quotation_prospect_and_unlinked_matter.sql:17  add column if not exists client_linked_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180004_add_quotation_prospect_and_unlinked_matter.sql:19  add column if not exists matter_linked_by_user_id uuid null references public.user_profiles(id) on delete set null;
supabase/migrations/202607180005_add_quotation_service_patterns.sql:17  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180005_add_quotation_service_patterns.sql:20  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180015_add_accepted_quotation_engagement_basis.sql:8  add column if not exists engagement_confirmed_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:69  issued_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:71  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:74  voided_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:76  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:77  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180017_create_finance_invoice_foundation.sql:232  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180018_add_billing_installment_readiness.sql:18  add column readiness_confirmed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180018_add_billing_installment_readiness.sql:53  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:85  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:87  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:89  confirmed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:91  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:94  reversed_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:183  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:185  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:206  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180021_create_finance_payment_foundation.sql:262  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:125  references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:128  references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:131  references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:134  references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:252  references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:255  references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:258  references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:261  references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:265  references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:343  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180025_create_finance_cash_transaction_foundation.sql:362  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180029_add_payment_allocation_reallocation.sql:114  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180030_create_finance_billable_charge_foundation.sql:165  ready_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180030_create_finance_billable_charge_foundation.sql:167  cancelled_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180030_create_finance_billable_charge_foundation.sql:170  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180030_create_finance_billable_charge_foundation.sql:172  updated_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180030_create_finance_billable_charge_foundation.sql:296  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180031_add_invoice_v2_bridge_foundation.sql:163  claimed_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180031_add_invoice_v2_bridge_foundation.sql:198  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180032_add_invoice_v2_composition_lifecycle.sql:176  created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180032_add_invoice_v2_composition_lifecycle.sql:208  reserved_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180032_add_invoice_v2_composition_lifecycle.sql:210  invoiced_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180032_add_invoice_v2_composition_lifecycle.sql:212  released_by_user_id uuid null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180032_add_invoice_v2_composition_lifecycle.sql:266  actor_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180036_add_structured_payment_wht.sql:33  created_by_user_id uuid null references public.user_profiles(id) on delete set null,
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:82  external_receipt_checked_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:84  issued_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:86  cancelled_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:89  voided_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:92  created_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180037_create_finance_receipt_foundation.sql:141  actor_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql:62  issued_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql:65  cancelled_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql:68  created_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql:86  approved_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180039_create_finance_tax_invoice_foundation.sql:121  actor_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql:94  issued_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql:95  created_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql:111  actor_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180042_add_customer_tax_identity_profile.sql:31  verified_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180042_add_customer_tax_identity_profile.sql:33  updated_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180042_add_customer_tax_identity_profile.sql:53  actor_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:38  created_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:40  approved_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:43  issued_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:45  cancelled_by_user_id uuid references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:76  issued_by_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180043_add_tax_document_correction_foundation.sql:88  actor_user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql:27  created_by uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql:30  reviewed_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql:32  finalized_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql:34  superseded_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql:48  actor_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql:30  created_by uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql:33  reviewed_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql:35  finalized_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql:37  superseded_by uuid references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql:63  actor_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql:30  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql:33  confirmed_by uuid references public.user_profiles(id),
supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql:35  reversed_by uuid references public.user_profiles(id),
supabase/migrations/202607180047_add_direct_money_receipt_foundation.sql:56  actor_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180048_add_payable_entitlement_foundation.sql:8  materialized_by uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180048_add_payable_entitlement_foundation.sql:28  recipient_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180048_add_payable_entitlement_foundation.sql:46  actor_id uuid not null references public.user_profiles(id) on delete restrict,
supabase/migrations/202607180050_add_tax_position_foundation.sql:24  actor_id uuid references public.user_profiles(id),
supabase/migrations/202607180050_add_tax_position_foundation.sql:68  actor_id uuid references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:10  profile_id uuid unique references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:16  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:17  updated_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:29  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:36  actor_id uuid not null references public.user_profiles(id),created_at timestamptz not null default now(),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:54  confirmed_at timestamptz,confirmed_by uuid references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:55  cancelled_at timestamptz,cancelled_by uuid references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:57  created_by uuid not null references public.user_profiles(id),updated_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180051_add_payee_payout_foundation.sql:76  version integer not null,actor_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:27  filed_on date, filed_at timestamptz, filed_by uuid references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:29  cancelled_at timestamptz, cancelled_by uuid references public.user_profiles(id), cancellation_reason text,
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:30  created_at timestamptz not null default now(), created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:54  version integer not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:66  confirmed_snapshot_json jsonb, confirmed_at timestamptz, confirmed_by uuid references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:67  cancelled_at timestamptz,cancelled_by uuid references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:68  created_at timestamptz not null default now(),created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180052_add_tax_filing_remittance_foundation.sql:79  version integer not null,actor_id uuid not null references public.user_profiles(id),created_at timestamptz not null default now(),
supabase/migrations/202607180054_add_reviewed_tax_deadlines.sql:16  reviewed_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:25  user_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:34  updated_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:42  version integer not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:100  claimant_id uuid references public.user_profiles(id),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:112  reviewed_at timestamptz, reviewed_by uuid references public.user_profiles(id), review_reason text,
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:114  created_by uuid not null references public.user_profiles(id), updated_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:139  reviewed_by uuid not null references public.user_profiles(id), reviewed_at timestamptz not null default now(),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:158  created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:168  due_on date, created_at timestamptz not null default now(), created_by uuid not null references public.user_profiles(id)
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:174  created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now()
supabase/migrations/202607180055_add_expense_purchase_settlement_foundation.sql:179  actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
supabase/migrations/202607180056_add_expense_request_foundation.sql:8  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180056_add_expense_request_foundation.sql:10  submitted_by uuid references public.user_profiles(id), submitted_at timestamptz,
supabase/migrations/202607180056_add_expense_request_foundation.sql:27  actor_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180064_add_external_input_vat_evidence.sql:11  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180064_add_external_input_vat_evidence.sql:22  actor_id uuid not null references public.user_profiles(id),
supabase/migrations/202607180070_add_unified_statement_and_transfers.sql:13  created_by uuid not null references public.user_profiles(id),
supabase/migrations/202607180070_add_unified_statement_and_transfers.sql:113  confirmed_by uuid not null references public.user_profiles(id), confirmed_at timestamptz not null default clock_timestamp(),
```
