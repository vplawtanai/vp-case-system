/* eslint-disable @typescript-eslint/no-require-imports */
// Deterministic predecessor extensions. This emits reviewed files, never executes SQL.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { definition } = require('./tax-invoice-sql-artifacts.cjs');
const root = path.resolve(__dirname, '../..');
const migrationPath = 'supabase/migrations/202607180040_add_combined_receipt_tax_invoice.sql';
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const predecessor = n => read('supabase/migrations/' + fs.readdirSync(path.join(root, 'supabase/migrations')).find(f => f.startsWith('2026071800' + n + '_')));
function replace(text, from, to) { assert.ok(text.includes(from), from); return text.replace(from, to); }
function renamed(fn, from, to) { return replace(fn, 'function public.' + from + '(', 'function public.' + to + '('); }
function override(fn) { return fn.replace(/^create (?:or replace )?function/, 'create or replace function'); }
function integration() {
  const receipt = predecessor('37'), tax = predecessor('39'), semantics = predecessor('35'), charge = predecessor('34');
  const out = [];
  let allocator = definition(tax, 'generate_finance_document_no');
  allocator = replace(allocator, "if v_input_type = 'tax_invoice' then", "if v_input_type = 'receipt_tax_invoice' then\n    if not public.current_user_can_issue_combined_documents() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;\n  elsif v_input_type = 'tax_invoice' then");
  allocator = replace(allocator, "('fee_agreement', 'invoice', 'receipt', 'tax_invoice')", "('fee_agreement', 'invoice', 'receipt', 'tax_invoice', 'receipt_tax_invoice')");
  allocator = replace(allocator, 'v_counter_type := v_input_type;', "if v_input_type='receipt_tax_invoice' and (v_prefix_code<>'VP-RTI' or v_period_scope<>'monthly' or v_width<>6) then raise exception 'DOCUMENT_NUMBERING_PROFILE_INVALID'; end if;\n    v_counter_type := v_input_type;");
  allocator = replace(allocator, "in ('receipt','tax_invoice')", "in ('receipt','tax_invoice','receipt_tax_invoice')");
  out.push(allocator);
  const functions = [
    [receipt, 'create_finance_receipt_draft_from_payment', 'receipt_create_pre040', 'uuid,boolean'],
    [receipt, 'issue_finance_receipt', 'receipt_issue_pre040', 'uuid,boolean,jsonb'],
    [receipt, 'refresh_finance_receipt_draft', 'receipt_refresh_pre040', 'uuid'],
    [receipt, 'cancel_finance_receipt_draft', 'receipt_cancel_pre040', 'uuid,text'],
    [tax, 'save_finance_tax_invoice_draft', 'tax_save_pre040', 'uuid,date,jsonb,timestamptz'],
    [tax, 'refresh_finance_tax_invoice_draft', 'tax_refresh_pre040', 'uuid,timestamptz'],
    [tax, 'issue_finance_tax_invoice', 'tax_issue_pre040', 'uuid,jsonb,boolean,boolean'],
    [tax, 'cancel_finance_tax_invoice_draft', 'tax_cancel_pre040', 'uuid,text'],
    [tax, 'finance_tax_invoice_draft_snapshot', 'tax_snapshot_pre040', 'jsonb,jsonb,date'],
    [tax, 'finance_tax_invoice_issue_blockers', 'tax_blockers_pre040', 'jsonb'],
  ];
  for (const [source, name, backup, args] of functions) {
    out.push(renamed(definition(source, name), name, backup));
    out.push(`revoke all on function public.${backup}(${args}) from public,anon,authenticated;`);
  }
  out.push(`create or replace function public.build_finance_tax_invoice_source(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $source$
begin return public.build_finance_document_tax_source(p_payment_id); end;
$source$;`);
  let receiptCreate = override(definition(receipt, 'create_finance_receipt_draft_from_payment'));
  receiptCreate = replace(receiptCreate, "if p_external_receipt_checked is distinct from true", "perform public.assert_finance_document_route(p_payment_id,'receipt');\n  if p_external_receipt_checked is distinct from true");
  out.push(receiptCreate);
  let receiptIssue = override(definition(receipt, 'issue_finance_receipt'));
  receiptIssue = replace(receiptIssue, "if v_receipt.status <> 'draft'", "if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;\n  perform public.assert_finance_document_route(v_payment_id,'receipt');\n  if v_receipt.status <> 'draft'");
  out.push(receiptIssue);
  let taxCreate = override(definition(tax, 'create_finance_tax_invoice_draft'));
  const start = taxCreate.indexOf('  source:=public.build_finance_tax_invoice_source');
  taxCreate = taxCreate.slice(0, start) + "  perform public.assert_finance_document_route(p_payment_id,'tax_invoice');\n  return public.prepare_finance_document_tax_draft(p_payment_id);\nend;\n$create_draft$;";
  out.push(taxCreate);
  let taxIssue = override(definition(tax, 'issue_finance_tax_invoice'));
  taxIssue = replace(taxIssue, "if t.status<>'draft'", "if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;\n  perform public.assert_finance_document_route(pid,'tax_invoice');\n  if t.status<>'draft'");
  out.push(taxIssue);
  for (const name of ['save_finance_tax_invoice_draft','refresh_finance_tax_invoice_draft','cancel_finance_tax_invoice_draft']) {
    let fn = override(definition(tax, name));
    fn = replace(fn, 'select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;', "select * into t from public.finance_tax_invoices where id=p_tax_invoice_id for update;\n  if t.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;");
    out.push(fn);
  }
  for (const name of ['refresh_finance_receipt_draft','cancel_finance_receipt_draft','void_finance_receipt']) {
    let fn = override(definition(receipt, name));
    fn = replace(fn, 'select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;', "select * into v_receipt from public.finance_receipts where id = p_receipt_id for update;\n  if v_receipt.combined_document_id is not null then raise exception 'DOCUMENT_USE_COMBINED_WORKFLOW'; end if;");
    out.push(fn);
  }
  let integrity = override(definition(tax, 'validate_finance_tax_invoice_integrity'));
  integrity = replace(integrity, "item:=t.source_snapshot_json->'invoice_item';", "if t.source_snapshot_json->>'schema_version'='2' then\n    perform public.validate_finance_document_tax_integrity(t.id); return new;\n  end if;\n  item:=t.source_snapshot_json->'invoice_item';");
  out.push(integrity);
  let modes = definition(semantics, 'apply_finance_quotation_draft_item_tax_modes');
  modes = replace(modes, 'unit = btrim', "vat_treatment_json = public.finance_vat_treatment(p->'vat_treatment_json',coalesce(p->>'price_tax_mode',qi.price_tax_mode)<>'non_vat',coalesce((p->>'vat_rate')::numeric,qi.vat_rate)),\n    unit = btrim");
  out.push(modes);
  let create = definition(semantics, 'create_finance_quotation_draft_atomic_v3');
  create = replace(create, "'vat_rate', source.item->>'vat_rate'", "'vat_treatment_json',source.item->'vat_treatment_json','vat_rate', source.item->>'vat_rate'");
  out.push(create);
  let freeze = definition(semantics, 'freeze_finance_quotation_commercial_terms_v2');
  freeze = replace(freeze, "'quotation_item_id',i.id,", "'vat_treatment_json',i.vat_treatment_json,'quotation_item_id',i.id,");
  freeze = replace(freeze, "'quotation_item_id',ai.quotation_item_id,", "'vat_treatment_json',qi.vat_treatment_json,'quotation_item_id',ai.quotation_item_id,");
  out.push(freeze);
  let chargeSave = definition(charge, 'save_finance_billable_charge_draft');
  chargeSave = replace(chargeSave, 'source_snapshot_json = v_source_snapshot,', "source_snapshot_json = v_source_snapshot,\n    vat_treatment_json = public.finance_vat_treatment(v_source_snapshot->'vat_treatment_json',v_price_tax_mode<>'non_vat',p_vat_rate),");
  out.push(chargeSave);
  let chargeReady = definition(charge, 'mark_finance_billable_charge_ready');
  chargeReady = replace(chargeReady, "'tax', jsonb_build_object(", "'vat_treatment_json',v_charge.vat_treatment_json,\n    'tax', jsonb_build_object(");
  out.push(chargeReady);
  return out.join('\n\n') + '\n';
}
function artifacts() {
  const current = read(migrationPath), start = '-- BEGIN GENERATED PREDECESSOR INTEGRATION\n', end = '-- END GENERATED PREDECESSOR INTEGRATION';
  let sql = current.slice(0, current.indexOf(start) + start.length) + integration() + current.slice(current.indexOf(end));
  const names = [...new Set([...sql.matchAll(/create (?:or replace )?function public\.(\w+)\(/g)].map(m=>m[1]))];
  const exposed = new Set(['current_user_can_manage_combined_documents','current_user_can_view_combined_documents','current_user_can_issue_combined_documents',
    'get_finance_document_decision','finance_invoice_document_readiness','create_finance_combined_document_draft','save_finance_combined_document_draft',
    'refresh_finance_combined_document_draft','cancel_finance_combined_document_draft','issue_finance_combined_document',
    'create_finance_receipt_draft_from_payment','issue_finance_receipt','refresh_finance_receipt_draft','cancel_finance_receipt_draft','void_finance_receipt',
    'create_finance_tax_invoice_draft','save_finance_tax_invoice_draft','refresh_finance_tax_invoice_draft','issue_finance_tax_invoice','cancel_finance_tax_invoice_draft','get_finance_tax_invoice_eligibility',
    'apply_finance_quotation_draft_item_tax_modes','create_finance_quotation_draft_atomic_v3','save_finance_billable_charge_draft','mark_finance_billable_charge_ready']);
  const grants = names.map(name=>{
    const fn=definition(sql,name),args=fn.slice(fn.indexOf('(')+1,fn.indexOf(')')).split(',').map(s=>s.trim().split(/\s+/)[1]).filter(Boolean).join(',');
    return `revoke all on function public.${name}(${args}) from public,anon,authenticated;`+(exposed.has(name)?`\ngrant execute on function public.${name}(${args}) to authenticated;`:'');
  }).join('\n')+'\n';
  const gs='-- BEGIN GENERATED PRIVILEGES\n', ge='-- END GENERATED PRIVILEGES';
  sql=sql.slice(0,sql.indexOf(gs)+gs.length)+grants+sql.slice(sql.indexOf(ge));
  return { [migrationPath]: sql, ...require('./combined-document-workflow.cjs').workflow(sql) };
}
module.exports = { artifacts, integration, root, migrationPath };
if (require.main === module) {
  if (process.argv.includes('--check')) { for (const [p, sql] of Object.entries(artifacts())) assert.equal(read(p), sql, p); console.log('PASS exact predecessor integration'); }
  else console.log(JSON.stringify(artifacts()));
}
