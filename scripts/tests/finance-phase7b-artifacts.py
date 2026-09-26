"""Build static manual gates only. Never opens a database connection.
Approval hashes are supplied by Codex after the user returns the PASS Gate 1 result.
The user workflow remains one pbcopy command per gate; no baseline JSON export.
"""
import argparse, hashlib, json, pathlib, os
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUTPUT=pathlib.Path(os.environ.get('VP7B_ARTIFACT_OUTPUT',str(ROOT))).resolve()
(OUTPUT/'scripts/sql').mkdir(parents=True,exist_ok=True)
(OUTPUT/'docs/finance').mkdir(parents=True,exist_ok=True)
A=json.loads((ROOT/'docs/finance/PHASE7A_DATA_CLASSIFICATION.json').read_text())
LEGACY=['finance_expense_claims','finance_compensation_batches','finance_compensation_allocations','finance_company_ledger']
EXTRA=['finance_payees','finance_payee_destinations','finance_payee_audit','finance_customer_tax_profiles','finance_customer_tax_profile_audit_events']
PURGE=sorted([t['table'] for t in A['tables'] if t['classification'] in ['NEW_FINANCE_UAT_PURGE','DERIVED_PURGE_WITH_PARENT']]+EXTRA)
COUNTERS=['QT','fee_agreement','invoice','receipt','tax_invoice','receipt_tax_invoice','credit_note','debit_note']
q=lambda s:"'"+s.replace("'","''")+"'"
arr=lambda a:'ARRAY['+','.join(map(q,a))+']::text[]'
PRED={t:'true' for t in PURGE}
PRED['case_audit_logs']='coalesce(r.table_name = ANY('+arr(PURGE)+'),false)'
PRED['finance_document_counters']='coalesce(r.doc_type = ANY('+arr(COUNTERS)+'),false)'
M={'version':1,'generator_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'repo_commit':A['baseline_commit'],'legacy_keep':LEGACY,'purge_all_rows':PURGE,'partial_delete_predicates':{k:v for k,v in PRED.items() if k not in PURGE},'finance_counter_types':COUNTERS,'preserve':'All other public rows, retained portions of shared audit/counters, all storage metadata, schema/functions/RLS/ACL/triggers/sequences.','trigger_strategy':'Disable only non-internal triggers on explicit delete targets, in transaction; restore original O/D/A/R enabled state. Never disable FK triggers.','deletion_strategy':'Live FK child-first order; cycles deleted within one dependent data-modifying CTE statement, with all FK checks active. No TRUNCATE, CASCADE, replica mode, FK drop or constraint alteration.','broader_unresolved_differences':490}
manifest_sha=hashlib.sha256(json.dumps(M,sort_keys=True,separators=(',',':')).encode()).hexdigest()
M['manifest_sha256']=manifest_sha
(OUTPUT/'docs/finance/PHASE7B_CLEANUP_MANIFEST.json').write_text(json.dumps(M,ensure_ascii=False,indent=2)+'\n')
selectors=','.join('('+q(k)+','+q(v)+')' for k,v in PRED.items())
required=sorted(set(t['table'] for t in A['tables']))
# One SELECT statement. query_to_xml evaluates only identifier-quoted SELECT aggregates;
# it never receives application function names, user inputs, or mutation statements.
STATE=r"""WITH RECURSIVE
selectors(table_name,predicate) AS (VALUES @SELECTORS@),
required(table_name) AS (SELECT unnest(@REQUIRED@)),
relations AS MATERIALIZED (
 SELECT n.nspname schema_name,c.relname table_name,c.oid,c.relkind,c.relowner,
 coalesce(s.predicate,'false') predicate,s.table_name IS NOT NULL delete_target
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN selectors s ON n.nspname='public' AND s.table_name=c.relname
 WHERE (n.nspname='public' AND c.relkind IN('r','p','f')) OR (n.nspname='storage' AND c.relname IN('objects','buckets') AND c.relkind='r')
),
row_xml AS MATERIALIZED (
 SELECT b.*,query_to_xml(format(
 'SELECT count(*) n,count(*) FILTER(WHERE %1$s) d,count(*) FILTER(WHERE NOT (%1$s)) k,
 encode(sha256(convert_to(coalesce(string_agg(h,''|'' ORDER BY h COLLATE "C"),''''),''UTF8'')),''hex'') a,
 encode(sha256(convert_to(coalesce(string_agg(h,''|'' ORDER BY h COLLATE "C") FILTER(WHERE NOT (%1$s)),''''),''UTF8'')),''hex'') p
 FROM %2$I.%3$I r CROSS JOIN LATERAL (SELECT encode(sha256(convert_to(to_jsonb(r)::text,''UTF8'')),''hex'') h) digest',predicate,schema_name,table_name),false,true,'') x
 FROM relations b WHERE relkind<>'f'
),
row_state AS MATERIALIZED (
 SELECT schema_name,table_name,(xpath('/row/n/text()',x))[1]::text::bigint n,
 (xpath('/row/d/text()',x))[1]::text::bigint d,(xpath('/row/k/text()',x))[1]::text::bigint k,
 (xpath('/row/a/text()',x))[1]::text all_sha,(xpath('/row/p/text()',x))[1]::text keep_sha FROM row_xml
),
fks AS MATERIALIZED (
 SELECT f.oid,f.conname,cn.nspname child_schema,ch.relname child_table,pn.nspname parent_schema,pa.relname parent_table,
 pg_get_constraintdef(f.oid,true) definition,f.convalidated,
 coalesce(cs.predicate,'false') child_pred,ps.predicate parent_pred,
 (SELECT string_agg(format('c.%I = p.%I',ca.attname,pa2.attname),' AND ' ORDER BY k.ord)
 FROM unnest(f.conkey,f.confkey) WITH ORDINALITY k(c,p,ord)
 JOIN pg_attribute ca ON ca.attrelid=f.conrelid AND ca.attnum=k.c JOIN pg_attribute pa2 ON pa2.attrelid=f.confrelid AND pa2.attnum=k.p) join_sql
 FROM pg_constraint f JOIN pg_class ch ON ch.oid=f.conrelid JOIN pg_namespace cn ON cn.oid=ch.relnamespace
 JOIN pg_class pa ON pa.oid=f.confrelid JOIN pg_namespace pn ON pn.oid=pa.relnamespace
 JOIN selectors ps ON pn.nspname='public' AND ps.table_name=pa.relname
 LEFT JOIN selectors cs ON cn.nspname='public' AND cs.table_name=ch.relname WHERE f.contype='f'
),
fk_dependencies AS MATERIALIZED (
 SELECT f.*,((xpath('/row/n/text()',query_to_xml(format('SELECT count(*) n FROM %I.%I c JOIN %I.%I p ON %s WHERE (%s) AND NOT (%s)',
 child_schema,child_table,parent_schema,parent_table,join_sql,replace(parent_pred,'r.','p.'),replace(child_pred,'r.','c.')),false,true,'')))[1]::text)::bigint retained_dependents
 FROM fks f
),
legacy_logical AS (
 SELECT @LEGACY_UNION@
),
logical_dependencies AS (
 SELECT l.table_name,l.r->>'id' legacy_id,k.key,k.value
 FROM legacy_logical l CROSS JOIN LATERAL jsonb_each_text(l.r) k
 JOIN (VALUES ('source_payment_id','finance_payments'),('payment_id','finance_payments'),('source_invoice_id','finance_invoices'),('invoice_id','finance_invoices'),
 ('payee_id','finance_payees'),('supplier_payee_id','finance_payees'),('destination_id','finance_payee_destinations')) m(field,target) ON m.field=k.key
 WHERE k.value IS NOT NULL AND ((xpath('/row/n/text()',query_to_xml(format('SELECT count(*) n FROM public.%I r WHERE to_jsonb(r)->>''id''=%L',m.target,k.value),false,true,'')))[1]::text)::bigint>0
),
catalog AS (
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) ORDER BY c.oid)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname IN('public','storage') AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.conrelid,c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('public','storage')),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(i.indexrelid,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgenabled,pg_get_triggerdef(t.oid,true)) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')),
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','storage') AND p.prokind IN('f','p')),
 'rules',(SELECT jsonb_agg(jsonb_build_array(r.oid,pg_get_ruledef(r.oid,true)) ORDER BY r.oid) FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','storage')),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d),
 'schemas',(SELECT jsonb_agg(jsonb_build_array(oid,nspname,nspowner,nspacl) ORDER BY oid) FROM pg_namespace WHERE nspname IN('public','storage'))
 ) value
),
sequences AS (
 SELECT coalesce(jsonb_agg(jsonb_build_array(s.schemaname,s.sequencename,to_jsonb(s),query_to_xml(format('SELECT last_value,is_called FROM %I.%I',s.schemaname,s.sequencename),false,true,'')::text) ORDER BY s.schemaname,s.sequencename),'[]') value
 FROM pg_sequences s WHERE schemaname IN('public','storage')
),
checks(code,ok) AS (
 SELECT 'owner_execution_role',current_user='postgres' UNION ALL
 SELECT 'required_relations',NOT EXISTS(SELECT 1 FROM required r WHERE NOT EXISTS(SELECT 1 FROM relations b WHERE b.schema_name='public' AND b.table_name=r.table_name)) UNION ALL
 SELECT 'storage_metadata_present',(SELECT count(*)=2 FROM relations WHERE schema_name='storage') UNION ALL
 SELECT 'delete_targets_plain_owned_tables',NOT EXISTS(SELECT 1 FROM relations WHERE delete_target AND (relkind<>'r' OR pg_get_userbyid(relowner)<>current_user)) UNION ALL
 SELECT 'no_foreign_tables',NOT EXISTS(SELECT 1 FROM relations WHERE relkind='f') UNION ALL
 SELECT 'no_unclassified_finance_tables',NOT EXISTS(SELECT 1 FROM relations b WHERE schema_name='public' AND (table_name LIKE 'finance\_%' ESCAPE '\' OR table_name LIKE 'document\_%' ESCAPE '\') AND NOT EXISTS(SELECT 1 FROM required r WHERE r.table_name=b.table_name)) UNION ALL
 SELECT 'retained_fk_dependents_zero',NOT EXISTS(SELECT 1 FROM fk_dependencies WHERE retained_dependents<>0) UNION ALL
 SELECT 'legacy_logical_dependents_zero',NOT EXISTS(SELECT 1 FROM logical_dependencies) UNION ALL
 SELECT 'no_customer_system_defaults',NOT EXISTS(SELECT 1 FROM public.finance_customer_tax_profiles r WHERE to_jsonb(r)->>'is_default'='true' OR to_jsonb(r)->>'scope' IN('system','default')) UNION ALL
 SELECT 'no_delete_rules',NOT EXISTS(SELECT 1 FROM pg_rewrite w JOIN relations b ON b.oid=w.ev_class WHERE b.delete_target AND w.ev_type='4' AND w.rulename<>'_RETURN') UNION ALL
 SELECT 'no_inheritance_delete_targets',NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE i.inhparent IN(SELECT oid FROM relations WHERE delete_target) OR i.inhrelid IN(SELECT oid FROM relations WHERE delete_target))
),
summary AS (
 SELECT coalesce(jsonb_agg(jsonb_build_array(schema_name,table_name,n,all_sha) ORDER BY schema_name,table_name),'[]') all_rows,
 coalesce(jsonb_agg(jsonb_build_array(schema_name,table_name,k,keep_sha) ORDER BY schema_name,table_name),'[]') keep_rows FROM row_state
)
SELECT jsonb_build_object(
 'manifest_sha256','@MANIFEST@','captured_at',statement_timestamp(),'database',current_database(),
 'gate_pass',(SELECT bool_and(ok) FROM checks),'failed_checks',(SELECT coalesce(jsonb_agg(code ORDER BY code) FILTER(WHERE NOT ok),'[]') FROM checks),
 'state_sha256',encode(sha256(convert_to(jsonb_build_array('@MANIFEST@',summary.all_rows,catalog.value,sequences.value)::text,'UTF8')),'hex'),
 'preserved_rows_sha256',encode(sha256(convert_to(summary.keep_rows::text,'UTF8')),'hex'),
 'catalog_sha256',encode(sha256(convert_to(catalog.value::text,'UTF8')),'hex'),
 'sequences_sha256',encode(sha256(convert_to(sequences.value::text,'UTF8')),'hex'),
 'legacy_keep',(SELECT jsonb_agg(to_jsonb(r) ORDER BY table_name) FROM row_state r WHERE table_name=ANY(@LEGACY@) AND schema_name='public'),
 'purge_counts',(SELECT jsonb_agg(jsonb_build_object('table',r.table_name,'rows',r.d) ORDER BY r.table_name) FROM row_state r JOIN selectors s USING(table_name) WHERE schema_name='public'),
 'preserved_counts_hashes',(SELECT jsonb_agg(jsonb_build_object('schema',schema_name,'table',table_name,'rows',k,'sha256',keep_sha) ORDER BY schema_name,table_name) FROM row_state),
 'counter_rows_to_reset',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY doc_type,year,month),'[]') FROM public.finance_document_counters c WHERE doc_type=ANY(@COUNTERS@)),
 'fk_graph',(SELECT coalesce(jsonb_agg(to_jsonb(f)-'oid'-'join_sql'-'child_pred'-'parent_pred' ORDER BY child_schema,child_table,conname),'[]') FROM fk_dependencies f),
 'legacy_reference_blockers',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]') FROM logical_dependencies d),
 'legacy_outstanding_is_not_a_cleanup_blocker',true,'broader_unresolved_differences',490,
 'catalog_freeze_is_not_acceptance_of_broader_drift',true,'storage_objects_deleted',false
) value FROM summary,catalog,sequences"""
STATE=STATE.replace('@SELECTORS@',selectors).replace('@REQUIRED@',arr(required)).replace('@LEGACY@',arr(LEGACY)).replace('@COUNTERS@',arr(COUNTERS)).replace('@MANIFEST@',manifest_sha)
STATE=STATE.replace('@LEGACY_UNION@',' UNION ALL '.join(q(t)+" table_name,to_jsonb(r) r FROM public."+t+' r' if i==0 else 'SELECT '+q(t)+',to_jsonb(r) FROM public.'+t+' r' for i,t in enumerate(LEGACY)))
# Required user-approved pins. Defaults deliberately make later gates non-executable.
p=argparse.ArgumentParser();p.add_argument('--state',default='PREFLIGHT_PASS_REQUIRED');p.add_argument('--keep',default='PREFLIGHT_PASS_REQUIRED');p.add_argument('--catalog',default='PREFLIGHT_PASS_REQUIRED');p.add_argument('--sequences',default='PREFLIGHT_PASS_REQUIRED');args=p.parse_args()
for v in vars(args).values():
 if v!='PREFLIGHT_PASS_REQUIRED' and (len(v)!=64 or any(c not in '0123456789abcdef' for c in v)):raise ValueError('Invalid approval hash')
PINS=f"SELECT {q(args.state)}::text state,{q(args.keep)}::text keep,{q(args.catalog)}::text catalog,{q(args.sequences)}::text sequences,{q(manifest_sha)}::text manifest"
INTRO='-- Phase 7B ONE-TIME DATA CLEANUP; not a migration. Prepared only; never executed by Codex.\n-- Use one complete static file per manual gate. No JSON/CSV baseline transfer.\n'
(OUTPUT/'scripts/sql/preflight_finance_phase7b_cleanup.sql').write_text(INTRO+'-- GATE 1 SELECT-only. Return the complete compact result; do not run another gate yet.\n-- Legacy outstanding/status anomalies are NOT cleanup blockers. Actual retained dependencies are.\n'+STATE+';\n')
# Build CTE deletes from the live FK graph; all targets are restricted to the manifest.
BODY=r'''
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'PHASE7B_OWNER_REQUIRED'; END IF;
 IF (SELECT state !~ '^[0-9a-f]{64}$' OR keep !~ '^[0-9a-f]{64}$' OR catalog !~ '^[0-9a-f]{64}$' OR sequences !~ '^[0-9a-f]{64}$' FROM pg_temp.p7b_pins) THEN RAISE EXCEPTION 'PREFLIGHT_PASS_HASHES_REQUIRED'; END IF;
 -- Brief transaction locks prevent concurrent writes; no persistent Legacy write lock.
 FOR gate_record IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relkind IN('r','p')) OR (n.nspname='storage' AND c.relname IN('objects','buckets') AND c.relkind='r') ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('LOCK TABLE %I.%I IN %s MODE',gate_record.nspname,gate_record.relname,CASE WHEN gate_record.nspname='public' AND gate_record.relname=ANY(@TARGETS@) THEN 'ACCESS EXCLUSIVE' ELSE 'SHARE' END);
 END LOOP;
 @BEFORE@
 IF (before_state->>'gate_pass')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'PREFLIGHT_DEPENDENCY_BLOCKERS: %',before_state->'failed_checks'; END IF;
 IF before_state->>'state_sha256' IS DISTINCT FROM (SELECT state FROM pg_temp.p7b_pins)
 OR before_state->>'preserved_rows_sha256' IS DISTINCT FROM (SELECT keep FROM pg_temp.p7b_pins)
 OR before_state->>'catalog_sha256' IS DISTINCT FROM (SELECT catalog FROM pg_temp.p7b_pins)
 OR before_state->>'sequences_sha256' IS DISTINCT FROM (SELECT sequences FROM pg_temp.p7b_pins)
 THEN RAISE EXCEPTION 'APPROVED_PREFLIGHT_STALE_RE_RUN_GATE_1'; END IF;
 INSERT INTO pg_temp.p7b_trigger_states SELECT c.relname,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(@TARGETS@) AND NOT t.tgisinternal;
 FOR gate_record IN SELECT * FROM pg_temp.p7b_trigger_states ORDER BY table_name,trigger_name LOOP
 EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',gate_record.table_name,gate_record.trigger_name);
 END LOOP;
 -- FK triggers stay enabled. Child-first ordering from the live, hash-approved FK graph.
 pending:=@TARGETS@;
 WHILE cardinality(pending)>0 LOOP
 SELECT x INTO selected FROM unnest(pending) x WHERE NOT EXISTS(
 SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.confrelid=to_regclass('public.'||x)
 AND f.conrelid<>f.confrelid AND f.conrelid IN(SELECT to_regclass('public.'||z) FROM unnest(pending) z)) ORDER BY x LIMIT 1;
 IF selected IS NULL THEN selected:=pending[1]; END IF; -- cycles: one statement; never disable RI
 ordered:=array_append(ordered,selected);pending:=array_remove(pending,selected);
 END LOOP;
 stmt:='WITH ';idx:=0;
 FOREACH selected IN ARRAY ordered LOOP
 idx:=idx+1;
 SELECT predicate INTO STRICT pred FROM pg_temp.p7b_selectors WHERE table_name=selected;
 stmt:=stmt||CASE WHEN idx>1 THEN ',' ELSE '' END||format('d%s AS (DELETE FROM public.%I r WHERE (%s)%s RETURNING 1)',idx,selected,pred,
 CASE WHEN idx>1 THEN format(' AND (SELECT count(*) FROM d%s)>=0',idx-1) ELSE '' END);
 END LOOP;
 stmt:=stmt||format(' SELECT count(*) FROM d%s',idx);
 EXECUTE stmt;
 -- Fire still-active deferred FK checks before restoring the exact original trigger modes.
 SET CONSTRAINTS ALL IMMEDIATE;
 FOR gate_record IN SELECT * FROM pg_temp.p7b_trigger_states ORDER BY table_name,trigger_name LOOP
 EXECUTE format('ALTER TABLE public.%I %s TRIGGER %I',gate_record.table_name,
 CASE gate_record.enabled WHEN 'D' THEN 'DISABLE' WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END,gate_record.trigger_name);
 END LOOP;
 @AFTER@
 IF (after_state->>'gate_pass')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'POSTCONDITION_DEPENDENCY_MISMATCH: %',after_state->'failed_checks'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(after_state->'purge_counts') x WHERE (x->>'rows')::bigint<>0) THEN RAISE EXCEPTION 'UAT_ROWS_REMAIN'; END IF;
 IF after_state->>'preserved_rows_sha256' IS DISTINCT FROM before_state->>'preserved_rows_sha256' THEN RAISE EXCEPTION 'KEEP_ROWS_CHANGED'; END IF;
 IF after_state->>'catalog_sha256' IS DISTINCT FROM before_state->>'catalog_sha256' THEN RAISE EXCEPTION 'SCHEMA_SECURITY_TRIGGER_CHANGE'; END IF;
 IF after_state->>'sequences_sha256' IS DISTINCT FROM before_state->>'sequences_sha256' THEN RAISE EXCEPTION 'SEQUENCES_CHANGED'; END IF;
'''
BODY=BODY.replace('@TARGETS@',arr(sorted(PRED))).replace('@BEFORE@','SELECT value INTO before_state FROM ('+STATE+') s;').replace('@AFTER@','SELECT value INTO after_state FROM ('+STATE+') s;')
start=INTRO+'''-- Requires PASS Gate 1 pins before execution. Use a quiet maintenance window.
-- Any error/mismatch rolls cleanup back. Never run a fragment or remove a guard.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL idle_in_transaction_session_timeout='120s';
SET LOCAL row_security=off;
CREATE TEMP TABLE p7b_pins ON COMMIT DROP AS '''+PINS+''';
CREATE TEMP TABLE p7b_selectors(table_name text primary key,predicate text) ON COMMIT DROP;
INSERT INTO p7b_selectors VALUES '''+selectors+''';
CREATE TEMP TABLE p7b_trigger_states(table_name text,trigger_name text,enabled "char") ON COMMIT DROP;
'''
declare="DECLARE gate_record record;before_state jsonb;after_state jsonb;pending text[];ordered text[]:='{}';selected text;pred text;stmt text;idx integer;failure text;\n"
# PREPARE is session-only and survives rollback. Clear any stale prepared result first.
# Success/failure is embedded as a literal, so a restored baseline alone cannot imply cleanup success.
final_dry="WITH current_state AS ("+STATE+"),pins AS ("+PINS+") SELECT jsonb_build_object('gate_pass',@SUCCESS@ AND value->>'state_sha256'=pins.state,'rollback_verified',value->>'state_sha256'=pins.state,'failed_checks',@FAILURE@::jsonb || CASE WHEN value->>'state_sha256' IS DISTINCT FROM pins.state THEN '[\"ROLLBACK_STATE_MISMATCH\"]'::jsonb ELSE '[]'::jsonb END,'manifest_sha256',pins.manifest,'approved_state_sha256',pins.state,'current_state_sha256',value->>'state_sha256','legacy_unchanged',value->>'preserved_rows_sha256'=pins.keep,'production_changes_committed',false) AS dryrun_result FROM current_state,pins"
dry=start+'DO $gate$\n'+declare+'''BEGIN
 IF EXISTS(SELECT 1 FROM pg_prepared_statements WHERE name='phase7b_dryrun_result') THEN DEALLOCATE phase7b_dryrun_result; END IF;
 BEGIN
'''+BODY+''' EXCEPTION WHEN OTHERS THEN failure:=SQLSTATE||': '||SQLERRM;
 END;
 EXECUTE 'PREPARE phase7b_dryrun_result AS '||replace(replace('''+q(final_dry)+''','@SUCCESS@',CASE WHEN failure IS NULL THEN 'true' ELSE 'false' END),'@FAILURE@',quote_literal(CASE WHEN failure IS NULL THEN '[]' ELSE jsonb_build_array(failure)::text END));
END;
$gate$;
ROLLBACK;
EXECUTE phase7b_dryrun_result;
'''
clear=lambda name: "DO $clear$ BEGIN IF EXISTS(SELECT 1 FROM pg_prepared_statements WHERE name='"+name+"') THEN EXECUTE 'DEALLOCATE "+name+"'; END IF; END; $clear$;\n"
(OUTPUT/'scripts/sql/dryrun_finance_phase7b_cleanup.sql').write_text(clear('phase7b_dryrun_result')+dry)
apply=start+'DO $gate$\n'+declare+'''BEGIN
 BEGIN
'''+BODY+''' EXCEPTION WHEN OTHERS THEN failure:=SQLSTATE||': '||SQLERRM;
 END;
 -- Failure rolls back the entire nested cleanup before constructing its result.
 EXECUTE 'PREPARE phase7b_apply_result AS SELECT '||quote_literal(jsonb_build_object('gate_pass',failure IS NULL,'cleanup_pass',failure IS NULL,
 'failed_checks',CASE WHEN failure IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(failure) END,
 'transaction_changes_committed',failure IS NULL,'approved_state_sha256',(SELECT state FROM pg_temp.p7b_pins),
 'legacy_shared_config_unchanged',failure IS NULL,'schema_security_unchanged',failure IS NULL,
 'manifest_sha256',(SELECT manifest FROM pg_temp.p7b_pins),'post_cleanup_state_sha256',CASE WHEN failure IS NULL THEN after_state->>'state_sha256' END)::text)||'::jsonb AS cleanup_result';
END;
$gate$;
COMMIT;
EXECUTE phase7b_apply_result;
'''
(OUTPUT/'scripts/sql/apply_finance_phase7b_cleanup.sql').write_text(clear('phase7b_apply_result')+apply)
verify=INTRO+'-- GATE 4 SELECT-only; exact kept-row/security/sequence hashes from approved Gate 1.\nWITH current_state AS ('+STATE+'),pins AS ('+PINS+'''),checks(code,ok) AS (
 SELECT 'approved_pins_present',state ~ '^[0-9a-f]{64}$' AND keep ~ '^[0-9a-f]{64}$' AND catalog ~ '^[0-9a-f]{64}$' AND sequences ~ '^[0-9a-f]{64}$' FROM pins UNION ALL
 SELECT 'dependency_checks',(value->>'gate_pass')::boolean FROM current_state UNION ALL
 SELECT 'legacy_shared_config_unchanged',value->>'preserved_rows_sha256'=pins.keep FROM current_state,pins UNION ALL
 SELECT 'schema_functions_security_unchanged',value->>'catalog_sha256'=pins.catalog FROM current_state,pins UNION ALL
 SELECT 'sequences_unchanged',value->>'sequences_sha256'=pins.sequences FROM current_state,pins UNION ALL
 SELECT 'all_uat_targets_and_finance_counters_empty',NOT EXISTS(SELECT 1 FROM current_state,jsonb_array_elements(value->'purge_counts') x WHERE (x->>'rows')::bigint<>0)
) SELECT jsonb_build_object('gate_pass',(SELECT bool_and(ok IS TRUE) FROM checks),
 'failed_checks',(SELECT coalesce(jsonb_agg(code ORDER BY code) FILTER(WHERE ok IS DISTINCT FROM true),'[]') FROM checks),
 'approved_state_sha256',pins.state,'manifest_sha256',pins.manifest,'historical_rows_unchanged',value->>'preserved_rows_sha256'=pins.keep,
 'legacy_keep',value->'legacy_keep','purge_counts',value->'purge_counts','preserved_rows_sha256',value->>'preserved_rows_sha256',
 'catalog_sha256',value->>'catalog_sha256','sequences_sha256',value->>'sequences_sha256',
 'production_mutation_performed',false,'broader_unresolved_differences',490) AS verifier_result FROM current_state,pins;
'''
(OUTPUT/'scripts/sql/verify_finance_phase7b_cleanup.sql').write_text(verify)
for file in ['preflight','dryrun','apply','verify']:
 f=OUTPUT/f'scripts/sql/{file}_finance_phase7b_cleanup.sql';b=f.read_bytes();print(f.name,len(b),'bytes',len(b.splitlines()),'lines')
print('manifest',manifest_sha,'full-table UAT targets',len(PURGE),'partial targets',len(PRED)-len(PURGE))
