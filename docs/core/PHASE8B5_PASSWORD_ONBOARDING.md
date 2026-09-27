# Phase 8B.5 — Temporary-password onboarding

Status: Migration 075 Production PASS; post-migration release validation complete, deployment/smoke pending. Human UAT remains pending.
No Production SQL, Auth operation, user change or email is part of this release.

## Production gate evidence — 2026-09-27

Owner-reported verifier: `gate_pass=true`, `failed_checks=[]`, `existing_profile_count=10`. All reported checks are true: `column_contract`, `server_only_completion`, `historical_rows_unchanged`, `private_functions_contract`, `existing_profiles_not_forced`, `onboarding_triggers_contract`, `auth_users_passwords_unchanged`, `existing_contracts_security_preserved`.

The ten pre-existing profiles remain `must_change_password=false`; roles, activity, classification, assignment and Finance flags are preserved by the accepted migration verifier. This evidence is supplied by the owner; release does not re-run database SQL or modify a user to re-test it.

## Release evidence — pending deployment

Final release checks repeat the full 103-test baseline (74 application/UI/permission tests, 29 isolated PostgreSQL tests), targeted ESLint, TypeScript, production build and diff check. Only the intended 18-file manifest below is eligible for staging. The existing Vercel Git integration deploys the pushed `main` commit. Exact release SHA, deployment and non-mutating smoke will be recorded after verification in an evidence-only documentation commit, following the preceding 8B.4 closeout workflow.

## Project guard

- Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
- Starting HEAD and local `origin/main`: `c9fee5d1556e53b08bfe516c4c7e65f0006d7089`.
- No starting tracked modifications; all 34 pre-existing untracked files preserved.
- Implementation started after 074. Migration 075 is now manually applied and verified by the owner. No applied migration changed.
- Applied artifact: `supabase/migrations/202607180075_user_password_onboarding.sql`.
- Candidate SHA-256: `66b4dbcdeffb8f6dc3a52988db74b073fb428633df1a6be9895bc78d2edc7f8e`.

## Current architecture traced

The existing `/api/admin/users` handler delegates to the server-only People helper. It verifies an Auth identity and active Admin profile, provisions a banned Auth identity, initializes its profile through the existing 073 RPC, compensates profile failure by deleting only the newly created unused identity, then unbans it. Before this change, the final onboarding step used `inviteUserByEmail`; the additional-management action resent that invitation.

Login uses Supabase password sign-in and checks the active profile. Existing page guards checked active status, but protected page components could mount and start effects before their nested guard completed. `/account/security` previously called `auth.updateUser({password})` directly from the browser and applied an eight-character minimum. Root layout had no auth gate. Sign-out uses the existing Supabase client. No middleware or Auth callback architecture was added or removed.

Installed `@supabase/supabase-js` and `@supabase/auth-js`: 2.103.3. The installed `GoTrueAdminApi` supports `createUser` with password, `email_confirm`, `app_metadata`, and `updateUserById` with password/app metadata. The installed client password update uses Auth `PUT /user`. The personal-password endpoint uses that same caller-JWT operation, preserving Auth's policy/recent-session checks instead of performing a privileged Admin password update for the caller.

