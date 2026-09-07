/* eslint-disable @typescript-eslint/no-require-imports */
// PGLITE_MODULE_PATH=/private/tmp/vp-wht-sql/node_modules/@electric-sql/pglite node --test scripts/tests/receipt-foundation.test.cjs
// In-memory PostgreSQL only. No Supabase client, network, credentials, or persistent database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { after, afterEach, before, beforeEach, test } = require('node:test');

let PGlite;
try {
  ({ PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite'));
} catch (error) {
  throw new Error('PGlite is required. Set PGLITE_MODULE_PATH to an existing local @electric-sql/pglite installation; this test never installs dependencies.', { cause: error });
}

const root = path.resolve(__dirname, '../..');
const migrations = path.join(root, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrations);
function migration(number) {
  const prefix = `2026071800${number}_`;
  const matches = migrationFiles.filter((name) => name.startsWith(prefix));
  assert.equal(matches.length, 1, `Exactly one migration ${number} must exist`);
  return fs.readFileSync(path.join(migrations, matches[0]), 'utf8');
}

// Extract complete, unchanged definitions from the checked-in predecessor SQL.
// Receipt migration 037 itself is always applied in full, without rewriting it.
function sqlFunction(sql, name) {
  const match = new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'i').exec(sql);
  assert.ok(match, `Missing SQL function ${name}`);
  const definition = sql.slice(match.index);
  const body = /\bas\s+(\$[\w]*\$)/i.exec(definition);
  assert.ok(body, `Missing dollar-quoted body for ${name}`);
  const end = definition.indexOf(`${body[1]};`, body.index + body[0].length);
  assert.ok(end >= 0, `Unterminated SQL function ${name}`);
  return definition.slice(0, end + body[1].length + 1);
}

function between(sql, start, end) {
  const from = sql.indexOf(start);
  const to = sql.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing SQL block: ${start}`);
  return sql.slice(from, to);
}

function sqlView(sql, name) {
  const match = new RegExp(`create (?:or replace )?view public\\.${name}\\b`, 'i').exec(sql);
  assert.ok(match, `Missing SQL view ${name}`);
  return sql.slice(match.index, sql.indexOf(';', match.index) + 1);
}

const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  staff: '10000000-0000-4000-8000-000000000002',
  client: '10000000-0000-4000-8000-000000000003',
  bank: '10000000-0000-4000-8000-000000000004',
};
const receivedOn = '2026-07-01';
const frozenCustomer = { name: 'Synthetic Invoice Customer', tax_id: '0000000000002', address: '2 Fixture Road', branch: 'Head Office' };
const db = new PGlite();
let preflightResult;
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const scalar = async (sql, params = []) => Object.values((await query(sql, params))[0])[0];
const flush = () => db.exec('set constraints all immediate; set constraints all deferred');
const row = (id) => scalar('select to_jsonb(r) from finance_receipts r where id=$1', [id]);
const count = (table) => scalar(`select count(*)::integer from public.${table}`);

async function asActor(id, callback) {
  const prior = await scalar("select current_setting('test.actor',true)");
  await query("select set_config('test.actor',$1,true)", [id || '']);
  await db.exec('set local role authenticated');
  try { return await callback(); }
  finally {
    await db.exec('reset role');
    await query("select set_config('test.actor',$1,true)", [prior || '']);
  }
}

async function rejects(sql, params, expected) {
  await db.exec('savepoint expected_failure');
  try {
    await assert.rejects(async () => {
      await query(sql, params);
      await flush();
    }, expected);
  } finally {
    await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
  }
}

async function rpc(name, args) {
  const id = await scalar(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args);
  assert.match(id, /^[0-9a-f-]{36}$/, `${name} must return a UUID`);
  await flush();
  return id;
}
const createReceipt = (payment) => rpc('create_finance_receipt_draft_from_payment', [payment, true]);
const issueReceipt = async (receipt) => rpc('issue_finance_receipt', [receipt, true, (await row(receipt)).draft_snapshot_json]);
const voidReceipt = (receipt) => rpc('void_finance_receipt', [receipt, 'Synthetic void reason', true]);
const cancelReceipt = (receipt) => rpc('cancel_finance_receipt_draft', [receipt, 'Synthetic cancellation reason']);

async function fixture() {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor',true),'')::uuid
    $$;
    grant usage on schema public,auth to authenticated,anon;
    create table user_profiles (
      id uuid primary key, active boolean not null default true, role text not null default 'staff',
      email text, full_name text, staff_name text,
      can_manage_finance_payments boolean default false, can_confirm_finance_payments boolean default false,
      can_reverse_finance_payments boolean default false, can_reallocate_finance_payments boolean default false,
      can_reverse_finance_cash_transactions boolean default false
    );
    insert into user_profiles(id,role,email,full_name) values
      ('${ids.admin}','admin','admin@fixture.invalid','Fixture Admin'),
      ('${ids.staff}','staff','staff@fixture.invalid','Fixture Staff');
    select set_config('test.actor','${ids.admin}',false);
    create table clients(id uuid primary key,name text,tax_id text,billing_address text);
    insert into clients values('${ids.client}','Mutable Client Master','0000000000002','Mutable Address');
    create table finance_company_profiles (
      id text primary key,company_name_th text,company_name_en text,tax_id text,address_th text,address_en text,
      branch_th text,branch_en text,branch_label text,phone text,email text,website text,quotation_prefix text
    );
    insert into finance_company_profiles(id,company_name_th,company_name_en,tax_id,address_th,address_en,branch_en)
      values('default','Synthetic Seller','Synthetic Seller Ltd','0000000000001','1 Fixture Road','1 Fixture Road','Head Office');
    create table finance_bank_accounts (
      id uuid primary key,short_name text,bank_name text,account_name text,account_number text,branch_name text,is_active boolean
    );
    insert into finance_bank_accounts values('${ids.bank}','FIX','Fixture Bank','Synthetic Seller','000-000-0000','Head Office',true);
    create table finance_invoices (
      id uuid primary key,invoice_no text,document_status text default 'issued',client_id uuid references clients(id),
      currency text default 'THB',total_amount numeric(14,2),issued_snapshot_json jsonb,
      case_id uuid,advisory_matter_id uuid,issue_date date,due_date date,
      source_model text default 'billable_charge_v2',v2_bridge_id uuid,
      voided_at timestamptz,voided_by_user_id uuid,void_reason text,updated_at timestamptz,updated_by_user_id uuid,
      issued_at timestamptz,cancelled_at timestamptz,amount_before_vat numeric(14,2),vat_amount numeric(14,2)
    );
    create table finance_invoice_items(id uuid primary key,invoice_id uuid,source_state text);
    create table finance_invoice_charge_allocations (
      id uuid primary key,invoice_id uuid,billable_charge_id uuid,status text,released_at timestamptz,
      released_by_user_id uuid,release_reason text
    );
    create table finance_billable_charges(id uuid primary key,status text,updated_at timestamptz,updated_by_user_id uuid);
    create table finance_billing_installment_charge_bridges(id uuid primary key,billing_plan_id uuid,billing_installment_id uuid);
    create table finance_billing_plans(id uuid primary key,status text,updated_at timestamptz,updated_by_user_id uuid);
    create table finance_billing_installments (
      id uuid primary key,status text,invoiced_at timestamptz,updated_at timestamptz,updated_by_user_id uuid
    );
    create table finance_invoice_audit_events (
      id uuid primary key default gen_random_uuid(),invoice_id uuid,event_type text,event_payload_json jsonb,actor_user_id uuid
    );
    create table finance_company_ledger(id uuid primary key,source_payment_id uuid,source_invoice_id uuid);
    create table finance_compensation_batches(id uuid primary key,source_payment_id uuid,source_invoice_id uuid);
    create table finance_revenue_allocations(id uuid primary key,source_payment_id uuid,source_invoice_id uuid);
    create function current_user_can_manage_finance_quotations() returns boolean language sql security definer set search_path=public as $$
      select exists(select 1 from user_profiles where id=auth.uid() and active and role='admin')
    $$;
    create function current_user_can_manage_finance_billable_charges() returns boolean language sql as $$
      select public.current_user_can_manage_finance_quotations()
    $$;
    -- Invoice composition is outside this fixture. Keep a non-noop boundary check;
    -- actual Payment validators, source snapshot reader, and Void RPC run below.
    create function validate_finance_invoice_integrity(uuid) returns void language plpgsql as $$
      begin
        if not exists(select 1 from finance_invoices where id=$1 and total_amount>0 and issued_snapshot_json is not null)
        then raise exception 'Synthetic Invoice integrity invalid'; end if;
      end
    $$;
    create table finance_document_counters (
      doc_type text,year integer,month integer,prefix text primary key,last_no integer,updated_at timestamptz default now()
    );
    create unique index finance_document_counter_period on finance_document_counters(doc_type,year,(coalesce(month,0)));
  `);
  const m21 = migration('21');
  const m22 = migration('22');
  const m25 = migration('25');
  const m27 = migration('27');
  const m28 = migration('28');
  const m29 = migration('29');
  const numbering = fs.readFileSync(path.join(migrations, '202607170001_document_platform_fee_agreement_foundation.sql'), 'utf8');
  await db.exec(between(numbering, 'create table if not exists public.document_numbering_profiles', 'create table if not exists public.document_templates'));
  await db.exec(between(m21, 'create table public.finance_payments (', 'create index '));
  await db.exec('alter table finance_payments add column draft_origin_invoice_id uuid');
  await db.exec(between(m25, 'create table public.finance_cash_transactions (', 'create or replace function public.protect_finance_cash_permission_fields'));
  await db.exec(between(m29, 'create table public.finance_payment_allocation_reallocations (', 'create or replace function public.validate_finance_payment_effective_allocations'));
  await db.exec(sqlView(m29, 'finance_invoice_settlement_summary'));
  const definitions = [
    [m21, ['enforce_finance_payment_lifecycle', 'guard_finance_payment_child_mutation','protect_finance_payment_audit_event']],
    [m22, ['current_user_can_manage_finance_payments', 'current_user_can_confirm_finance_payments', 'current_user_can_reverse_finance_payments', 'record_finance_payment_audit_event']],
    [m25, ['current_user_can_reverse_finance_cash_transactions']],
    [m27, ['post_confirmed_payment_to_finance_cash_transaction', 'confirm_finance_payment', 'assert_finance_payment_has_no_downstream_dependencies']],
    [m28, ['assert_finance_erroneous_payment_correction_dependencies', 'create_finance_erroneous_payment_cash_correction']],
    [m29, ['current_user_can_reallocate_finance_payments', 'current_user_can_view_finance_payments',
      'validate_finance_payment_effective_allocations', 'validate_finance_invoice_payment_settlement',
      'validate_finance_payment_integrity', 'finance_invoice_active_reserved_settlement',
      'save_finance_payment_draft', 'assert_finance_payment_reallocation_dependencies',
      'reallocate_finance_payment_allocation', 'reverse_finance_payment', 'correct_erroneous_finance_payment']],
    [migration('24'), ['assert_finance_invoice_has_no_void_dependencies']],
    [migration('32'), ['void_finance_invoice']],
    [migration('17'), ['generate_finance_document_no']],
  ];
  for (const [sql, names] of definitions) {
    for (const name of names) await db.exec(sqlFunction(sql, name));
  }
  await db.exec(`
    create trigger finance_payment_lifecycle_guard before insert or update or delete on finance_payments
      for each row execute function enforce_finance_payment_lifecycle();
    create trigger finance_payment_allocation_mutation_guard before insert or update or delete on finance_payment_invoice_allocations
      for each row execute function guard_finance_payment_child_mutation();
    create trigger finance_payment_audit_event_immutability before update or delete on finance_payment_audit_events
      for each row execute function protect_finance_payment_audit_event();
    revoke all on function generate_finance_document_no(text,date) from public,anon,authenticated;
  `);
  await db.exec(migration('36'));
  preflightResult = (await query(fs.readFileSync(path.join(root,'scripts/sql/preflight_finance_receipt_foundation.sql'),'utf8')))[0];
  // Exercise the exact operator dry-run locally and prove its DDL is rolled back.
  await db.exec(fs.readFileSync(path.join(root,'scripts/sql/dry_run_finance_receipt_foundation.sql'),'utf8'));
  assert.equal(await scalar("select to_regclass('public.finance_receipts')"), null);
  assert.equal(await scalar("select count(*)::integer from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='can_issue_finance_receipts'"), 0);
  assert.equal(await count('finance_payments'), 0);
  await db.exec(migration('37'));
}

