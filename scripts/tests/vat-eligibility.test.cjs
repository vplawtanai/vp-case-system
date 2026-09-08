/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { invoiceId, snapshot, eligibility, render } = require('./vat-eligibility-fixture.cjs');
const { invoiceVatLines, vatTreatmentPresentation, vatSummaryUnavailable, unknownVatExplanation, unknownTaxDecision,
  vatConfirmationBlocker, vatEligibilityBlockerMessage } = require('../../app/finance/tax-invoices/vat-treatment.ts');
const { loadPaymentVatLines } = require('../../app/finance/tax-invoices/vat-summary-source.ts');
const { taxError } = require('../../app/finance/tax-invoices/shared.ts');
const zero = { amount_before_vat: 2000, vat_amount: 0, line_total: 2000, vat_rate: 0 };

test('Frozen positive-rate VAT uses stored rate/base/tax, without changing source or deriving from gross', () => {
  const source = snapshot(), before = JSON.stringify(source), [line] = invoiceVatLines(source, invoiceId);
  assert.deepEqual([line.beforeVat, line.vat, line.rate, line.treatment], [4672.90, 327.10, 7, 'standard_rate']);
  assert.equal(vatTreatmentPresentation(line.treatment, line.rate).workflow, 'applies');
  for (const text of ['ค่าที่ปรึกษา UAT Gross First', '4,672.90 THB', '327.10 THB', 'VAT 7%', 'ต้องดำเนินการใบกำกับภาษี']) assert.ok(render().includes(text), text);
  assert.equal(JSON.stringify(source), before);
  assert.equal(invoiceVatLines(snapshot([{ vat_rate: '7.0000' }]), invoiceId)[0].rate, 7);
});
test('Explicit zero-rated/exempt/outside-scope presentation vocabulary is correct; it is NOT a storage decoder', () => {
  // These are explicit presentation inputs for a future controlled evidence adapter, not inferred DB fields.
  for (const [treatment, label, workflow] of [['zero_rated', 'VAT 0% (อัตราศูนย์)', 'applies'],
    ['exempt', 'ยกเว้น VAT', 'not_applicable'], ['outside_scope', 'ไม่อยู่ในบังคับ VAT', 'not_applicable']]) {
    const value = vatTreatmentPresentation(treatment, 0);
    assert.equal(value.label, label); assert.equal(value.workflow, workflow);
    assert.ok(render({ lines: [{ ...invoiceVatLines(snapshot(), invoiceId)[0], ...zero, vat: 0, rate: 0, treatment }] }).includes(label));
  }
});
test('Zero VAT never implies zero-rating, exemption, outside scope or no Tax Invoice', () => {
  for (const vat_applicable of [false, true]) {
    const lines = invoiceVatLines(snapshot([{ ...zero, vat_applicable }]), invoiceId);
    assert.equal(lines[0].treatment, 'unknown');
    const result = render({ lines });
    for (const text of ['ยังไม่ได้กำหนด VAT Treatment', unknownVatExplanation, unknownTaxDecision, 'ยังไม่พร้อมออกใบกำกับภาษี']) assert.ok(result.includes(text));
    assert.doesNotMatch(result, /ไม่ต้องออกใบกำกับภาษี|VAT 0% \(อัตราศูนย์\)/);
  }
});
test('Free text, economic classification, funding mode and invented treatment keys confer NO authority', () => {
  for (const value of ['zero_rated', 'exempt', 'outside_scope', 'disbursement', 'pass_through']) {
    const lines = invoiceVatLines(snapshot([{ ...zero, tax_category: value, vat_treatment: value, tax_treatment: value,
      economic_classification: value, description: value, client_cost_funding_mode: value }]), invoiceId);
    assert.equal(lines[0].treatment, 'unknown');
  }
});
test('Positive applicability/rate remains relevant even when a tiny line rounds VAT to zero', () => {
  const lines = invoiceVatLines(snapshot([{ amount_before_vat: 0.01, vat_amount: 0, line_total: 0.01 }]), invoiceId);
  assert.equal(lines[0].treatment, 'standard_rate');
});
test('Missing/invalid rates are unresolved, never coerced to zero or inferred from VAT amount', () => {
  for (const vat_rate of [null, undefined, '', ' ', false, -7, 'invalid', 101]) {
    const line = invoiceVatLines(snapshot([{ vat_rate }]), invoiceId)[0];
    assert.equal(line.treatment, 'unknown'); assert.equal(line.rate, null);
  }
});
test('Malformed, mismatched, duplicate, stale or incomplete frozen sources fail closed', () => {
  assert.throws(() => invoiceVatLines(snapshot(), 'different-invoice'));
  for (const edit of [s => { s.invoice.document_status = 'draft'; }, s => { s.schema_version = 99; },
    s => { s.items = []; }, s => { s.items[0].invoice_item.invoice_id = 'wrong'; }, s => { s.items[0].invoice_item.source_state = 'released'; },
    s => { s.items[0].invoice_item.vat_amount = 0; }, s => { s.items[0].invoice_item.description = ''; }, s => { s.items.push(s.items[0]); }]) {
    const s = snapshot(); edit(s); assert.throws(() => invoiceVatLines(s, invoiceId));
  }
});
test('Mixed/multi-line summary retains per-line amounts and identifies unresolved lines', () => {
  const lines = invoiceVatLines(snapshot([{}, { ...zero, description: 'ค่าเดินทาง', vat_applicable: false }]), invoiceId);
  assert.deepEqual(lines.map(l => l.treatment), ['standard_rate', 'unknown']);
  const result = render({ lines, eligibility: { can_prepare: false, blockers: ['TAX_INVOICE_MULTILINE_UNSUPPORTED'] } });
  assert.equal((result.match(/<tr>/g) || []).length, 3);
  for (const text of ['ค่าเดินทาง', '2,000.00 THB', 'VAT 7%', 'ยังไม่ได้กำหนด VAT Treatment', taxError('TAX_INVOICE_MULTILINE_UNSUPPORTED')]) assert.ok(result.includes(text));
});
test('UAT standard VAT relevance never removes buyer/tax-point/external/VAT confirmation or other server blockers', () => {
  for (const state of [eligibility, { ...eligibility, existing_id: 'tax-draft', existing_status: 'draft' }]) {
    const result = render({ eligibility: state });
    assert.match(result, /ยังไม่พร้อมออกใบกำกับภาษี/);
    assert.equal((result.match(/<li>/g) || []).length, state.blockers.length);
    for (const blocker of state.blockers) assert.ok(result.includes(vatEligibilityBlockerMessage(blocker, invoiceVatLines(snapshot(), invoiceId))), blocker);
  }
  assert.match(render({ lines: invoiceVatLines(snapshot([{ ...zero }]), invoiceId), eligibility: { can_prepare: true, blockers: [] } }), /ยังไม่พร้อมออกใบกำกับภาษี/);
  assert.match(render({ eligibility: { can_prepare: true, blockers: [] } }), /ตรวจสอบและยืนยันการออกใบกำกับภาษีในร่าง/);
});
test('Known source VAT and pending Tax Invoice treatment confirmation are separate, without changing UAT amounts or blockers', () => {
  const result = render();
  assert.match(result, /ข้อมูล VAT จากใบแจ้งหนี้/);
  assert.match(result, /VAT 7%/);
  assert.match(result, /VAT Treatment สำหรับใบกำกับภาษี<br\/><strong>รอการยืนยัน<\/strong>/);
  assert.ok(result.includes('ระบบตรวจพบ VAT 7% จากข้อมูลใบแจ้งหนี้ กรุณายืนยัน VAT Treatment สำหรับใบกำกับภาษี'));
  assert.doesNotMatch(result, /ยังไม่ได้ยืนยันประเภท VAT/);
  for (const text of ['4,672.90 THB', '327.10 THB', 'ต้องดำเนินการใบกำกับภาษี', 'ยังไม่พร้อมออกใบกำกับภาษี']) assert.ok(result.includes(text));
  const row = result.match(/<tbody>(.*?)<\/tbody>/s)[1];
  assert.equal((row.match(/<td /g) || []).length, 4, 'No extra column/card for the second layer');
});
test('Pending treatment wording follows the existing blocker, never guesses confirmation from the VAT rate', () => {
  for (const state of [null, { can_prepare: true, blockers: [] },
    { can_prepare: false, blockers: ['TAX_INVOICE_MULTILINE_UNSUPPORTED'] },
    { can_prepare: false, existing_id: 'tax-issued', existing_status: 'issued', blockers: ['TAX_INVOICE_ALREADY_COVERED'] }]) {
    const result = render({ eligibility: state });
    assert.match(result, /VAT 7%/); assert.doesNotMatch(result, /รอการยืนยัน|ยืนยันแล้ว/);
  }
});
test('Contextual blocker wording uses authoritative positive rates only and leaves all other messages intact', () => {
  const lines = invoiceVatLines(snapshot(), invoiceId);
  const differentRate = [{ ...lines[0], rate: 10 }];
  assert.match(vatEligibilityBlockerMessage(vatConfirmationBlocker, differentRate), /ระบบตรวจพบ VAT 10%/);
  assert.match(vatEligibilityBlockerMessage(vatConfirmationBlocker, [...lines, ...lines, ...differentRate]), /ระบบตรวจพบ VAT 7%, VAT 10%/);
  for (const state of [null, [], [{ ...lines[0], rate: null }],
    ...['unknown', 'zero_rated', 'exempt', 'outside_scope'].map(treatment => [{ ...lines[0], rate: 0, treatment }])]) {
    assert.equal(vatEligibilityBlockerMessage(vatConfirmationBlocker, state), taxError(vatConfirmationBlocker));
  }
  for (const code of eligibility.blockers.filter(code => code !== vatConfirmationBlocker)) {
    assert.equal(vatEligibilityBlockerMessage(code, lines), taxError(code));
  }
  const unknown = render({ lines: invoiceVatLines(snapshot([{ ...zero }]), invoiceId) });
  assert.match(unknown, /ยังไม่ได้กำหนด VAT Treatment/);
  assert.match(unknown, /ยังไม่พร้อมออกใบกำกับภาษี/);
  assert.doesNotMatch(unknown, /ระบบตรวจพบ VAT 0%|รอการยืนยัน|ไม่ต้องออกใบกำกับภาษี/);
});
test('Issued coverage, loading and unavailable states do not imply that new issuance is ready', () => {
  assert.match(render({ eligibility: { can_prepare: false, existing_status: 'issued', existing_id: 'tax', blockers: ['TAX_INVOICE_ALREADY_COVERED'] } }), /ออกใบกำกับภาษีแล้ว/);
  assert.match(render({ lines: null, eligibility: null }), /กำลังอ่านหลักฐาน VAT/);
  const missing = render({ lines: null, error: vatSummaryUnavailable, eligibility: { can_prepare: true, blockers: [] } });
  assert.match(missing, /ยังไม่พร้อมออกใบกำกับภาษี/); assert.ok(missing.includes(vatSummaryUnavailable));
});

