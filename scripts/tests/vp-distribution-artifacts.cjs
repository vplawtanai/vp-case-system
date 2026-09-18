/* eslint-disable @typescript-eslint/no-require-imports */
// Reproducible local-only operator artifacts. Never connects to a database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { functionFacts } = require('./combined-document-workflow.cjs');
const { definition } = require('./tax-invoice-sql-artifacts.cjs');
const { catalogSql: moneyCatalogSql } = require('./money-allocation-artifacts.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const q = value => "'" + value.replaceAll("'", "''") + "'";
const migrationPath = 'supabase/migrations/202607180045_add_vp_revenue_distribution_foundation.sql';
const moneyMigrationPath = 'supabase/migrations/202607180044_add_payment_money_allocation_foundation.sql';
const tables = ['finance_vp_revenue_distributions', 'finance_vp_revenue_distribution_audit'];
const moneyTables = ['finance_payment_money_allocations', 'finance_payment_money_allocation_audit'];
const rpcNames = ['get_finance_vp_distribution', 'save_finance_vp_distribution', 'transition_finance_vp_distribution'];
const moneyRpcNames = ['get_finance_money_allocation', 'save_finance_money_allocation', 'transition_finance_money_allocation'];
const filenames = {
  pre: 'scripts/sql/preflight_vp_revenue_distribution.sql',
  verify: 'scripts/sql/verify_vp_revenue_distribution.sql',
  dry: 'scripts/sql/dry_run_vp_revenue_distribution.sql',
};
const catalogSql = `select c.relname as name,c.relkind as kind,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'validated',con.convalidated,'deferrable',con.condeferrable,'initially_deferred',con.condeferred) order by con.conname) from pg_constraint con where con.conrelid=c.oid and con.contype<>'n') as constraints,
 (select jsonb_agg(jsonb_build_object('name',i.relname,'definition',pg_get_indexdef(x.indexrelid),'valid',x.indisvalid,'ready',x.indisready) order by i.relname) from pg_index x join pg_class i on i.oid=x.indexrelid where x.indrelid=c.oid) as indexes,
 (select jsonb_agg(jsonb_build_object('name',p.policyname,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,'permissive',p.permissive) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
 from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${tables.map(q).join(',')}) order by c.relname`;

// Mutable data is compared with the pre-apply snapshot, never fixed legacy counts.
const upstream = [
  ...moneyTables, 'finance_payments', 'finance_payment_invoice_allocations',
  'finance_payment_effective_invoice_allocations', 'finance_payment_allocation_reallocations',
  'finance_payment_wht_components', 'finance_payment_audit_events', 'finance_invoices',
  'finance_invoice_items', 'finance_invoice_audit_events', 'finance_invoice_settlement_summary',
  'finance_cash_transactions', 'finance_account_opening_balances', 'finance_cash_transaction_audit_events',
  'finance_company_ledger', 'finance_compensation_batches', 'finance_compensation_allocations', 'finance_receipts',
  'finance_receipt_invoice_allocations', 'finance_receipt_audit_events', 'finance_tax_invoices',
  'finance_tax_invoice_items', 'finance_tax_point_events', 'finance_combined_documents',
  'finance_combined_document_audit_events', 'finance_tax_document_corrections',
  'finance_tax_correction_lines', 'finance_tax_correction_documents', 'finance_tax_correction_audit_events',
  'finance_document_counters',
];
const protectedSql = `select jsonb_build_object(${upstream.map(table =>
  `${q(table)},(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]')::text) from public.${table} r)`
).join(',\n')}) as evidence`;
const upstreamCritical = [
  'current_user_can_view_finance_payments', 'finance_document_invoice_lines', 'finance_vat_treatment',
  'confirm_finance_payment', 'reverse_finance_payment', 'correct_erroneous_finance_payment',
  'reallocate_finance_payment_allocation', 'issue_finance_tax_correction', 'assert_finance_payment_structured_wht',
  'void_finance_invoice', 'issue_finance_receipt', 'issue_finance_tax_invoice', 'issue_finance_combined_document',
];
const sourceGuardTypes = {
  finance_payments: 27,
  finance_invoices: 27,
  finance_invoice_items: 31,
  finance_payment_allocation_reallocations: 31,
  finance_payment_invoice_allocations: 31,
  finance_payment_wht_components: 31,
  finance_tax_document_corrections: 31,
  finance_payment_money_allocations: 31,
};
const sourceColumns = {
  finance_payments: { id: 'uuid', status: 'text', cash_amount: 'numeric', wht_amount: 'numeric', settlement_amount: 'numeric' },
  finance_invoices: { id: 'uuid', document_status: 'text', issued_snapshot_json: 'jsonb', amount_before_vat: 'numeric', vat_amount: 'numeric', total_amount: 'numeric' },
  finance_invoice_items: { id: 'uuid', invoice_id: 'uuid' },
  finance_payment_effective_invoice_allocations: { payment_id: 'uuid', invoice_id: 'uuid', effective_cash_allocated: 'numeric', effective_wht_credit_allocated: 'numeric', effective_settlement_total: 'numeric' },
  finance_payment_wht_components: { payment_id: 'uuid', invoice_id: 'uuid', invoice_item_id: 'uuid', basis_snapshot_json: 'jsonb', calculated_wht_amount: 'numeric' },
  finance_payment_money_allocations: { id: 'uuid', payment_id: 'uuid', status: 'text', version: 'integer', source_snapshot_json: 'jsonb', decisions_json: 'jsonb' },
  finance_payment_money_allocation_audit: { allocation_id: 'uuid', evidence_json: 'jsonb' },
  finance_tax_document_corrections: { original_tax_invoice_id: 'uuid', status: 'text', correction_mode: 'text' },
};
const domainFunction = alias => `(${alias}.proname ~ '^vp_distribution_' or ${alias}.proname='guard_vp_distribution_source' or ${alias}.proname in (${rpcNames.map(q).join(',')}))`;

function contractFacts(sql) {
  // The shared 044 helper deduplicates by name; 045 has two source overloads.
  return [...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(match => {
    const text = definition(sql.slice(match.index), match[1]);
    const fn = functionFacts(text)[0];
    const header = text.slice(0, /\bas\s+\$\w*\$/i.exec(text).index);
    const args = header.slice(header.indexOf('(') + 1, header.indexOf(')')).split(',').map(arg => arg.trim()).filter(Boolean);
    const returnType = /\breturns\s+(\w+)/i.exec(header)?.[1];
    const language = /\blanguage\s+(\w+)/i.exec(header)?.[1];
    assert.ok(['boolean', 'uuid', 'jsonb', 'trigger', 'void', 'numeric', 'text', 'timestamptz'].includes(returnType), `Unsupported return type for ${fn.name}`);
    assert.ok(['sql', 'plpgsql'].includes(language), `Unsupported language for ${fn.name}`);
    return { ...fn, returnType, language, argumentNames: args.map(arg => arg.split(/\s+/)[0]),
      defaultCount: args.filter(arg => /\bdefault\b|=/i.test(arg)).length,
      strict: /\bstrict\b|returns null on null input/i.test(header),
      parallel: /parallel safe/i.test(header) ? 's' : /parallel restricted/i.test(header) ? 'r' : 'u',
      leakproof: /\bleakproof\b/i.test(header) && !/not leakproof/i.test(header),
    };
  });
}

function priorFunctions() {
  const moneyFunctions = functionFacts(read(moneyMigrationPath));
  const required = new Set([...upstreamCritical, ...moneyFunctions.map(fn => fn.name)]);
  const prior = new Map();
  // Only the present 044 contract and its critical predecessors, not retired RPCs.
  for (const file of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(file =>
    /^2026071800\d{2}_/.test(file) && Number(file.slice(10, 12)) >= 1 && Number(file.slice(10, 12)) <= 44
  ).sort()) {
    const sql = read('supabase/migrations/' + file);
    for (const fn of functionFacts(sql).filter(fn => required.has(fn.name))) {
      prior.set(fn.name, contractFacts(definition(sql, fn.name))[0]);
    }
  }
  for (const name of required) assert.ok([...prior.values()].some(fn => fn.name === name), `Missing predecessor ${name}`);
  return [...prior.values()];
}

function functionCtes(functions) {
  return `expected_functions(signature,hash,security_definer,volatility,is_new,return_type,language,argument_names,default_count,is_strict,parallel,leakproof) as (values ${functions.map(fn =>
    `(${q(fn.signature)},${q(fn.hash)},${fn.securityDefiner},${q(fn.volatility)},${!!fn.isNew},${q(fn.returnType)},${q(fn.language)},${fn.argumentNames.length ? 'array[' + fn.argumentNames.map(q).join(',') + ']::text[]' : 'null::text[]'},${fn.defaultCount},${fn.strict},${q(fn.parallel)},${fn.leakproof})`
  ).join(',\n')}),
 function_facts as(select e.*,p.oid,md5(p.prosrc) as actual_hash,p.prosecdef,p.provolatile,p.proconfig,p.prokind,p.prorettype,p.proretset,l.lanname,p.proargnames,p.pronargdefaults,p.proisstrict,p.proparallel,p.proleakproof from expected_functions e left join pg_proc p on p.oid=to_regprocedure(e.signature) left join pg_language l on l.oid=p.prolang),
 function_differences as(select * from function_facts where oid is null or actual_hash is distinct from hash or prosecdef is distinct from security_definer or provolatile::text is distinct from volatility or prokind<>'f' or proconfig is distinct from array['search_path=public']
 or prorettype is distinct from to_regtype(return_type) or proretset or lanname is distinct from language or proargnames is distinct from argument_names or pronargdefaults is distinct from default_count or proisstrict is distinct from is_strict or proparallel::text is distinct from parallel or proleakproof is distinct from leakproof)`;
}

function guardsFromMigration(sql, functionName, expectedTypes, includeTruncate = false) {
  const guards = [...sql.matchAll(new RegExp(
    `create\\s+trigger\\s+(\\w+)\\s+before\\s+([a-z\\s]+?)\\s+on\\s+public\\.(\\w+)\\s+for\\s+each\\s+(row|statement)\\s+execute\\s+function\\s+public\\.${functionName}\\(\\);`, 'gi'
  ))].map(([, name, events, table, level]) => {
    const type = events.trim().toLowerCase().split(/\s+or\s+/).reduce((value, event) => {
      assert.ok(['insert', 'update', 'delete', 'truncate'].includes(event), event);
      return value | ({ insert: 4, delete: 8, update: 16, truncate: 32 })[event];
    }, level === 'row' ? 3 : 2);
    assert.ok(expectedTypes[table], `Unexpected source table ${table}`);
    assert.equal(type, level === 'row' ? expectedTypes[table] : includeTruncate ? 34 : null, `Unexpected source guard events on ${table}`);
    return { name, table, type };
  });
  assert.deepEqual(guards.filter(guard => guard.type & 1).map(guard => guard.table).sort(), Object.keys(expectedTypes).sort(), `${functionName} row source tables`);
  assert.deepEqual(guards.filter(guard => !(guard.type & 1)).map(guard => guard.table).sort(), includeTruncate ? Object.keys(expectedTypes).sort() : [], `${functionName} truncate source tables`);
  return guards;
}

function guardCtes(prefix, guards, functionName) {
  return `${prefix}_expected_guards(table_name,trigger_name,trigger_type) as (values ${guards.map(guard =>
    `(${q(guard.table)},${q(guard.name)},${guard.type})`
  ).join(',\n')}),
 ${prefix}_actual_guards as(select n.nspname as schema_name,c.relname as table_name,t.tgname as trigger_name,t.tgtype as trigger_type,
 t.tgenabled,t.tgfoid,t.tgisinternal,t.tgdeferrable,t.tginitdeferred,t.tgnargs,t.tgattr::text as columns,t.tgqual,pg_get_triggerdef(t.oid) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where t.tgfoid=to_regprocedure(${q('public.' + functionName + '()')}) or (n.nspname='public' and t.tgname in (${guards.map(guard => q(guard.name)).join(',')}))),
 ${prefix}_guard_differences as(select e.table_name as expected_table,e.trigger_name as expected_name,e.trigger_type as expected_type,to_jsonb(a) as actual
 from ${prefix}_expected_guards e full join ${prefix}_actual_guards a on a.schema_name='public' and a.table_name=e.table_name and a.trigger_name=e.trigger_name
 where e.table_name is null or a.table_name is null or a.trigger_type is distinct from e.trigger_type or a.tgenabled<>'O'
 or a.tgfoid is distinct from to_regprocedure(${q('public.' + functionName + '()')}) or a.tgisinternal or a.tgdeferrable or a.tginitdeferred or a.tgnargs<>0 or a.columns<>'' or a.tgqual is not null)`;
}

function functionPrivileges(functions, rpcs) {
  return functions.map(fn => `(coalesce(has_function_privilege('authenticated',to_regprocedure(${q(fn.signature)}),'EXECUTE'),false)=${rpcs.includes(fn.name)}
 and not coalesce(has_function_privilege('authenticated',to_regprocedure(${q(fn.signature)}),'EXECUTE WITH GRANT OPTION'),false)
 and not coalesce(has_function_privilege('anon',to_regprocedure(${q(fn.signature)}),'EXECUTE'),false)
 and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=to_regprocedure(${q(fn.signature)}) and acl.grantee=0 and acl.privilege_type='EXECUTE'))`).join(' and\n');
}

function tablePrivileges(names) {
  return `(select count(*)=${names.length} and bool_and(relrowsecurity and relkind='r'
 and has_table_privilege('authenticated',oid,'SELECT') and not has_table_privilege('authenticated',oid,'SELECT WITH GRANT OPTION')
 and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('authenticated',oid,'INSERT,UPDATE,REFERENCES')
 and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')
 and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) acl where acl.grantee=0))
 from pg_class where relnamespace='public'::regnamespace and relname in (${names.map(q).join(',')}))`;
}

function workflow() {
  const sql = read(migrationPath);
  const funcs = contractFacts(sql).map(fn => ({ ...fn, isNew: true }));
  assert.ok(funcs.length > 3, 'Expected private distribution helpers');
  assert.deepEqual(funcs.filter(fn => rpcNames.includes(fn.name)).map(fn => fn.name).sort(), [...rpcNames].sort());
  for (const fn of funcs) assert.ok(rpcNames.includes(fn.name) || fn.name.startsWith('vp_distribution_') || fn.name === 'guard_vp_distribution_source', `Unexpected 045 function ${fn.name}`);
  const prior = priorFunctions();
  assert.ok(funcs.every(fn => !prior.some(old => old.signature === fn.signature)), '045 must not replace predecessor functions');
  const sourceGuards = guardsFromMigration(sql, 'guard_vp_distribution_source', sourceGuardTypes, true);
  const moneyGuards = guardsFromMigration(read(moneyMigrationPath), 'guard_money_allocation_source',
    { ...Object.fromEntries(Object.entries(sourceGuardTypes).filter(([table]) => !moneyTables.includes(table))),
      finance_payment_allocation_reallocations: 7, finance_tax_document_corrections: 23 });
  const moneyManifest = read('scripts/tests/money-allocation-catalog.json');
  // Only the separately verified 045 row/TRUNCATE source guards are additions.
  const preservedMoneyCatalogSql = moneyCatalogSql.replace('and not t.tgisinternal)',
    "and not t.tgisinternal and t.tgfoid is distinct from to_regprocedure('public.guard_vp_distribution_source()'))");
  assert.notEqual(preservedMoneyCatalogSql, moneyCatalogSql);
  const common = `protected as(${protectedSql}),
 expected_money_catalog as(select value from jsonb_array_elements(${q(moneyManifest)}::jsonb)),actual_money_catalog as(${preservedMoneyCatalogSql}),
 money_catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_money_catalog e full join actual_money_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 ${guardCtes('money', moneyGuards, 'guard_money_allocation_source')},
 source_contracts(table_name,kind) as(values ${upstream.map(table => `(${q(table)},${q(['finance_payment_effective_invoice_allocations', 'finance_invoice_settlement_summary'].includes(table) ? 'v' : 'r')})`).join(',')}),
 source_columns(table_name,column_name,data_type) as(values ${Object.entries(sourceColumns).flatMap(([table, columns]) => Object.entries(columns).map(([column, type]) => `(${q(table)},${q(column)},${q(type)})`)).join(',')}),
 source_contract_differences as(select s.table_name,null::text as column_name from source_contracts s left join pg_class c on c.oid=to_regclass('public.'||s.table_name) where c.oid is null or c.relkind::text<>s.kind
 union all select s.table_name,s.column_name from source_columns s left join pg_attribute a on a.attrelid=to_regclass('public.'||s.table_name) and a.attname=s.column_name and a.attnum>0 and not a.attisdropped where a.attname is null or a.atttypid is distinct from to_regtype(s.data_type))`;
  const commonChecks = `('predecessor_functions_exact',not exists(select 1 from function_differences where not is_new)),
 ('044_catalog_preserved',not exists(select 1 from money_catalog_differences)),
 ('044_source_guards_preserved',not exists(select 1 from money_guard_differences)),
 ('044_privileges_preserved',${functionPrivileges(prior.filter(fn => fn.name.startsWith('money_allocation_') || fn.name === 'guard_money_allocation_source' || fn.name === 'validate_money_allocation' || moneyRpcNames.includes(fn.name)), moneyRpcNames)} and ${tablePrivileges(moneyTables)}),
 ('source_contracts_present',not exists(select 1 from source_contract_differences)),
 ('no_opening_cutover',not exists(select 1 from public.finance_account_opening_balances))`;
  const summary = flag => `select (select jsonb_object_agg(name,passed is true order by name) from checks) as checks,
 (select coalesce(jsonb_agg(name order by name) filter(where passed is distinct from true),'[]') from checks) as failed_checks,
 (select bool_and(passed is true) from checks) as ${flag},
 (select coalesce(jsonb_agg(to_jsonb(f) order by signature),'[]') from function_differences f) as function_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from money_catalog_differences d) as money_catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from money_guard_differences d) as money_guard_differences,
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name,column_name),'[]') from source_contract_differences d) as missing_source_contracts,
 (select evidence from protected) as upstream_evidence_hashes,
 current_setting('server_version_num')::integer as catalog_server_version_num`;
  const header = '-- ONE SELECT-only statement / ONE result row. No application RPC calls.\n'
    + '-- Stop on failed_checks. Compare every upstream_evidence_hashes entry before and after apply, including both 044 tables.\n'
    + '-- Legacy row counts are not readiness gates; only opening cutover must be absent.\n';
  const pre = header + `with ${functionCtes(prior)},${common},
 competing_relations as(select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)'),
 competing_functions as(select p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and ${domainFunction('p')}),
 competing_types as(select t.typname from pg_type t where t.typnamespace='public'::regnamespace and t.typname ~ '^_?(finance_vp_revenue_distribution|vp_distribution_)'),
 competing_triggers as(select c.relname as table_name,t.tgname as trigger_name from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and t.tgname ~ '^vp_distribution_'),
 checks(name,passed) as(values
 ('045_objects_unused',not exists(select 1 from competing_relations) and not exists(select 1 from competing_functions) and not exists(select 1 from competing_types) and not exists(select 1 from competing_triggers)),
 ${commonChecks})
 ${summary('vp_revenue_distribution_preflight_pass')},
 (select coalesce(jsonb_agg(relname order by relname),'[]') from competing_relations) as competing_relations,
 (select coalesce(jsonb_agg(signature order by signature),'[]') from competing_functions) as competing_functions,
 (select coalesce(jsonb_agg(typname order by typname),'[]') from competing_types) as competing_types,
 (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from competing_triggers t) as competing_triggers;