async function invoice(total = 5000, options = {}) {
  const { fixtureId, fixtureNumber, ...snapshotOptions } = options;
  const id = fixtureId || randomUUID();
  const line = randomUUID();
  const number = fixtureNumber || `VP-IV-FIXTURE-${id.slice(0, 8)}`;
  const snapshot = {
    schema_version: 2, source_model: 'billable_charge_v2',
    invoice: { id, invoice_no: number, document_status: 'issued', currency: 'THB',
      issued_at: '2026-06-30T00:00:00Z', amount_before_vat: total === 5000 ? 4672.90 : total,
      vat_amount: total === 5000 ? 327.10 : 0, total_amount: total },
    customer: { ...frozenCustomer }, matter: { title: 'Synthetic Advisory Matter' },
    items: [{ invoice_item: { id: line, invoice_id: id, source_state: 'active', description: 'Synthetic Advisory Services',
      vat_applicable: true, amount_before_vat: total === 5000 ? 4672.90 : total,
      vat_amount: total === 5000 ? 327.10 : 0, line_total: total } }],
    ...snapshotOptions,
  };
  await query('insert into finance_invoices(id,invoice_no,client_id,total_amount,issued_snapshot_json) values($1,$2,$3,$4,$5)', [id, number, ids.client, total, snapshot]);
  await query('update finance_invoices set amount_before_vat=$2,vat_amount=$3,issued_at=$4 where id=$1', [id,snapshot.invoice.amount_before_vat,snapshot.invoice.vat_amount,snapshot.invoice.issued_at]);
  await query("insert into finance_invoice_items values($1,$2,'active')", [line, id]);
  return { id, line, number, snapshot, total };
}

