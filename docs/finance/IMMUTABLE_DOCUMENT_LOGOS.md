# Phase 6A.1: immutable document logo evidence

## Scope and safety

The business owner has reported manual Production apply and post-apply PASS:
`document_logo_immutability_verification_pass = true`, `failed_checks = []`.
Migration 038 is now applied; do not edit or rerun it during repository finalization.
Its SHA-256 is `231a39cea5cf6cd3138a863e047d42e53535dca9606346f8c7c50f08091e682d`.
No Receipt refresh/Issue or other business mutation is part of finalization.
Existing migration 037 remains byte-identical (SHA-256
`cc496e113699120f0cf5c322253a361fe3752485f65170a2fc4be670b4fb91ba`).

The pre-existing Receipt Draft `a76cd43d-fe52-4008-ade1-f1d79a9f27bf` is not migrated,
refreshed, cancelled or recreated. Its confirmed Payment `9e2f601e-13ef-4165-8e2c-1887c3ad8861`
and Invoice `VP-IV-202609-000003` remain outside the write scope.

## Authoritative asset and retention contract

Document Settings reads the current logo pointer from
`finance_company_profiles.logo_storage_path`. Images are in the private
`vp-document-assets` bucket under `company/logo/`.

Previously the UI used timestamp-prefixed paths and `upsert: false`, but deleted
the old file after changing the profile pointer. Existing Storage policies also
allowed Admin overwrite and deletion. Those paths were not immutable evidence.

New uploads use UUID-prefixed paths and still use `upsert: false`. Replacing the
current pointer never deletes the previous logo. Failed profile saves also retain
the newly uploaded, unreferenced file. No garbage collector is introduced.