`;
  const files = { [filenames.pre]: pre };
  const manifestPath = path.join(__dirname, 'vp-distribution-catalog.json');
  if (!fs.existsSync(manifestPath)) return files;
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const catalog = JSON.parse(manifest);
  assert.deepEqual(catalog.map(table => table.name).sort(), [...tables].sort(), '045 catalog must contain exactly two new tables');
  const domainRelations = catalog.flatMap(table => [{ name: table.name, kind: 'r' }, ...table.indexes.map(index => ({ name: index.name, kind: 'i' }))]);
  const verify = header + `with ${functionCtes([...prior, ...funcs])},${common},
  expected_catalog as(select value from jsonb_array_elements(${q(manifest)}::jsonb)),actual_catalog as(${catalogSql}),
  catalog_differences as(select coalesce(e.value->>'name',a.name) as table_name,e.value as expected,to_jsonb(a) as actual from expected_catalog e full join actual_catalog a on a.name=e.value->>'name' where e.value is distinct from to_jsonb(a)),
 expected_domain_relations(name,kind) as(values ${domainRelations.map(relation => `(${q(relation.name)},${q(relation.kind)})`).join(',')}),
 actual_domain_relations as(select c.relname as name,c.relkind::text as kind from pg_class c where c.relnamespace='public'::regnamespace and (c.relname ~ '^(finance_vp_revenue_distribution|vp_distribution_)' or c.relname in(select name from expected_domain_relations))),
 relation_inventory_differences as(select e.name as expected_name,e.kind as expected_kind,a.name as actual_name,a.kind as actual_kind from expected_domain_relations e full join actual_domain_relations a on a.name=e.name where e.name is null or a.name is null or a.kind is distinct from e.kind),
 actual_domain_functions as(select p.oid,p.oid::regprocedure::text as signature from pg_proc p where p.pronamespace='public'::regnamespace and ${domainFunction('p')}),
 function_inventory_differences as(select e.signature as expected_signature,a.signature as actual_signature from (select * from expected_functions where is_new) e full join actual_domain_functions a on a.oid=to_regprocedure(e.signature) where e.signature is null or a.oid is null),
 ${guardCtes('distribution', sourceGuards, 'guard_vp_distribution_source')},
 checks(name,passed) as(values
 ${commonChecks},
 ('exact_new_catalog',not exists(select 1 from catalog_differences)),
 ('exact_new_relation_inventory',not exists(select 1 from relation_inventory_differences)),
 ('exact_new_and_preserved_functions',not exists(select 1 from function_differences)),
 ('exact_new_function_inventory',not exists(select 1 from function_inventory_differences)),
 ('zero_state',${tables.map(table => `not exists(select 1 from public.${table})`).join(' and ')}),
 ('source_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where (trigger_type & 1)=1)),
 ('source_truncate_guards',not exists(select 1 from distribution_guard_differences) and (select count(*)=8 from distribution_actual_guards where trigger_type=34)),
 ('private_and_rpc_privileges',${functionPrivileges(funcs, rpcNames)}),
 ('only_three_authenticated_rpcs',(select count(*)=3 and bool_and(p.proname in (${rpcNames.map(q).join(',')})) from actual_domain_functions a join pg_proc p on p.oid=a.oid where has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 ('no_anon_execute',not exists(select 1 from actual_domain_functions where has_function_privilege('anon',oid,'EXECUTE'))),
 ('browser_mutation_blocked',${tablePrivileges(tables)}),
 ('explicit_read_policies',(select count(*)=2 and count(distinct tablename)=2 and bool_and(cmd='SELECT' and roles=array['authenticated']::name[] and qual='current_user_can_view_finance_payments()' and with_check is null and permissive='PERMISSIVE') from pg_policies where schemaname='public' and tablename in (${tables.map(q).join(',')}))),
 ('dry_run_upstream_unchanged',nullif(current_setting('vp.distribution045_before',true),'') is null or current_setting('vp.distribution045_before',true)=(select evidence::text from protected)))
 ${summary('vp_revenue_distribution_foundation_verification_pass')},
 (select coalesce(jsonb_agg(to_jsonb(d) order by table_name),'[]') from catalog_differences d) as catalog_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from relation_inventory_differences d) as relation_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from function_inventory_differences d) as function_inventory_differences,
 (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from distribution_guard_differences d) as source_guard_differences,
 nullif(current_setting('vp.distribution045_before',true),'') is not null as dry_run_baseline_present,
 jsonb_build_object(${tables.map(table => `${q(table)},(select count(*) from public.${table})`).join(',')}) as new_rows;
`;
  return {
    ...files,
    [filenames.verify]: verify,
    [filenames.dry]: 'BEGIN;\n-- ROLLBACK only. No business RPCs or UAT row creation. Run the SELECT-only preflight first.\n'
      + `select set_config('vp.distribution045_before',evidence::text,true) from (${protectedSql}) p;\n`
      + `-- BEGIN EMBEDDED MIGRATION 045\n${sql}-- END EMBEDDED MIGRATION 045\n`
      + `-- BEGIN EMBEDDED VP DISTRIBUTION VERIFIER\n${verify}-- END EMBEDDED VP DISTRIBUTION VERIFIER\nROLLBACK;\n`,
  };
}

module.exports = { workflow, catalogSql, migrationPath, filenames, contractFacts, functionCtes, functionPrivileges };
if (require.main === module) {
  const artifacts = workflow();
  for (const [file, content] of Object.entries(artifacts)) {
    if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, file), content);
    else assert.equal(read(file), content, file);
  }
  console.log(`045 operator artifacts ${process.argv.includes('--write') ? 'generated' : 'verified'} (${Object.keys(artifacts).length}/3; local files only)`);
}