async function payment({ cash = 5000, wht = 0, allocations, confirmed = true, fixtureId = randomUUID() } = {}) {
  allocations ||= [{ invoice: await invoice(cash + wht), cash, wht }];
  const id = await scalar(`insert into finance_payments(client_id,cash_amount,wht_amount,received_on,payment_method,
    receiving_bank_account_id,draft_origin_invoice_id,internal_reference,payer_name,created_by_user_id,id)
    values($1,$2,$3,$4,'bank_transfer',$5,$6,$8,'Synthetic Payer',$7,$9) returning id`,
  [ids.client, cash, wht, receivedOn, ids.bank, allocations[0].invoice.id, ids.admin, `SYNTHETIC-${randomUUID()}`, fixtureId]);
  for (const allocation of allocations) {
    await query('insert into finance_payment_invoice_allocations(payment_id,invoice_id,cash_allocated,wht_credit_allocated) values($1,$2,$3,$4)',
      [id, allocation.invoice.id, allocation.cash, allocation.wht || 0]);
  }
  if (wht) {
    assert.equal(allocations.length, 1, 'Structured WHT fixture uses the approved single-line/full-invoice rule');
    await rpc('save_finance_payment_tax_draft', [id, receivedOn, 'bank_transfer', ids.bank, null, null, 'Synthetic Payer', '',
      cash, wht, [{ invoice_id: allocations[0].invoice.id, cash_allocated: cash, wht_credit_allocated: wht }], 'rate', 3]);
  }
  if (confirmed) await rpc('confirm_finance_payment', [id, true]);
  return { id, allocations };
}