Migration 038 adds restrictive UPDATE/DELETE policies for the logo namespace.
Permissive existing policies cannot override these restrictions. Supabase's
[Storage access-control contract](https://supabase.com/docs/guides/storage/security/access-control)
requires UPDATE permission for overwrite/upsert; ordinary uploads use INSERT.
The existing Admin-only insertion rule and non-logo/signature policies are retained.
An additional SELECT policy permits users with Receipt-view permission to read
logo assets without granting access to signer assets.

The restrictive UPDATE policy checks both old and new rows, blocking modification
or movement out of/into the logo prefix. DELETE is denied for all retained logos,
not just currently referenced ones. `(bucket_id, name)` uniqueness prevents reusing
an existing path. Old paths receive the same RLS protection without copying assets
or rewriting business data. Normal new-logo INSERT and signer operations remain
under the original policies from `202607090005_document_settings_and_vp_qt_prefix.sql`.

This is enforced application/Storage-API immutability, not external WORM storage.
Storage service-role/owner access, direct object-store operations, policy changes,
TRUNCATE and destructive backup restoration are outside the application guarantee.
Privileged operators must preserve document assets. RLS does not protect against
an administrator bypassing it or rewriting/deleting bytes out of band. Frozen
object/version identifiers are evidence, not an external WORM or byte-hash guarantee.
No service-role or object-store write credentials are exposed to the browser.

## SQL Editor compatibility and the failed preflight

The original `sql_editor_can_install_storage_guard` was the conjunction of
`has_table_privilege(current_user,'storage.objects','TRIGGER')` and inherited owner
membership (`pg_has_role(...relowner,'USAGE')`). Production returned false for that
combined expression; it did not identify which individual predicate was false.
No migration DDL was attempted, so this is not evidence of a CREATE POLICY failure.

The final 038 removed both proposed triggers on `storage.objects`
(`document_logo_object_immutability`, `document_logo_truncate_guard`) and their
two public helper functions. There is no Storage ALTER TABLE, ownership transfer,
role switch/grant, extension configuration change or managed trigger operation.
The only Storage DDL is three CREATE POLICY statements. Public-schema Receipt
functions and the public Receipt Issue guard remain in the application's ownership
boundary. The catalog reader uses plain SELECT, not Storage FOR SHARE (which would
also require an UPDATE privilege).

Supabase documents Storage policies as the supported access-control interface.
Its [supautils policy grants](https://github.com/supabase/supautils#table-ownership-bypass)
allow a configured role to manage policies without owning the managed table.
The new preflight and migration share an exact capability query: native inherited
owner rights OR a real, platform-managed `supautils.policy_grants` entry for the
current role and Storage table. It reads `pg_settings` only, never sets a grant or
assumes that a role named `postgres` has it. Missing/unavailable configuration
fails closed. A synthetic placeholder setting is not accepted as a real grant.
TRIGGER privilege and owner membership are now separate observability fields,
not a managed-trigger requirement. All current Storage policy definitions and a
managed-trigger fingerprint are also returned for manual before/after review.

Production policy installation has now passed the owner's manual workflow, not
merely local tests. For any future fresh installation, a false
`sql_editor_can_manage_storage_policies` still requires STOP and review of the
returned role/grant evidence. No hidden CLI, service-role or superuser workaround
is authorized; never remove that guard merely to achieve PASS.

## Receipt snapshot and review

New/explicitly refreshed Receipt Drafts use snapshot `schema_version: 2` with:

```json
{
  "seller": {
    "logo_asset": {
      "bucket": "vp-document-assets",
      "path": "company/logo/<retained-version-path>",
      "object_id": "<storage.objects.id>",
      "storage_version": "<available Storage version, otherwise null>"
    }
  }
}
```

No image data, signed URL or base64 is put in a snapshot. The object ID and available
Storage version supplement the retained, immutable bucket/path. A content hash is
not invented from an opaque Storage version or ETag.

`document_logo_evidence(text)` is an internal SECURITY DEFINER reader, not a browser
RPC. It rejects missing/unsafe paths and unavailable/non-image Storage objects.
`build_finance_receipt_source(uuid)` retains every existing financial/source check
and differs only by adding logo evidence and schema version 2. Its old body hash
is asserted before migration replacement, to avoid overwriting unexpected drift.

Create, Refresh and Issue RPC signatures and bodies remain unchanged. The builder
is already called by each. Issue compares freshly built source to stored Draft
and the caller's exact reviewed JSON before numbering. Logo A to B therefore
requires Refresh and Preview again, even if an earlier operator refreshed in the
meantime. Existing company-profile FOR SHARE and Payment locks serialize source
changes against Issue. Storage catalog reads need no mutation/row-lock privilege:
normal API paths cannot change retained logo objects under the restrictive RLS.
Privileged concurrent object changes are outside this application guarantee.

A separate Issue transition trigger requires schema 2 and exact catalog-backed
logo evidence. Ordinary financial guards, numbering, idempotency, frozen Invoice
coverage and Receipt/Payment downstream guards are unchanged.

## Rendering and legacy handling

Receipt presentation reads only the chosen snapshot. Draft uses its Draft evidence;
Issued/Voided use issued evidence, never current Document Settings or Draft values.
The UI downloads exactly that private path, decodes it before review, and gives
the shared `DocumentIdentityHeader` a local Blob URL. This avoids signed-URL expiry
while the page is open for printing. Blob URLs are revoked on reload/unmount or
stale requests. Print waits for document fonts and document image decoding.
Missing/invalid schema-2 evidence or unavailable image data fails closed and blocks
review/Issue/Print; it never substitutes the current logo.

Schema-1 history is explicitly recognized as lacking frozen logo evidence. It
remains readable without a guessed logo. An old Draft shows a refresh explanation
and cannot Issue until explicitly refreshed and reviewed. Already-issued schema-1
Receipts retain their historical no-logo appearance, including VOID and retries.

The shared header, address formatter and styles are unchanged. Existing logo
dimensions (24 x 18 mm) and mobile Receipt stacking work without a new layout.

## Invoice and Fee Agreement follow-up

Invoice's `resolveFrozenDocumentIdentity` currently falls back to the live logo
when its snapshot lacks a path. Fee Agreement uses `resolveDocumentIdentity`,
which can also fill missing frozen identity/logo fields from the current profile.
Retention now protects any existing captured paths, but cannot infer a historical
logo absent from a snapshot or restore objects deleted before 038.

These renderers are unchanged in this phase. The smallest prospective follow-up
is to adopt the same `seller.logo_asset`/retained-object contract at each future
document's review/freeze boundary, with explicit legacy handling and no live
fallback for newly frozen versions. Do not backfill old documents by guessing.

## Validation and limitations

- Isolated PGlite applies 037 plus full 038, tests the real Receipt/Payment guards,
  stale review, schema-1 upgrade, Issue/VOID snapshots, real existing Storage policies,
  denied browser overwrite/delete/rename/upsert and explicit privileged bypass limits,
  new upload paths, unchanged signer behavior, and no financial effects.
- SELECT-only preflight/verifier execute against exact synthetic UAT IDs and
  validate real catalog definitions. Removing protection causes verification failure.
- The exact operator dry-run runs in memory and rolls back; static tests enforce
  BEGIN/ROLLBACK, no COMMIT, exact embedding and unchanged 037 bytes.
- PGlite tests native owner policy installation and rejects a non-owner lacking a
  platform grant; it does not emulate Supabase's supautils hook. Managed Production
  installation is reserved for the manual workflow, not claimed from local fixtures.
- Synthetic Receipt, Issued and VOID rendering is checked at 1280/768/375/320 px,
  with decoded, nonblank logo pixels, no text overlap/overflow, and A4 PDFs.
- The synthetic logo is test-only, not downloaded from Production or written into
  snapshots. Production Storage catalog presence cannot prove the remote bytes
  are downloadable; the later human Preview check completes that validation.
- The preflight preserves the structured-WHT checks except their obsolete
  Receipt-table absence predicate, replacing that with exact 037 contracts and
  current unissued-Draft/no-number/no-allocation checks. Ledger/Compensation global
  counts remain observability only. Compare Receipt/audit fingerprints before/after.

## Intended file manifest

```text
app/finance/receipts/[id]/page.tsx
app/finance/receipts/[id]/preview/page.tsx
app/finance/receipts/receipt-document.tsx
app/finance/receipts/shared.ts
app/finance/receipts/use-receipt.ts
app/settings/document-settings/page.tsx
lib/documentLogo.ts
supabase/migrations/202607180038_add_immutable_document_logo_evidence.sql
scripts/sql/preflight_document_logo_immutability.sql
scripts/sql/dry_run_document_logo_immutability.sql
scripts/sql/verify_document_logo_immutability.sql
scripts/tests/document-logo-postgres.test.cjs
scripts/tests/document-logo-presentation.test.cjs
scripts/tests/document-logo-render-fixture.cjs
scripts/tests/document-logo-sql-artifacts.cjs
scripts/tests/document-logo-sql-static.test.cjs
scripts/tests/receipt-foundation.test.cjs
scripts/tests/receipt-layout.cjs
scripts/tests/receipt-render-fixture.cjs
scripts/tests/receipt-sql-static.test.cjs
docs/finance/IMMUTABLE_DOCUMENT_LOGOS.md
```

## Manual handoff

The SQL artifacts are retained as the reviewed migration workflow evidence.
Production apply/PASS is complete; repository finalization does not rerun SQL.

After an approved deployment, the human opens the same Receipt Draft, clicks
`รีเฟรชร่างจากรายการรับชำระ`, then reopens Preview. Check VP logo, seller address,
settlement 5,000.00 THB, WHT 140.19 THB, actual money received 4,859.81 THB and
Invoice VP-IV-202609-000003. No Tax Invoice/e-Receipt wording should appear.
Keep the Draft unissued and return screenshots before further action.
