# Advisory 085 — Work Type and Journey Family foundation

Status: **HUMAN-APPLIED AND VERIFIED PASS — application release authorized**.

Repository: `/Users/paolawyer/vp-case-app/vp-case-web`, branch `main`.
Release baseline: `aead6f8d9376ae5f3a7303d47403ff5f61161825`.
Human confirmed Production apply and SELECT-only verification PASS. The agent does not rerun Production SQL or mutate business data. Commit/push and application deployment are authorized for this release.

## Approved context and scope

The approved mapping was recovered from the project conversation **Codex Release
Task** (`6ab9448d-1898-83ec-8783-8604d97e61ae`), 1 October 2026. The user accepted
the proposed mapping in the turn immediately following the ten-family table.
The earlier seventeen-item taxonomy plus the explicitly accepted Visa / Work
Permit type supplies eighteen Work Types, including Other.

Work Type describes what the work is. Journey Family describes its linear
progression. The catalog records both separately. The stage patterns from that
discussion are represented as ordered arrays with a final `close` marker, without
branching, optional stages, new closing semantics or a Case-creation flow.
“Close or refer to litigation” is a label for the existing explicit closing
mechanism, not a new automatic Case transition.

The approved 18-type mapping and bilingual family/stage names are frozen in
`scripts/tests/fixtures/advisory-085-journey-catalog.json` for this gate. English
translations and internal snake-case identifiers implement the approved Thai
categories. Existing persisted Work Type values are not relabeled or rewritten
by this migration.

| Work Type | Journey Family key |
| --- | --- |
| ที่ปรึกษากฎหมายทั่วไป | general_advisory |
| งานสัญญาและเอกสารธุรกิจ | contract_business_documents |
| ความเห็นกฎหมาย | legal_analysis_compliance |
| เจรจาและระงับข้อพิพาทก่อนฟ้อง | negotiation_pre_litigation |
| นิติบุคคลและงานทะเบียนบริษัท | corporate_transactions |
| ใบอนุญาต ขึ้นทะเบียน และอนุมัติจากหน่วยงานรัฐ | government_regulatory |
| ประสานงานราชการและหนังสือโต้ตอบ | government_regulatory |
| กฎหมายปกครองและการโต้แย้งคำสั่งหน่วยงานรัฐ | administrative_challenge |
| แรงงาน ข้อบังคับ และเอกสารบุคลากร | employment_foreign_workforce |
| ทรัพย์สินทางปัญญาและเครื่องหมายการค้า | ip_registration |
| กำกับการปฏิบัติตามกฎหมาย | legal_analysis_compliance |
| คุ้มครองข้อมูลส่วนบุคคล | legal_analysis_compliance |
| อสังหาริมทรัพย์และตรวจสอบกรรมสิทธิ์ | real_estate_due_diligence |
| ทวงถามหนี้และปรับโครงสร้างก่อนฟ้อง | negotiation_pre_litigation |
| ควบรวม ร่วมทุน และตรวจสอบสถานะกิจการ | corporate_transactions |
| การลงทุนต่างชาติ BOI และการประกอบธุรกิจของคนต่างด้าว | government_regulatory |
| วีซ่า ใบอนุญาตทำงาน และการจ้างชาวต่างชาติ | employment_foreign_workforce |
| อื่น ๆ | general_advisory |

## Why a database gate is required

Before 085, `MatterEditor` submitted `matter_type` and `template` separately to
`advisory_control_write(uuid,text,jsonb,uuid,bigint)`. The accepted 081 create path
calls `advisory076_template(text)`. That pure function supported only `general`,
`contract`, `opinion`, `negotiation` and `license`. A new key returned
NULL and the create transaction raises `ADVISORY_TEMPLATE_INVALID`.

085 changes **only** the definition of `advisory076_template(text)` by adding
ten new keys. All five original branches remain byte-for-byte unchanged. Its
signature, return type, immutable volatility, invoker security, search_path,
owner, ACL and effective EXECUTE privileges remain unchanged. All other Advisory
functions, including create, first-Stage initialization, completion/advance,
Next Action, team/time, read contracts, and close/reopen remain exact.

There are no persistent tables, columns, policies, grants, triggers or rows added
by the migration. No dependency on Visual Assets is introduced. No Finance or
Case business logic is changed. Applied migrations 076–084 remain immutable.

Existing Matters retain their stored plans and visits. Existing unset Matters
stay unset. Old clients may continue submitting the five existing template keys.
The authorized application release now uses the 18-entry new-creation catalog
and separate family keys. Historical type labels/filter choices remain
available. Stored stage plans take precedence over all default mappings.
The create form sends the selected Family explicitly; it exposes localized
Work Types and Family names without requiring users to manage template IDs.
Family-specific Stage translations apply to new plans; the five legacy
patterns and their labels remain compatible. No Journey UI redesign is included.