async function financialState() {
  const state = {};
  for (const table of ['finance_payments', 'finance_payment_invoice_allocations', 'finance_payment_allocation_reallocations',
    'finance_payment_wht_components', 'finance_payment_audit_events', 'finance_invoices', 'finance_invoice_settlement_summary',
    'finance_cash_transactions', 'finance_account_opening_balances', 'finance_cash_transaction_audit_events',
    'finance_company_ledger', 'finance_compensation_batches', 'finance_revenue_allocations']) {
    state[table] = await scalar(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${table} t`);
  }
  state.taxInvoice = await scalar("select to_regclass('public.finance_tax_invoices')::text");
  return state;
}

before(fixture, { timeout: 120000 });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback'); });
after(async () => { await db.close(); });

// Phase extensions reuse this isolated predecessor fixture and its regression suite.
module.exports = {db,query,scalar,flush,row,count,rpc,rejects,asActor,ids,invoice,payment,financialState,createReceipt,issueReceipt,voidReceipt,migration,root};

test('037 applies in full and installs real deferred reconciliation triggers', async () => {
  const triggers = await query(`select tgname,tgdeferrable,tginitdeferred from pg_trigger
    where tgname in ('validate_finance_receipt_integrity','validate_finance_receipt_allocation_integrity') order by tgname`);
  assert.equal(triggers.length, 2);
  for (const trigger of triggers) assert.ok(trigger.tgdeferrable && trigger.tginitdeferred);
  assert.equal(await count('finance_receipts'), 0);
  assert.equal(await scalar("select to_regclass('public.finance_tax_invoices')::text"), null);
});

test('preflight compiles and all prerequisite catalog checks pass against the isolated pre-037 fixture', () => {
  assert.deepEqual(preflightResult.failed_checks, ['protected_wht_source_verifier_pass'], JSON.stringify(preflightResult));
});

test('post-apply verifier compiles and attests exact 037 catalogs; protected target is absent in synthetic fixtures', async () => {
  const file = path.join(root,'scripts/sql/verify_finance_receipt_foundation.sql');
  let verifier = fs.readFileSync(file,'utf8');
  const manifestQuery = 'with receipt_tables' + verifier.split('), receipt_tables')[1].split('), expected_manifest as (')[0] + ') select * from actual_manifest order by kind,name';
  const manifest = await query(manifestQuery);
  if (process.env.RECEIPT_REBUILD_SQL === '1') {
    verifier = verifier.replace(/(-- BEGIN GENERATED MIGRATION 037 CATALOG MANIFEST\n)[\s\S]*?(\n-- END GENERATED MIGRATION 037 CATALOG MANIFEST)/,
      (_, start, end) => start + "    '" + JSON.stringify(manifest).replaceAll("'", "''") + "'::jsonb" + end);
    fs.writeFileSync(file,verifier);
    const migrationText = migration('37');
    const dryFile = path.join(root,'scripts/sql/dry_run_finance_receipt_foundation.sql');
    let dry = fs.readFileSync(dryFile,'utf8');
    dry = dry.replace(/(-- BEGIN EMBEDDED MIGRATION 037 \(byte-for-byte\)\n)[\s\S]*?(-- END EMBEDDED MIGRATION 037)/, (_,start,end) => start + migrationText + end);
    dry = dry.replace(/(-- BEGIN EMBEDDED RECEIPT FOUNDATION VERIFIER \(byte-for-byte\)\n)[\s\S]*?(-- END EMBEDDED RECEIPT FOUNDATION VERIFIER)/, (_,start,end) => start + verifier + end);
    fs.writeFileSync(dryFile,dry);
  }
  const rows = await query(verifier);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].failed_checks, ['protected_wht_evidence_unchanged'], JSON.stringify(rows[0]));
});

test('another operator refreshing a Draft invalidates the original reviewed snapshot', async () => {
  const p = await payment(); const id = await createReceipt(p.id);
  const reviewed = (await row(id)).draft_snapshot_json;
  await db.exec("update finance_company_profiles set phone='1111' where id='default'");
  await rpc('refresh_finance_receipt_draft',[id]);
  await rejects('select issue_finance_receipt($1,true,$2)',[id,reviewed],/RECEIPT_REVIEW_REQUIRED/);
  assert.equal(await count('finance_document_counters'),0);
  await issueReceipt(id);
});

test('complete post-apply verifier passes on synthetic protected evidence and fails on schema drift', async () => {
  // These IDs are inert copies in this isolated in-memory fixture, never Production reads/writes.
  const i = await invoice(5000,{fixtureId:'74461042-e3ba-4922-9b64-55aac9ebd8aa',fixtureNumber:'VP-IV-202609-000003'});
  await payment({fixtureId:'9e2f601e-13ef-4165-8e2c-1887c3ad8861',cash:4859.81,wht:140.19,allocations:[{invoice:i,cash:4859.81,wht:140.19}]});
  const sql=fs.readFileSync(path.join(root,'scripts/sql/verify_finance_receipt_foundation.sql'),'utf8');
  const result=(await query(sql))[0];
  assert.deepEqual(result.failed_checks,[],JSON.stringify(result));
  assert.equal(result.receipt_foundation_verification_pass,true);
  await db.exec('drop index uq_finance_receipts_active_payment');
  const drift=(await query(sql))[0];
  assert.equal(drift.receipt_foundation_verification_pass,false);
  assert.ok(drift.failed_checks.includes('exact_active_coverage_and_number_uniqueness_indexes'));
});

test('verifier executes in an engine-enforced read-only transaction', async () => {
  await db.exec('rollback; begin read only');
  const result=await db.exec(fs.readFileSync(path.join(root,'scripts/sql/verify_finance_receipt_foundation.sql'),'utf8'));
  assert.equal(result.length,1);assert.equal(result[0].rows.length,1);
});

test('unconfirmed Payment rejected; no acknowledgement means no Draft', async () => {
  const p = await payment({ confirmed: false });
  await rejects('select create_finance_receipt_draft_from_payment($1,true)', [p.id], /RECEIPT_CONFIRMED_PAYMENT_REQUIRED/);
  assert.equal(await count('finance_receipts'), 0);
  await rpc('confirm_finance_payment', [p.id, true]);
  await rejects('select create_finance_receipt_draft_from_payment($1,false)', [p.id], /RECEIPT_EXTERNAL_COVERAGE_ACK_REQUIRED/);
});

test('confirmed creation retries return one unnumbered Draft without duplicate audit or frozen allocation rows', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  assert.equal(await createReceipt(p.id), id);
  const draft = await row(id);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.receipt_no, null);
  assert.equal(draft.receipt_date, receivedOn);
  assert.equal(draft.issued_snapshot_json, null);
  assert.equal(await count('finance_receipts'), 1);
  assert.equal(await count('finance_receipt_audit_events'), 1);
  assert.equal(await count('finance_receipt_invoice_allocations'), 0);
  assert.equal(await count('finance_document_counters'), 0);
});

test('database unique index rejects duplicate active Payment coverage', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await rejects(`insert into finance_receipts(payment_id,client_id,receipt_date,currency,cash_amount,wht_amount,
    draft_snapshot_json,external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id)
    select payment_id,client_id,receipt_date,currency,cash_amount,wht_amount,draft_snapshot_json,
      external_receipt_checked_at,external_receipt_checked_by_user_id,created_by_user_id from finance_receipts where id=$1`,
  [id], /uq_finance_receipts_active_payment/);
});

test('Issue allocates exactly one date-derived VP-RC number; retries and Create return the same Issued receipt', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await rejects('select issue_finance_receipt($1,false)', [id], /RECEIPT_ISSUE_ACK_REQUIRED/);
  assert.equal(await issueReceipt(id), id);
  const issued = await row(id);
  assert.equal(issued.receipt_no, 'VP-RC-202607-000001');
  assert.equal(issued.receipt_date, receivedOn);
  assert.equal(issued.issued_by_user_id, ids.admin);
  assert.ok(issued.issued_at);
  assert.equal(await issueReceipt(id), id);
  assert.equal(await createReceipt(p.id), id);
  assert.deepEqual(await row(id), issued);
  assert.equal(await scalar('select last_no from finance_document_counters'), 1);
  assert.equal(await scalar("select count(*)::integer from finance_receipt_audit_events where event_type='issued'"), 1);
});

test('Issue freezes identities, bank, Payment, Invoice references, cash and structured WHT without financial effects', async () => {
  const p = await payment({ cash: 4859.81, wht: 140.19 });
  const before = await financialState();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  const issued = await row(id);
  const snapshot = issued.issued_snapshot_json;
  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.document_kind, 'receipt');
  assert.equal(snapshot.seller.company_name_th, 'Synthetic Seller');
  assert.deepEqual(snapshot.customer, { id: ids.client, ...frozenCustomer });
  assert.equal(snapshot.payment.id, p.id);
  assert.equal(snapshot.payment.received_on, receivedOn);
  assert.equal(snapshot.payment.payment_method, 'bank_transfer');
  assert.equal(snapshot.payment.receiving_bank_account.account_number, '000-000-0000');
  assert.equal(snapshot.invoices[0].invoice_no, p.allocations[0].invoice.number);
  assert.equal(snapshot.invoices[0].description, 'Synthetic Advisory Services');
  assert.equal(snapshot.invoices[0].matter.title, 'Synthetic Advisory Matter');
  assert.equal(snapshot.structured_wht_components.length, 1);
  assert.equal(snapshot.structured_wht_components[0].base_amount, 4672.90);
  for (const [key, value] of Object.entries({ cash_amount: 4859.81, wht_amount: 140.19, settlement_amount: 5000 })) {
    assert.equal(Number(issued[key]), value);
    assert.equal(snapshot.payment[key], value);
  }
  assert.equal(snapshot.receipt.issued_by_user_id, ids.admin);
  assert.equal(snapshot.receipt.receipt_date, receivedOn);
  assert.equal(await count('finance_payment_evidence'), 0, 'No WHT certificate has been asserted');
  assert.deepEqual(await financialState(), before);
  await db.exec("update finance_company_profiles set company_name_th='Changed Seller',address_th=null; update clients set name='Changed Client'; update finance_bank_accounts set account_number='changed'");
  await query("update finance_invoices set issued_snapshot_json=jsonb_set(issued_snapshot_json,'{customer,name}','\"Changed Invoice Customer\"') where id=$1", [p.allocations[0].invoice.id]);
  assert.equal(await issueReceipt(id), id, 'Idempotent Issue must not reread mutable master data');
  assert.deepEqual(await row(id), issued);
});

test('partial Payments on one Invoice issue only their own settlement, never a cumulative third receipt', async () => {
  const i = await invoice(12000);
  const a = await payment({ cash: 10000, allocations: [{ invoice: i, cash: 10000 }] });
  const b = await payment({ cash: 2000, allocations: [{ invoice: i, cash: 2000 }] });
  for (const [p, amount] of [[a, 10000], [b, 2000]]) {
    const id = await createReceipt(p.id);
    await issueReceipt(id);
    assert.equal(Number((await row(id)).settlement_amount), amount);
    assert.equal((await row(id)).issued_snapshot_json.invoices[0].settlement_allocated, amount);
  }
  assert.equal(await count('finance_receipts'), 2);
  assert.equal(await scalar('select sum(settlement_amount)::numeric from finance_receipts'), '12000.00');
});

test('multi-Invoice Receipt freezes effective reallocations, including a target absent from original allocations', async () => {
  const a = await invoice(7000);
  const b = await invoice(7000);
  const p = await payment({ cash: 6000, allocations: [{ invoice: a, cash: 6000 }] });
  await rpc('reallocate_finance_payment_allocation', [p.id, a.id, b.id, 2000, 0, 'Synthetic reallocation', true, randomUUID()]);
  const before = await financialState();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  const frozen = (await row(id)).issued_snapshot_json.invoices;
  assert.equal(frozen.length, 2);
  assert.equal(frozen.find((i) => i.invoice_id === a.id).settlement_allocated, 4000);
  assert.equal(frozen.find((i) => i.invoice_id === b.id).settlement_allocated, 2000);
  assert.equal(await count('finance_receipt_invoice_allocations'), 2);
  assert.deepEqual(await financialState(), before);
});

test('stale Draft fails Issue with no number consumption, then Refresh and review allow Issue', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await db.exec("update finance_bank_accounts set account_name='Updated Account Name'");
  await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED/);
  assert.equal(await count('finance_document_counters'), 0);
  assert.equal((await row(id)).status, 'draft');
  await rpc('refresh_finance_receipt_draft', [id]);
  const auditCount = await count('finance_receipt_audit_events');
  await rpc('refresh_finance_receipt_draft', [id]);
  assert.equal(await count('finance_receipt_audit_events'), auditCount);
  await issueReceipt(id);
  assert.equal((await row(id)).issued_snapshot_json.payment.receiving_bank_account.account_name, 'Updated Account Name');
});

test('Draft reallocation changes review evidence and requires Refresh before Issue', async () => {
  const p = await payment();
  const target = await invoice();
  const id = await createReceipt(p.id);
  await rpc('reallocate_finance_payment_allocation', [p.id, p.allocations[0].invoice.id, target.id, 1000, 0, 'Synthetic change', true, randomUUID()]);
  await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_SOURCE_CHANGED_REFRESH_REQUIRED/);
  await rpc('refresh_finance_receipt_draft', [id]);
  await issueReceipt(id);
  assert.equal((await row(id)).issued_snapshot_json.invoices.length, 2);
});

test('cancelling Draft releases coverage without consuming a number or changing financial facts', async () => {
  const p = await payment();
  const before = await financialState();
  const id = await createReceipt(p.id);
  await rejects('select cancel_finance_receipt_draft($1,$2)', [id, '  '], /RECEIPT_REASON_REQUIRED/);
  assert.equal(await cancelReceipt(id), id);
  assert.equal(await cancelReceipt(id), id);
  assert.equal((await row(id)).receipt_no, null);
  const replacement = await createReceipt(p.id);
  assert.notEqual(replacement, id);
  assert.equal(await count('finance_document_counters'), 0);
  assert.deepEqual(await financialState(), before);
});

test('issued header, frozen allocations, and audit history reject trusted SQL mutation and deletion', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  for (const sql of [
    'update finance_receipts set cash_amount=cash_amount+1 where id=$1',
    "update finance_receipts set issued_snapshot_json='{}' where id=$1",
    'delete from finance_receipts where id=$1',
    'update finance_receipt_invoice_allocations set cash_allocated=cash_allocated+1 where receipt_id=$1',
    'delete from finance_receipt_invoice_allocations where receipt_id=$1',
    "update finance_receipt_audit_events set event_payload_json='{}' where receipt_id=$1",
    'delete from finance_receipt_audit_events where receipt_id=$1',
  ]) await rejects(sql, [id], /RECEIPT_HISTORY_IMMUTABLE/);
});

test('Void requires reason and acknowledgement, preserves issued history, and replacement gets a new number', async () => {
  const p = await payment();
  const before = await financialState();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  const issued = await row(id);
  const allocations = await query('select * from finance_receipt_invoice_allocations');
  await rejects('select void_finance_receipt($1,$2,true)', [id, ' '], /RECEIPT_REASON_REQUIRED/);
  await rejects('select void_finance_receipt($1,$2,false)', [id, 'reason'], /RECEIPT_VOID_ACK_REQUIRED/);
  await voidReceipt(id);
  await voidReceipt(id);
  const voided = await row(id);
  assert.equal(voided.status, 'voided');
  assert.equal(voided.receipt_no, issued.receipt_no);
  assert.deepEqual(voided.issued_snapshot_json, issued.issued_snapshot_json);
  assert.deepEqual(await query('select * from finance_receipt_invoice_allocations'), allocations);
  assert.deepEqual(await financialState(), before);
  const replacement = await createReceipt(p.id);
  assert.equal((await row(replacement)).replaces_receipt_id, id);
  await issueReceipt(replacement);
  assert.equal((await row(replacement)).receipt_no, 'VP-RC-202607-000002');
  assert.equal(await scalar('select last_no from finance_document_counters'), 2);
  assert.deepEqual(await financialState(), before);
});

for (const status of ['draft', 'issued', 'cancelled', 'voided']) {
  for (const action of ['reverse', 'correct', 'reallocate']) {
    test(`${status} Receipt ${status === 'issued' ? 'blocks' : 'does not block'} actual Payment ${action} RPC`, async () => {
      const p = await payment();
      const target = await invoice();
      const receipt = await createReceipt(p.id);
      if (status === 'issued' || status === 'voided') await issueReceipt(receipt);
      if (status === 'cancelled') await cancelReceipt(receipt);
      if (status === 'voided') await voidReceipt(receipt);
      const calls = {
        reverse: ['reverse_finance_payment', [p.id, 'Synthetic reverse']],
        correct: ['correct_erroneous_finance_payment', [p.id, 'Synthetic correction', true]],
        reallocate: ['reallocate_finance_payment_allocation', [p.id, p.allocations[0].invoice.id, target.id, 1000, 0, 'Synthetic reallocation', true, randomUUID()]],
      };
      const [name, args] = calls[action];
      const prior = await financialState();
      if (status === 'issued') {
        await rejects(`select ${name}(${args.map((_, i) => `$${i + 1}`).join(',')})`, args, /FINANCE_ISSUED_RECEIPT_DEPENDENCY/);
        assert.deepEqual(await financialState(), prior);
      } else {
        await rpc(name, args);
        assert.equal(await scalar('select status from finance_payments where id=$1', [p.id]), action === 'reallocate' ? 'confirmed' : 'reversed');
        if (action === 'reallocate') assert.equal(await count('finance_payment_allocation_reallocations'), 1);
        if (status === 'draft' && action !== 'reallocate') {
          await rejects('select issue_finance_receipt($1,true)', [receipt], /RECEIPT_CONFIRMED_PAYMENT_REQUIRED/);
        }
      }
      assert.equal(await count('finance_cash_transactions'), 0);
      assert.equal(await count('finance_account_opening_balances'), 0);
    });
  }
}

for (const status of ['issued', 'cancelled', 'voided']) {
  test(`${status} Receipt Invoice guard respects lifecycle; Invoice Void still requires resolution of Payment settlement`, async () => {
    const p = await payment();
    const i = p.allocations[0].invoice;
    const id = await createReceipt(p.id);
    if (status !== 'cancelled') await issueReceipt(id);
    if (status === 'cancelled') await cancelReceipt(id);
    if (status === 'voided') await voidReceipt(id);
    if (status === 'issued') {
      await rejects('select assert_finance_invoice_has_no_void_dependencies($1)', [i.id], /FINANCE_ISSUED_RECEIPT_DEPENDENCY/);
    } else {
      await query('select assert_finance_invoice_has_no_void_dependencies($1)', [i.id]);
    }
    await rejects('select void_finance_invoice($1,$2,true)', [i.id, 'Synthetic Invoice Void'], /effective Confirmed Payment settlement/);
    if (status !== 'issued') {
      await rpc('reverse_finance_payment', [p.id, 'Synthetic reverse before Invoice Void']);
      assert.equal(await rpc('void_finance_invoice', [i.id, 'Synthetic Invoice Void', true]), i.id);
      assert.equal(await scalar('select document_status from finance_invoices where id=$1', [i.id]), 'voided');
    }
  });
}

test('Invoice-level Receipt dependency blocks another Payment reallocation targeting the covered Invoice', async () => {
  const covered = await invoice(10000);
  const first = await payment({ cash: 5000, allocations: [{ invoice: covered, cash: 5000 }] });
  const receipt = await createReceipt(first.id);
  await issueReceipt(receipt);
  const second = await payment();
  const args = [second.id, second.allocations[0].invoice.id, covered.id, 1000, 0, 'Synthetic cross-Payment change', true, randomUUID()];
  await rejects('select reallocate_finance_payment_allocation($1,$2,$3,$4,$5,$6,$7,$8)', args, /FINANCE_ISSUED_RECEIPT_DEPENDENCY/);
  await voidReceipt(receipt);
  await rpc('reallocate_finance_payment_allocation', args);
});

test('voided Receipt does not erase conservative non-Receipt dependency checks', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  await voidReceipt(id);
  await query('insert into finance_company_ledger(id,source_payment_id) values($1,$2)', [randomUUID(), p.id]);
  await rejects('select reverse_finance_payment($1,$2)', [p.id, 'Synthetic reversal'], /downstream records/);
  await rejects('select correct_erroneous_finance_payment($1,$2,true)', [p.id, 'Synthetic correction'], /DOWNSTREAM_DEPENDENCIES/);
});

test('deferred constraint rejects Draft allocation inserts and incomplete trusted Issue writes', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  const draft = await row(id);
  const allocation = draft.draft_snapshot_json.invoices[0];
  await rejects(`insert into finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,cash_allocated,wht_allocated,source_snapshot_json)
    values($1,$2,$3,'THB',5000,0,$4)`, [id, allocation.invoice_id, allocation.invoice_no, allocation], /RECEIPT_DRAFT_COVERAGE_INVALID/);
  const issuedSnapshot = { ...draft.draft_snapshot_json, receipt: { id, receipt_no: 'VP-RC-202607-000001', receipt_date: receivedOn } };
  await rejects(`update finance_receipts set status='issued',receipt_no='VP-RC-202607-000001',
    issued_at=now(),issued_by_user_id=$2,issued_snapshot_json=$3 where id=$1`, [id, ids.admin, issuedSnapshot], /RECEIPT_FROZEN_COVERAGE_INVALID/);
  assert.equal((await row(id)).status, 'draft');
  assert.equal(await count('finance_receipt_invoice_allocations'), 0);
});

test('deferred constraint validates allocation values against their frozen source, not just summed totals', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  const draft = await row(id);
  const allocation = draft.draft_snapshot_json.invoices[0];
  await db.exec('savepoint invalid_trusted_issue');
  try {
    const issuedSnapshot = { ...draft.draft_snapshot_json, receipt: { id, receipt_no: 'VP-RC-202607-000001', receipt_date: receivedOn } };
    await query(`update finance_receipts set status='issued',receipt_no='VP-RC-202607-000001',
      issued_at=now(),issued_by_user_id=$2,issued_snapshot_json=$3 where id=$1`, [id, ids.admin, issuedSnapshot]);
    await query(`insert into finance_receipt_invoice_allocations(receipt_id,invoice_id,invoice_no,currency,cash_allocated,wht_allocated,source_snapshot_json)
      values($1,$2,'TAMPERED-NUMBER','THB',5000,0,$3)`, [id, allocation.invoice_id, allocation]);
    await assert.rejects(flush, /RECEIPT_FROZEN_COVERAGE_INVALID/);
  } finally {
    await db.exec('rollback to savepoint invalid_trusted_issue; release savepoint invalid_trusted_issue');
  }
  await issueReceipt(id);
  assert.equal((await row(id)).receipt_no, 'VP-RC-202607-000001');
});

test('Receipt permissions are independent of Payment-confirm and partner privileges; browser RLS is enforced', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await query("update user_profiles set role='partner',can_confirm_finance_payments=true where id=$1", [ids.staff]);
  await asActor(ids.staff, async () => {
    assert.equal(await scalar('select current_user_can_confirm_finance_payments()'), true);
    assert.equal(await scalar('select current_user_can_view_finance_receipts()'), false);
    assert.equal(await count('finance_receipts'), 0);
    assert.equal(await count('finance_receipt_audit_events'), 0);
    await rejects('select create_finance_receipt_draft_from_payment($1,true)', [p.id], /RECEIPT_PERMISSION_DENIED/);
    await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_PERMISSION_DENIED/);
  });
  await query('update user_profiles set can_view_finance_receipts=true where id=$1', [ids.staff]);
  await asActor(ids.staff, async () => {
    assert.equal(await count('finance_receipts'), 1);
    assert.equal(await count('finance_receipt_audit_events'), 1);
    await rejects('select refresh_finance_receipt_draft($1)', [id], /RECEIPT_PERMISSION_DENIED/);
    await rejects('select cancel_finance_receipt_draft($1,$2)', [id, 'Synthetic reason'], /RECEIPT_PERMISSION_DENIED/);
  });
});

test('manage, issue and void capabilities authorize only their own Receipt actions through authenticated RPCs', async () => {
  const p = await payment();
  await query('update user_profiles set can_manage_finance_receipts=true where id=$1', [ids.staff]);
  const id = await asActor(ids.staff, () => createReceipt(p.id));
  await asActor(ids.staff, async () => {
    await rpc('refresh_finance_receipt_draft', [id]);
    await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_PERMISSION_DENIED/);
  });
  await query('update user_profiles set can_manage_finance_receipts=false,can_issue_finance_receipts=true where id=$1', [ids.staff]);
  await asActor(ids.staff, async () => {
    await rejects('select refresh_finance_receipt_draft($1)', [id], /RECEIPT_PERMISSION_DENIED/);
    await issueReceipt(id);
    assert.equal(await count('finance_receipt_invoice_allocations'), 1);
    await rejects('select void_finance_receipt($1,$2,true)', [id, 'Synthetic reason'], /RECEIPT_PERMISSION_DENIED/);
  });
  assert.equal((await row(id)).issued_by_user_id, ids.staff);
  await query('update user_profiles set can_issue_finance_receipts=false,can_void_finance_receipts=true where id=$1', [ids.staff]);
  await asActor(ids.staff, async () => {
    await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_PERMISSION_DENIED/);
    await voidReceipt(id);
  });
  assert.equal((await row(id)).voided_by_user_id, ids.staff);
});

test('inactive users and missing auth identity cannot read or mutate Receipts', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await query('update user_profiles set can_manage_finance_receipts=true,can_issue_finance_receipts=true,can_void_finance_receipts=true,active=false where id=$1', [ids.staff]);
  for (const actor of [ids.staff, null]) {
    await asActor(actor, async () => {
      assert.equal(await count('finance_receipts'), 0);
      await rejects('select create_finance_receipt_draft_from_payment($1,true)', [p.id], /RECEIPT_PERMISSION_DENIED/);
      await rejects('select issue_finance_receipt($1,true)', [id], /RECEIPT_PERMISSION_DENIED/);
      await rejects('select void_finance_receipt($1,$2,true)', [id, 'Synthetic reason'], /RECEIPT_PERMISSION_DENIED/);
    });
  }
  await db.exec('set local role anon');
  await rejects('select create_finance_receipt_draft_from_payment($1,true)', [p.id], /permission denied/);
  await db.exec('reset role');
});

test('direct browser writes and internal helpers are denied even for an Admin actor', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await issueReceipt(id);
  await asActor(ids.admin, async () => {
    for (const table of ['finance_receipts', 'finance_receipt_invoice_allocations', 'finance_receipt_audit_events']) {
      await rejects(`insert into ${table} default values`, [], /permission denied/);
      await rejects(`update ${table} set id=id`, [], /permission denied/);
      await rejects(`delete from ${table}`, [], /permission denied/);
    }
    for (const [sql, args] of [
      ['select build_finance_receipt_source($1)', [p.id]],
      ["select record_finance_receipt_audit($1,'issued','{}')", [id]],
      ["select generate_finance_document_no('receipt',$1)", [receivedOn]],
      ['select assert_finance_receipt_dependencies($1,null)', [p.id]],
    ]) await rejects(sql, args, /permission denied/);
  });
});

test('profile trigger prevents Receipt capability escalation via both UPDATE and INSERT', async () => {
  await db.exec('grant select,insert,update on user_profiles to authenticated');
  await asActor(ids.staff, async () => {
    for (const capability of ['view', 'manage', 'issue', 'void']) {
      await rejects(`update user_profiles set can_${capability}_finance_receipts=true where id=$1`, [ids.staff], /Only an active Admin/);
      await rejects(`insert into user_profiles(id,can_${capability}_finance_receipts) values($1,true)`, [randomUUID()], /Only an active Admin/);
    }
  });
});

test('invalid/inactive numbering profile and exhausted period fail atomically without issuing', async () => {
  const p = await payment();
  const id = await createReceipt(p.id);
  await db.exec("update document_numbering_profiles set display_prefix='WRONG' where document_type='receipt'");
  await rejects('select issue_finance_receipt($1,true,$2)', [id, (await row(id)).draft_snapshot_json], /RECEIPT_NUMBERING_PROFILE_INVALID/);
  await db.exec("update document_numbering_profiles set display_prefix='VP-RC',is_active=false where document_type='receipt'");
  await rejects('select issue_finance_receipt($1,true,$2)', [id, (await row(id)).draft_snapshot_json], /numbering profile is not active/);
  await db.exec("update document_numbering_profiles set is_active=true where document_type='receipt'");
  await db.exec("insert into finance_document_counters(doc_type,year,month,prefix,last_no) values('receipt',2026,7,'VP-RC-202607-',999999)");
  await rejects('select issue_finance_receipt($1,true,$2)', [id, (await row(id)).draft_snapshot_json], /RECEIPT_NUMBERING_EXHAUSTED/);
  assert.equal(await scalar('select last_no from finance_document_counters'), 999999);
  assert.equal((await row(id)).status, 'draft');
  assert.equal(await count('finance_receipt_invoice_allocations'), 0);
});