function clientFixture(allocations, invoices) {
  const calls = [];
  return { calls, from(table) { calls.push(['from', table]); return { select(columns) { calls.push(['select', columns]); return {
    async eq(key, value) { calls.push(['eq', key, value]); return allocations; },
    async in(key, value) { calls.push(['in', key, value]); return invoices; },
  }; } }; } };
}
test('Shared loader reads only effective Payment links and frozen issued items, not raw history/live Charges', async () => {
  const client = clientFixture({ data: [{ invoice_id: invoiceId }] }, { data: [{ id: invoiceId, document_status: 'issued', issued_snapshot_json: snapshot() }] });
  const lines = await loadPaymentVatLines(client, 'payment-fixture');
  assert.equal(lines.length, 1);
  assert.deepEqual(client.calls, [['from', 'finance_payment_effective_invoice_allocations'], ['select', 'invoice_id'], ['eq', 'payment_id', 'payment-fixture'],
    ['from', 'finance_invoices'], ['select', 'id,document_status,issued_snapshot_json'], ['in', 'id', [invoiceId]]]);
});
test('RLS omission, no links, returned errors and rejected queries cannot produce a partial successful summary', async () => {
  const ok = { data: [{ id: invoiceId, document_status: 'issued', issued_snapshot_json: snapshot() }] };
  for (const [allocations, invoices] of [[{ error: new Error('permission') }, ok], [{ data: [] }, ok],
    [{ data: [{ invoice_id: invoiceId }] }, { data: [] }], [{ data: [{ invoice_id: invoiceId }, { invoice_id: 'hidden' }] }, ok],
    [{ data: [{ invoice_id: invoiceId }] }, { error: new Error('denied') }],
    [{ data: [{ invoice_id: invoiceId }] }, { data: [{ ...ok.data[0], document_status: 'voided' }] }]]) {
    await assert.rejects(loadPaymentVatLines(clientFixture(allocations, invoices), 'payment-fixture'));
  }
  await assert.rejects(loadPaymentVatLines({ from() { throw new Error('offline'); } }, 'payment-fixture'));
});
test('Multiple current Invoice sources are all shown with frozen document references', async () => {
  const secondId = 'second-invoice', second = snapshot([{ ...zero, description: 'ค่าเดินทาง' }]);
  second.invoice.id = secondId; second.invoice.invoice_no = 'VP-IV-FIXTURE-2'; second.items[0].invoice_item.invoice_id = secondId;
  const client = clientFixture({ data: [{ invoice_id: invoiceId }, { invoice_id: secondId }] }, { data: [
    { id: secondId, document_status: 'issued', issued_snapshot_json: second }, { id: invoiceId, document_status: 'issued', issued_snapshot_json: snapshot() },
  ] });
  const result = render({ lines: await loadPaymentVatLines(client, 'payment-fixture') });
  for (const text of ['VP-IV-FIXTURE-1', 'VP-IV-FIXTURE-2', 'ค่าเดินทาง']) assert.ok(result.includes(text));
});
test('Payment/Receipt use one shared panel; summary does not grant lifecycle authority or add writes', () => {
  for (const file of ['payments', 'receipts']) {
    const source = fs.readFileSync(`app/finance/${file}/[id]/page.tsx`, 'utf8');
    assert.match(source, /import \{ TaxInvoiceNextAction \} from "\.\.\/\.\.\/tax-invoices\/source-next-action"/);
    assert.match(source, file === 'payments' ? /payment.status === "confirmed" \? <TaxInvoiceNextAction/ : /receipt.status === "issued" \? <TaxInvoiceNextAction/);
  }
  const panel = fs.readFileSync('app/finance/tax-invoices/source-next-action.tsx', 'utf8');
  assert.match(panel, /TaxInvoiceNextActionContent key=\{paymentId\}/);
  assert.match(panel, /!eligibility\?\.can_prepare \|\| !permissions\?\.canManageFinanceTaxInvoices/);
  assert.equal((panel.match(/create_finance_tax_invoice_draft/g) || []).length, 1);
  assert.doesNotMatch(panel, /issue_finance_tax_invoice|\.update\(|\.insert\(/);
  assert.ok(panel.indexOf('<TaxInvoiceVatSummary') < panel.indexOf('{eligibility?.existing_id ? <Link'));
});
