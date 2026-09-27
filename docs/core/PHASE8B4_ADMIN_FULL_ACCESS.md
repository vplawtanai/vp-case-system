# Phase 8B.4 — Admin role authority

Status: **CLOSED — Migration 074 Production PASS; application deployment READY; non-mutating Production smoke PASS**. No Production SQL, user mutation or invitation was performed by this release. No Phase 8C.

## Production migration evidence — 2026-09-27

The owner reports successful manual Apply and verifier: `gate_pass=true`, `new_admin_policies=23`, `existing_acl_preserved=true`, `profile_flags_unchanged=true`, `historical_rows_unchanged=true`, `non_admin_policies_preserved=true`. Applied Migration 074 is preserved byte-for-byte and must not be re-run.

Release validation repeated: 43 application/permissions/API/UI tests plus 20 isolated PostgreSQL tests, all PASS; targeted ESLint, TypeScript, production build and diff check PASS.

## Production release and closeout evidence — 2026-09-27

- Implementation commit: `0fe1f1282556d276c46d79c026c4bdda9a35eced`, message `Phase 8B.4: enforce admin full-access semantics`.
- Push `main -> origin/main` succeeded; local HEAD and origin/main matched that exact implementation commit. Only the 12 intended files below were staged; all 34 unrelated pre-existing untracked files were preserved.
- The existing Vercel Git workflow deployed that exact commit to project `vp-case-system`, target `production`.
- Verified deployment: `dpl_CPgpGQ7MaUtXR6sYdWVvvXKez7Cd`, **READY**, `aliasAssigned=true`, no deployment error.
- Deployment URL: `https://vp-case-system-7l2i86bnp-vplawtanais-projects.vercel.app`.
- Canonical alias: `https://vp-case-system.vercel.app`, assigned to the verified deployment.
- This section records the verified application deployment. Its closeout documentation is a subsequent evidence-only commit; no application, test or migration content changes accompany it.

Non-mutating Production smoke used a separate Chrome tab without disturbing the owner's existing forms:

- `/admin/users` loaded all 10 existing profiles. The Admin row shows full access by role.
- The existing active Admin edit dialog shows `สิทธิ์เต็มจากบทบาทผู้ดูแลระบบ` and explains automatic role authority and retention of stored flags. There is no granular Finance checklist in that dialog.
- An existing Lawyer+ profile still displays `ทนายความ` and the existing granular capability controls, including its checked Finance access. Only the collapsed section was opened; no role, flag, classification or field was changed.
- Desktop and **390 CSS px** visual inspection passed for Admin and non-Admin dialogs. The Admin view had no horizontal overflow; Finance Overview also fit 390 px. The temporary viewport override was reset.
- Both dialogs were dismissed with Cancel. The user table text at the original viewport was identical before and after the form checks.
- Admin Finance navigation loaded the current and Legacy links. Read-only visits to `/finance/overview`, `/finance/ledger`, `/finance/expense-claims`, `/finance/expenses/claims` and `/finance/statement` rendered successfully.
- No console warning/error or visible runtime error was observed. Existing empty Finance states and the missing-opening-balance notice remain unchanged.
- Inactive Admin denial, non-Admin access preservation and lawyer → admin → lawyer flag retention were verified by local permission/PostgreSQL regression tests; no Production account was impersonated or deactivated for smoke.
- No Save/Create/Delete/Invite/Resend action, Production SQL, financial transaction or permission update was executed. No non-Admin access was widened and no Phase 8C work started.

## Project guard

`/Users/paolawyer/vp-case-app/vp-case-web`, `main`, starting HEAD/origin/main `9dd39ee717b2e2bf9160482b1ed04e49c84f22e2`. No tracked changes at start; 34 pre-existing untracked audit/diagnostic files preserved. Applied migrations 001–073 are unchanged.

## Authorization audit