## Immutable migration and completed human gates

Applied migration: `supabase/migrations/202610010085_advisory_journey_families.sql`.

SHA-256:
`db0870e52ecafaead843d30a3a5620091f7f5a1fdbfdd54a19330fac87bad0e7`

1. Run only the static SELECT-only Preflight and review the result. It checks
   the accepted 082 Advisory contract, including functions and security, and
   captures the current 14-table Advisory row/catalog fingerprints. Legitimate
   UAT rows are captured fresh, not compared with stale historic counts.
2. After Human review, bind exact returned `rows_sha256` and `catalog_sha256`
   using `advisory-journey-families-artifacts.cjs --bind-verifier`. No fixture
   hashes may be used for Production. The initially unbound verifier fails closed.
3. Only after approval may the user apply the candidate, then run the verifier.
   The agent does not execute Production SQL.

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/preflight_advisory_journey_families_085.sql
```

Prepared Human Apply command (not authorized for execution by the agent):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/supabase/migrations/202610010085_advisory_journey_families.sql
```

Post-Apply command (bind reviewed Preflight hashes first):

```sh
pbcopy < /Users/paolawyer/vp-case-app/vp-case-web/scripts/sql/verify_advisory_journey_families_085.sql
```

The transaction locks the 14 scoped Advisory tables, checks the exact accepted
contract, replaces the one function and checks preservation before COMMIT.
Function or security drift aborts rather than being silently accepted. Both
gates are SELECT-only and invoke no business or template RPC. Exact catalog
definitions establish the family arrays without creating a test Matter.
Text sorting uses explicit C collation; stage ordering uses numeric ordinality.
NOT NULL evidence uses `pg_attribute.attnotnull`, excluding PG18-only
`pg_constraint.contype='n'` representation. No broader Finance drift is accepted.

## Migration gate validation (before Human Apply)

- 24 targeted tests on disposable PostgreSQL 18 with en_US.UTF-8, repeated with
  C collation: exact candidate apply/rollback, accepted preflight, unbound/bound
  verifier behavior, row/history/column/NOT NULL/policy/ACL/function drift denial.
- All 18 Work Types create their correct ordered family plan, exactly one first
  Stage visit and the existing lifecycle/Work State. Every linear family advances
  to the terminal marker without inventing a close visit or closing the Matter
  automatically. Explicit close/reopen still works.
- Concurrent identical create requests retain one response/Matter/visit;
  invalid-family attempts roll back. Existing authorization remains enforced.
- Legacy five-pattern outputs, existing unset Matter, old plan/visits and saved
  create retries are preserved. Disposable Finance canary fingerprints unchanged.
- Artifact consistency and touched-file ESLint pass. No application change was
  made, so no UI build/typecheck was required. PG17 is not installed locally;
  the established portable projection and NOT NULL drift test cover the known
  PG17/18 representation difference without claiming a PG17 execution.

The old 076/077 fixture guards are adapted only to synthetic local fixtures by
the established test harness. Applied 081/082 and candidate 085 execute exact
file bytes in that disposable database. No Production baseline is fabricated.

## Application release validation

Human-reviewed baselines bound before apply:

- rows: `a15c5743a123c869fdb936c51aa0dbb147e7d2e716e96f0f982bcd7a2fd60766`
- catalog: `0d9fbb5a5e1c05da206abf934753a5318de35e8cd7ce1463216e4b28a0c70491`

The runtime catalog is an exact copy of the gate-reviewed catalog; a targeted
test enforces equality and compares all ten ordered patterns with the immutable
085 migration. UI tests cover every creation option and its submitted Family,
bilingual Family/Stage labels, legacy list/detail/filter compatibility and
recorded-plan precedence. Browser checks use synthetic localhost data only.
No Production test Matter is created by the agent.

Release checks passed: 97/97 targeted UI/model/regression tests, artifact
consistency, touched-file ESLint, TypeScript and whitespace checks. Synthetic
browser checks passed TH/EN at 390/768/1024/1440, all 18 dropdown-to-Family
selections, real create-form payload, existing client selection safeguards,
no horizontal overflow and no console errors. Production deployment follows
the established Vercel Git integration on main; the release response records
the resulting commit and READY deployment.

Human UAT: inspect all 18 creation choices in TH/EN, create an authorized new
Matter and confirm its Family sequence/first Stage, then refresh. Compare an
existing legacy Matter and an unset legacy Matter to confirm their recorded
plan/history and unset state remain intact.