The application minimum remains eight characters for both temporary and personal passwords; neither is trimmed. Required value and confirmation equality are checked on both sides. Supabase remains authoritative for any additional configured password policy. Production Auth policy settings were not accessed or altered. Official [Admin creation contract](https://supabase.com/docs/reference/javascript/auth-admin-createuser) and [user password-update contract](https://supabase.com/docs/reference/javascript/auth-updateuser) were checked. The [Auth server Admin update implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go) places password and app-metadata updates in one database transaction; local PostgreSQL tests separately verify trigger atomicity, including metadata attached after the initial profile insert. No hosted Auth operation was used for testing.

## Final create and reset flows

### Create

1. Active Admin who has completed onboarding enters existing People fields, temporary password and confirmation.
2. Server validates authorization, profile fields and shared password policy.
3. Auth `createUser` receives the password, `email_confirm: true`, existing provisioning ban/provenance and a random `vp_temporary_password_nonce` in server-owned app metadata.
4. The profile INSERT / Auth metadata trigger sets `must_change_password=true`. Existing 073 profile initialization must return this flag before the server proceeds.
5. Profile failure attempts the existing narrowly guarded cleanup of only the identity returned by this creation attempt.
6. After another Admin authorization check, unban the completed identity and return its ID/required-change state. No password or Auth user object is returned. No invite is sent.

The create button is “สร้างผู้ใช้” / “Create User”. Temporary fields and first-sign-in explanation use shared TH/EN strings. Admin gives credentials to the new user directly; the app does not send email or store a password copy.

If Auth creation returns an uncertain result, the existing operation reference is surfaced without modifying another identity. If profile cleanup or final unban fails, the identity remains banned and a recovery reference is returned. Operator reconciliation is required for such an interrupted provisioning case; no automatic retry broadens access or changes an existing account.

### Admin reset

Under existing additional account management, “ตั้งรหัสผ่านชั่วคราวใหม่” / “Set New Temporary Password” accepts a temporary password and confirmation. The server rechecks active Admin authority and target Auth/profile identity, then calls `updateUserById` with only password and a new app-metadata nonce.

The Auth metadata trigger sets `must_change_password=true` in that same transaction. Failure rolls back the flag alongside the Auth change. Reset does not unban or activate an inactive target, alter role, change account type/assignment, or edit Finance flags. It cannot read or display the old password. The retired invitation action is rejected. Reset inputs do not constrain the separate profile-save form; their own action enforces the shared policy.

## State, authorization and concurrency

One persistent profile field is added: `must_change_password boolean NOT NULL DEFAULT false`. All existing profiles remain false. There is no backfill, new role, People table, or classification change.

New private functions:

- `people075_profile_insert()` — derive initial state from server-owned Auth app metadata, never browser-editable user metadata.
- `people075_auth_reset()` — set the requirement when the temporary-password generation changes.
- `people075_complete_password_change(uuid,text)` — clear only the flag, callable only by `service_role`.

All three are owned by `postgres`, SECURITY DEFINER, with `search_path=public`; all table references in the new functions are schema-qualified. Explicit revocation from PUBLIC/anon/authenticated/service_role precedes the single service-role completion grant. Trigger functions have no direct service-role EXECUTE grant. Existing function ACLs/ownership and RLS policies are preserved.

The existing 073 profile-update guard keeps its prior behavior for every ordinary edit. The only new exception accepts a flag-only update with the private target marker, from the nested Auth trigger or service-role completion. Browser roles, including Admin, cannot write the flag directly, forge a marker to bypass the guard, or clear it using either the old profile RPC or new private RPC.

Personal change is ordered as follows:

1. Verify caller Auth identity and active profile; validate matching personal password.
2. Update the caller's Auth password successfully.
3. Invoke private completion with the generation observed before that Auth update.
4. Completion locks the Auth row and checks the generation; only then clears the flag.
5. Show success and allow normal navigation.

If Auth fails, no completion call or proof is produced. If Auth succeeds but private completion fails, the response contains a five-minute signed completion ticket carrying only user ID, generation and expiry. It is held in React state, never persisted, and allows a completion retry without another password update. Forged, expired and different-user tickets fail; a newer Admin reset invalidates an older ticket. Two independent PostgreSQL sessions confirm both reset-first and completion-first ordering leave the newest reset requirement intact.

Passwords exist only in input/request memory and the Auth request. No password is put in profile metadata, audit calls, application logs, error payloads, tickets, documentation, browser persistence or analytics. The generation marker is not a password. The existing server-only service-role secret is not exposed or copied into a public environment variable.

## Application workflow guard

The root layout now wraps children in the existing AuthGuard, with only `/login` public. Its context avoids repeated nested checks and prevents page effects from mounting before initial/route-change checks. Active users requiring a change are directed to `/account/security`; that page remains accessible without a redirect loop. Inactive users are signed out and denied.

Checks also run on focus, visible-tab restoration, Auth state events and a 30-second interval. Thus a reset is detected during continued use as well as next login/navigation. Missing schema/profile state fails closed. Existing Admin and quotation-PDF server endpoints also deny unfinished onboarding; the PDF change is only an authorization condition, with no document/Finance logic change.

This is the requested application workflow control, not a new global RLS rule. Existing database roles/capabilities still govern direct Supabase calls. This phase deliberately does not rewrite every Core/Finance RPC or RLS policy.

`/account/security` serves forced and ordinary modes, has matching-password validation, safe localized error/retry/success messages, and sign-out. It uses the existing bilingual scope. New password-related strings have TH and EN equivalents; the broader Admin screen retains its established Thai-only locale coverage. No mixed paired labels were introduced.

## Preservation

- Active Admin retains full access by role after completing onboarding; inactive Admin remains denied.
- Non-Admin capability behavior is unchanged.
- Lawyer+ remains `role=lawyer` with explicit Finance capabilities intact.
- Operational/UAT, assignable and active states are unchanged by password reset.
- Admin retains full-access explanation without granular Finance checklist; non-Admin retains granular controls.
- No Finance business function, calculation, posting, permission or historical record is changed.
- No Case, Non-Litigation, Calendar, Dashboard, or Phase 8C product work.

## Historical migration gate — do not re-run

The complete candidate includes BEGIN/COMMIT, bounded lock/statement timeouts, a fail-closed preflight, and a preservation verifier before COMMIT. It refuses an existing 075 target or a different 073 profile-update guard body. It snapshots protected public business rows and Auth users as counts/hashes, locks them against concurrent writes during the comparison, and checks the existing function/security/policy/trigger contract. Only the intended guard body and new 075 objects are excluded from the unchanged-contract comparison; no broader historical drift is normalized or accepted.

The verifier requires:

- Exact boolean/default/not-null column contract.
- Existing profile count/data unchanged except the new default-false field; none forced.
- Existing Auth users/password hashes unchanged, and historical rows unchanged.
- Existing function metadata/ACL, policies, table security and triggers unchanged.
- Private function ownership/security/search_path/effective grants and onboarding triggers valid.

Any failed check aborts the transaction. The final result must report `gate_pass=true`, `failed_checks=[]`, `existing_profiles_not_forced=true`, `historical_rows_unchanged=true`, `auth_users_passwords_unchanged=true`, `existing_contracts_security_preserved=true`, `column_contract=true`, `private_functions_contract=true`, `onboarding_triggers_contract=true`, and `server_only_completion=true`. Snapshot/verification objects are temporary; no Auth password change is performed by migration SQL.

The owner confirms manual Production Apply and verifier PASS. Do not re-run this applied migration. No Production SQL is executed during release.

## Validation

- 74 local application/API/People UI/permission/creation/document-authorization tests PASS.
- 29 local PostgreSQL 073/074/075 tests PASS (103 tests total).
- Includes real independent-session reset/completion concurrency, browser clear-flag denial, default-grant hardening, metadata-ordering, no-invite, compensation, retry proof, forced guard/no-loop/logout, TH/EN rendering, existing Admin and Lawyer+ preservation.
- Targeted ESLint PASS.
- Production `npm run build` PASS (Next.js 16.1.6). The first sandbox build stalled and was terminated; the same command passed outside the sandbox. An overlapping initial `tsc` run saw stale generated route types; final `npx tsc --noEmit` PASS after the successful build.
- `git diff --check` PASS. Final scope review: only the 18 listed files changed/added; all pre-existing migrations and all 34 unrelated untracked files remain byte-for-byte unchanged.

Fixtures use isolated disposable local PostgreSQL over private Unix sockets and synthetic Auth/API doubles. No Production credentials/database connection or Auth endpoint is used by tests. This is not a claim that hosted end-to-end Human UAT has occurred.

## Intended file manifest (18 files)

Modified:

1. `app/account/security/page.tsx`
2. `app/admin/users/page.tsx`
3. `app/api/finance/quotations/[id]/pdf/route.ts` — onboarding authorization condition only.
4. `app/components/AuthGuard.tsx`
5. `app/layout.tsx`
6. `app/login/page.tsx`
7. `lib/people.ts`
8. `lib/server/people-admin.ts`
9. `scripts/tests/people-admin-ui.test.cjs`
10. `scripts/tests/people-admin.test.cjs`

New:

11. `app/admin/users/TemporaryPasswordFields.tsx`
12. `app/api/account/password/route.ts`
13. `lib/password-onboarding.ts`
14. `lib/server/account-password.ts`
15. `scripts/tests/password-onboarding.test.cjs`
16. `scripts/tests/password-onboarding-postgres.test.cjs`
17. `supabase/migrations/202607180075_user_password_onboarding.sql`
18. `docs/core/PHASE8B5_PASSWORD_ONBOARDING.md`

## Human UAT after release — pending

1. Admin creates the first real new lawyer with a temporary password; no test Production user is created by automation.
2. Lawyer signs in, is taken to `/account/security`, cannot navigate into normal work, changes to their own password, then enters VP OS.
3. Verify normal role/Finance/assignment behavior and later sign-in; only if PASS create the second real lawyer.
4. Exercise Admin reset only when intentionally authorized. Inactive targets must stay inactive; ordinary password change remains available.

No Human UAT has been performed for this candidate. No Production user was created, invited, classified, activated, deactivated, deleted or reset. No permission flags were mass-updated. No Phase 8C work.