| Capability / path | Before 074 | Candidate outcome |
|---|---|---|
| `financial_access`; Core case/non-litigation/financial data | Core DB helpers already active Admin/Partner OR existing explicit financial access; UI Fee view/edit already Admin by role | Effective UI financialAccess now includes Admin; stored field untouched |
| Legacy Company Ledger view/edit/void | UI view role-aware, edit/void flags only; RLS requires flags and account grants | Active Admin operation policies; existing non-Admin predicates and grants unchanged |
| Legacy Expense Claims submit/own/all/review/pay | UI staff/Partner hierarchy for first four, pay flag only; RLS flag-based | Active Admin operations independent of flags; old non-Admin policies unchanged |
| Legacy Compensation view/create/edit/void | UI Admin/Partner view/create; edit/void flags; RLS flag branch plus Partner draft branch | Admin capability overrides and supported operations; Partner draft constraints unchanged |
| Bank visibility | Legacy UI applied partial bank grants BEFORE Admin override; bank table SELECT also flags | Admin first in both lists; Admin SELECT policy; all non-Admin account filtering retained |
| Payment manage/confirm/reverse/reallocate | 022/029: active AND (Admin OR explicit capability); view includes Partner | No DB/helper/UI-rule change |
| Cash view/manage/confirm/reverse | 025: active Admin OR existing role/flags; account-scoped grants for non-Admin | No change |
| Billable Charge view/manage/approve | 030: active Admin OR existing flags/Partner view | No change |
| Receipt view/manage/issue/void | 037: active Admin OR corresponding flag | No change |
| Tax Invoice view/manage/issue | 039: active Admin OR corresponding flag | No change |
| Combined documents | 040: corresponding Receipt AND Tax permissions | No change |
| Direct Money, Distribution, Treasury | 044/049 and later callers: active Admin helper, existing account-scoped rules | No change |
| Tax Position / filing / corrections | 050/052/064/065 and later callers: active role/capability helpers | No change |
| Payout, company purchase, reimbursement, Statement, Executive dashboard | 051/055/063/068–071: existing active Admin helper or active granular helper composition | No change |
| Office Work five capabilities | UI flags only; current Production policy bodies not available in local accepted evidence | UI Admin overrides, additive Admin policies and inactive-Admin ceiling. Preflight returns exact current policies for review |
| `current_user_is_admin()` | 202607090005, no active check | Requires active Admin |
| `current_user_is_admin_or_partner()` | 202606290001, no active check | Requires active for Admin only; original Partner predicate unchanged |
| `current_user_can_manage_finance_quotations()` | 202607090001, no active check | Same targeted Admin activity requirement, Partner unchanged |
| `current_user_can_approve_document_platform()` | 202607180002, no active check; compatibility wrapper calls it | Same targeted Admin activity requirement; owner/ACL preserved, no new browser EXECUTE grant |
| People Administration / API | 073 `people_is_active_admin`, API server `isActiveAdmin`; self/history protections | No backend changes; role-only patch retains all explicit flags |
| App/Finance navigation | `AuthGuard` requires active profile; QuotationGuard independently validates activity; API PDF also checks active; modern new Finance visibility deliberately Admin-only | Visibility conventions unchanged; known inactive Admin yields no builder permissions |

Active Admin means role authority, **not permission to bypass lifecycle, monetary, immutability, delete-history, self-protection or retired-flow guards**. No operation is added where the application has no supported operation (e.g. Ledger DELETE). Existing grants are preserved; a restrictive Production policy conflict makes Preflight FAIL, not permission to remove it.

Non-Admin behavior is deliberately frozen, including historical Partner predicates in the four old helpers. This task does not broaden or redesign non-Admin authorization. Lawyer+ is still `role=lawyer` plus selected explicit flags. Switching lawyer → admin → lawyer does not set/erase capability fields.

### Evidence boundaries

Repository 001–073 definitions and current UI/server call sites were inspected. A local SELECT-only capture dated 2026-09-23 supplies exact historical Legacy Finance policies and four old helper definitions/security. Later repository migrations do not rewrite these legacy policies/helpers. That capture is **current-state historical evidence, not proof of today's entire post-073 Production catalog**. The 490 broader unreconciled differences are neither accepted nor investigated here.

