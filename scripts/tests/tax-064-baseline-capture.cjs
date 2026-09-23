/* eslint-disable @typescript-eslint/no-require-imports */
// READ-ONLY evidence collection. Never promote a live snapshot to an approved baseline automatically.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const candidate = require('./tax-064-historical-artifacts.cjs');
const accepted = require('./reimbursement-bank-artifacts.cjs');
const output = 'scripts/sql/capture_post063_baseline_for_064.sql';
const statement = sql => sql.trim().replace(/;$/, '');
function captureSql() {
 const priorVerifier = accepted.workflow()[accepted.filenames.verify];
 const oldPreflight = candidate.workflow()[candidate.files.pre];
 return `-- SELECT ONLY. Evidence capture, NOT approval / a replacement passing Preflight.
-- Do NOT run 064 Dry-run or Apply. Every difference needs an evidence-backed A/B classification.
-- Capture the entire result as JSON; do not truncate ACLs, policies, definitions or differences.
-- Candidate SHA is independently checked against its existing manifest by the generator.
WITH accepted_063 AS (${statement(priorVerifier)}),
failed_064 AS (${statement(oldPreflight)}),
functions AS (${candidate.functionSql}),
catalog AS (${candidate.catalogSql}),
all_public_functions AS (
 SELECT p.oid::regprocedure::text signature, pg_get_userbyid(p.proowner) owner,
        pg_get_functiondef(p.oid) definition, md5(pg_get_functiondef(p.oid)) definition_hash,
        p.proacl::text acl, p.prosecdef security_definer, p.proconfig config
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY 1
),
security_context AS (
 SELECT c.relname name,pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls,
        c.relforcerowsecurity force_rls,c.relacl::text acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY 1
),
default_privileges AS (
 SELECT pg_get_userbyid(d.defaclrole) owner,coalesce(n.nspname,'*') schema,
        d.defaclobjtype object_type,d.defaclacl::text acl
 FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
 WHERE d.defaclnamespace=0 OR n.nspname='public' ORDER BY 1,2,3
),
role_membership AS (
 SELECT parent.rolname granted_role,member.rolname member,m.admin_option
 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid
 JOIN pg_roles member ON member.oid=m.member
 WHERE parent.rolname IN ('anon','authenticated','service_role','postgres')
    OR member.rolname IN ('anon','authenticated','service_role','postgres') ORDER BY 1,2
)
SELECT jsonb_build_object(
 'capture_kind','unreviewed_current_post063_evidence',
 'captured_at',clock_timestamp(),'database',current_database(),'captured_by',current_user,
 'server_version',current_setting('server_version'),
 'migration_064_sha256','${candidate.sha()}',
 'migration_063_sha256','${accepted.sha()}',
 'accepted_063_verifier',(SELECT to_jsonb(x) FROM accepted_063 x),
 'original_064_preflight',(SELECT to_jsonb(x) FROM failed_064 x),
 'functions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY signature),'[]') FROM functions x),
 'catalog',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM catalog x),
 'all_public_function_definitions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY signature),'[]') FROM all_public_functions x),
 'relation_security',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name),'[]') FROM security_context x),
 'default_privileges',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY owner,schema,object_type),'[]') FROM default_privileges x),
 'role_membership',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY granted_role,member),'[]') FROM role_membership x),
 'classification_required',true,'apply_or_dry_run_authorized',false
) AS baseline_evidence;
`;
}
if (require.main === module) {
 const sql = captureSql();
 if (process.argv.includes('--write')) fs.writeFileSync(output, sql);
 else assert.equal(fs.readFileSync(output, 'utf8'), sql);
 console.log('064 SELECT-only baseline capture verified; no baseline approval or Production connection');
}
module.exports = { captureSql, output };