The local DB fixture copies those specific historical policy expressions but uses synthetic rows, simplified shapes/grants and an explicitly synthetic adversarial Office Work policy. It is not substituted for Production truth. The manual SELECT-only Preflight returns current scoped policies, triggers, ACLs and exact four helper bodies; it fails closed on incompatible helper definitions/security, missing tables/RLS, restrictive-policy conflicts or pre-existing 074 targets. Review its result before any manual Apply.

074 preserves current ACLs rather than replacing them with fixture grants. Its transaction snapshots public/Auth rows, unchanged function metadata/definitions, original policies, table metadata and triggers; postconditions abort if any protected item changes. Snapshot comparison within one locked transaction proves preservation without silently accepting a historical whole-database manifest. SHARE locks briefly block concurrent writes; 10-second lock and 120-second statement timeout fail safely. No persistent historical/user-row update is in the migration.

## Implementation changes

- Replace only the four old helper bodies; preserve their owner, ACL, search_path and other metadata.
- Add 17 supported Admin operation policies and six inactive-Admin restrictive ceilings across Ledger, Claims, Compensation batches/allocations, Bank Accounts and Office Work.
- One private-purpose stable SECURITY DEFINER ceiling helper, owner `postgres`, explicit EXECUTE only `authenticated` and `service_role`; PUBLIC/anon revoked. Existing `people_is_active_admin()` grants unchanged.
- Existing policies, RLS, grants, triggers and non-Admin branches are not replaced or dropped.
- UI: Admin full-authority explanation in create/edit and list; hide Admin checklist. Non-Admin checklist, selected flags and save-diff behavior unchanged.
- Existing Admin page remains Thai-only under the current locale-coverage policy; no mixed TH/EN and no locale architecture expansion. English example wording is not exposed on a disabled English route.
- Legacy page profile projections omit `active`; their existing AuthGuard checks activity before rendering. The builder rejects a supplied false/null Admin activity value; it is not a substitute for the authenticated DB/server guard.

## Intended file manifest

1. `lib/permissions.ts`
2. `app/admin/users/page.tsx`
3. `app/admin/users/users.module.css`
4. `app/finance/ledger/page.tsx`
5. `app/finance/expense-claims/page.tsx`
6. `supabase/migrations/202607180074_admin_full_access_semantics.sql`
7. `scripts/sql/preflight_admin_full_access_074.sql`
8. `scripts/tests/admin-full-access.test.cjs`
9. `scripts/tests/admin-full-access-postgres.test.cjs`
10. `scripts/tests/fixtures/admin-full-access.sql`
11. `scripts/tests/people-admin-ui.test.cjs`
12. `docs/core/PHASE8B4_ADMIN_FULL_ACCESS.md`

## Validation

- 43 permission/User Management/UI/API/Core regression tests PASS.
- 20 real isolated PostgreSQL 18 tests PASS (074 + existing 073). Unix sockets only; no environment credentials or remote connections. Covers actual 073 role-change RPC, stored flags, non-Admin before/after RLS matrix, current repository Finance helper composition, inactive Admin, original ACL/policy/row preservation and lifecycle guard preservation.
- Targeted ESLint PASS; `npx tsc --noEmit` PASS; production build PASS; diff check PASS.
- Non-mutating Production smoke PASS on desktop and 390 CSS px, as recorded above. No business UAT transaction was executed.

## Historical gate artifact — do not re-run after Apply

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_admin_full_access_074.sql
```

The Preflight is retained as gate evidence only. Migration 074 is now applied and verified by the owner. No further Production SQL is part of closeout.

Candidate 074 SHA-256: `f4425d58a006b3e10328855f4d75aab8a2f013df2243f4e3e14060c33996fef8`. Preflight pins this repository artifact identity; it does not claim to hash an unapplied file inside PostgreSQL.
