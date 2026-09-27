/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');
const { organizeUsers } = require('../../app/admin/users/list.ts');
const { effectiveUiLocale } = require('../../lib/i18n/core.ts');

// Render the real page with synthetic profiles. All network and mutation hooks are blocked.
const page = workspaceFixture('app/admin/users/page.tsx', [], {
  '../../components/DetailModal': { default: ({ open, title, subtitle, children }) => open
    ? React.createElement('section', { role: 'dialog' }, React.createElement('h2', null, title), React.createElement('p', null, subtitle), children) : null },
});
const person = {
  id: 'fixture-lawyer', email: 'lawyer@example.invalid', full_name: 'บุคลากรตัวอย่าง', staff_name: 'ชื่อปฏิบัติงาน',
  role: 'lawyer', active: true, financial_access: true, can_confirm_finance_payments: true,
  account_type: null, assignable: false,
};
const base = { 'UsersPage.actor': 'fixture-admin', 'UsersPage.loading': false, 'UsersPage.users': [person] };
const render = overrides => page.render('th', { ...base, ...overrides });

test('Thai list distinguishes unclassified/UAT/operational and effective assignment without dumping capabilities', () => {
  const html = render({ 'UsersPage.users': [person,
    { ...person, id: 'uat', account_type: 'uat' },
    { ...person, id: 'real', account_type: 'operational', assignable: true },
    { ...person, id: 'inactive', active: false, account_type: 'operational', assignable: true },
  ] });
  for (const text of ['ยังไม่จัดประเภท', 'UAT / ทดสอบ', 'ใช้งานจริง', 'เปิดใช้งาน', 'ปิดใช้งาน', 'รับมอบหมายงานได้']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<td[^>]*>รับมอบหมายงานได้<\/td>/g) || []).length, 1);
  assert.ok(!html.includes('ยืนยันเงินรับ'));
  assert.ok(!html.includes('Account Type'));
});
test('create has essential required fields, no password and no advanced Finance checklist', () => {
  const html = render({ 'UsersPage.form': { email: '', full_name: '', staff_name: '', role: 'lawyer', account_type: '', assignable: false } });
  assert.match(html, /role="dialog"/);
  assert.match(html, /สร้างและส่งคำเชิญ/);
  assert.match(html, /<select required="">/);
  assert.match(html, /type="checkbox" disabled=""/);
  assert.doesNotMatch(html, /type="password"|<details|ยืนยันเงินรับ/);
});
test('edit retains explicit Finance flags, uses collapsed details and requires delete confirmation', () => {
  const original = { ...person, active: false, account_type: 'uat' };
  const html = render({ 'UsersPage.original': original, 'UsersPage.form': original, 'UsersPage.canDelete': true });
  assert.match(html, /<details[^>]*><summary>สิทธิ์เพิ่มเติม/);
  assert.match(html, /type="checkbox" checked=""\/>ยืนยันเงินรับ/);
  assert.match(html, /พิมพ์อีเมลเพื่อยืนยัน/);
  assert.match(html, /disabled="">ยืนยันลบถาวร/);
  assert.match(html, /ประวัติการทำงานยังคงอยู่/);
});
test('denied page and loading state expose no user list or create action', () => {
  const html = render({ 'UsersPage.actor': '', 'UsersPage.pageError': 'เฉพาะผู้ดูแลระบบที่เปิดใช้งานเท่านั้น' });
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /lawyer@example.invalid|<table|>เพิ่มผู้ใช้<\/button>/);
});

const profile = (id, patch = {}) => ({ ...person, id, full_name: id, staff_name: null, email: `${id}@example.invalid`, ...patch });
const ids = rows => rows.map(row => row.id);
const ordered = (rows, filter = 'all', sort = 'recommended', query = '') => organizeUsers(rows, query, filter, sort);

test('recommended order groups active unclassified, operational, UAT, then every inactive account', () => {
  const rows = [profile('inactive-unclassified', { active: false }), profile('uat', { account_type: 'uat' }),
    profile('operational', { account_type: 'operational' }), profile('unclassified'),
    profile('inactive-operational', { active: false, account_type: 'operational' })];
  const snapshot = JSON.stringify(rows);
  rows.forEach(Object.freeze); Object.freeze(rows);
  assert.deepEqual(ids(ordered(rows)), ['unclassified', 'operational', 'uat', 'inactive-operational', 'inactive-unclassified']);
  assert.equal(JSON.stringify(rows), snapshot, 'presentation must not mutate any profile or API ordering');
});

test('each group uses actual role priority, unknown last, regardless of input/name order', () => {
  const roles = ['admin', 'partner', 'lawyer', 'assistant_lawyer', 'staff', 'viewer', 'future_role'];
  for (const account_type of [null, 'operational', 'uat']) {
    const rows = roles.map((role, i) => profile(role, { role, account_type, full_name: String(9 - i) })).reverse();
    assert.deepEqual(ids(ordered(rows)), roles);
  }
});

test('same role uses operational display name, full-name fallback, then email and stable ID', () => {
  const rows = [profile('z', { full_name: 'Aaron', staff_name: 'Zoe' }),
    profile('b', { full_name: 'Zoe', staff_name: 'Amy', email: 'b@example.invalid' }),
    profile('a', { full_name: 'Zoe', staff_name: 'Amy', email: 'a@example.invalid' }),
    profile('full', { full_name: 'Bob', staff_name: '  ' }),
    profile('tie-b', { staff_name: 'Tie', email: 'tie@example.invalid' }),
    profile('tie-a', { staff_name: 'Tie', email: 'tie@example.invalid' })];
  assert.deepEqual(ids(ordered(rows)), ['a', 'b', 'full', 'tie-a', 'tie-b', 'z']);
  assert.deepEqual(ids(ordered([profile('ข', { staff_name: 'ขนิษฐา' }), profile('ก', { staff_name: 'กนก' })])), ['ก', 'ข']);
});

test('all six filters rely on account_type/active/assignable, never names or email patterns', () => {
  const rows = [profile('unclassified', { full_name: 'Test Lawyer', email: 'uat@example.invalid', assignable: true }),
    profile('real-test-name', { full_name: 'Test Partner', account_type: 'operational', assignable: true }),
    profile('real-unassigned', { account_type: 'operational' }),
    profile('uat-real-name', { full_name: 'ทนายกนก', account_type: 'uat', assignable: true }),
    profile('inactive', { active: false, account_type: 'operational', assignable: true })];
  assert.equal(ordered(rows).length, 5);
  assert.deepEqual(ids(ordered(rows, 'unclassified')), ['unclassified']);
  assert.deepEqual(new Set(ids(ordered(rows, 'operational'))), new Set(['real-test-name', 'real-unassigned']));
  assert.deepEqual(ids(ordered(rows, 'uat')), ['uat-real-name']);
  assert.deepEqual(ids(ordered(rows, 'assignable')), ['real-test-name']);
  assert.deepEqual(ids(ordered(rows, 'inactive')), ['inactive']);
});

test('search matches full/staff/email in Thai/English and composes with filters and sort', () => {
  const rows = [profile('b', { full_name: 'ทนายกนก', staff_name: 'Zoe', account_type: 'operational' }),
    profile('a', { full_name: 'ทนายกนก', staff_name: 'Amy', account_type: 'operational' }),
    profile('uat', { full_name: 'ทนายกนก', account_type: 'uat' })];
  assert.deepEqual(ids(ordered(rows, 'operational', 'name', ' กนก ')), ['a', 'b']);
  assert.deepEqual(ids(ordered(rows, 'all', 'name', 'AMY')), ['a']);
  assert.deepEqual(ids(ordered(rows, 'all', 'name', 'B@EXAMPLE')), ['b']);
  assert.deepEqual(ids(ordered(rows, 'uat', 'name', 'Amy')), []);
  assert.deepEqual(ids(ordered([profile('blank', { full_name: null, staff_name: null, email: null })])), ['blank']);
});

test('Name, Role and Status override recommended ordering predictably', () => {
  const rows = [profile('active-z', { full_name: 'Zoe', role: 'admin', account_type: 'uat' }),
    profile('inactive-a', { full_name: 'Amy', role: 'lawyer', active: false }),
    profile('active-b', { full_name: 'Bob', role: 'viewer' })];
  assert.deepEqual(ids(ordered(rows, 'all', 'name')), ['inactive-a', 'active-b', 'active-z']);
  assert.deepEqual(ids(ordered(rows, 'all', 'role')), ['active-z', 'inactive-a', 'active-b']);
  assert.deepEqual(ids(ordered(rows, 'all', 'status')), ['active-b', 'active-z', 'inactive-a']);
});

test('real page connects filter/search/sort, selected state, counts and Admin Add/Edit', () => {
  const html = render({ 'UsersPage.users': [profile('first', { full_name: 'Amy', account_type: 'operational' }),
    profile('hidden', { full_name: 'Amy', account_type: 'uat' }), profile('last', { full_name: 'Zoe', account_type: 'operational' })],
    'UsersPage.filter': 'operational', 'UsersPage.sort': 'name', 'UsersPage.query': 'amy' });
  assert.match(html, /aria-pressed="true">ใช้งานจริง/);
  assert.match(html, /value="name" selected=""/);
  assert.match(html, /แสดง 1 จาก 3 ผู้ใช้/);
  assert.match(html, /first@example.invalid/);
  assert.doesNotMatch(html, /hidden@example.invalid|last@example.invalid/);
  assert.match(html, />เพิ่มผู้ใช้<\/button>/);
  assert.match(html, /aria-label="แก้ไขผู้ใช้ Amy"/);
  assert.match(html, /data-label="สิทธิ์เพิ่มเติม">2<\/td>/);
  assert.match(html, /data-label="บทบาท"/);
});

test('empty filter/search results retain controls and do not suggest creating a duplicate user', () => {
  const html = render({ 'UsersPage.filter': 'uat', 'UsersPage.query': 'missing' });
  assert.match(html, /ไม่พบผู้ใช้/);
  assert.match(html, /แสดง 0 จาก 1 ผู้ใช้/);
  assert.match(html, /aria-label="ตัวกรองผู้ใช้"/);
  assert.match(html, /เรียงตาม/);
});

test('existing Admin Thai-only locale coverage is preserved even when English is preferred', () => {
  assert.equal(effectiveUiLocale('en', '/admin/users'), 'th');
  const html = render();
  assert.doesNotMatch(html, /Operational|Assignable|Unclassified|Recommended/);
});

test('Admin edit explains role authority and hides granular capability checklist without changing stored flags', () => {
  const original = Object.freeze({ ...person, role: 'admin', can_confirm_finance_payments: false });
  const html = render({ 'UsersPage.original': original, 'UsersPage.form': original });
  assert.match(html, /สิทธิ์เต็มจากบทบาทผู้ดูแลระบบ/);
  assert.match(html, /ไม่จำเป็นต้องกำหนดสิทธิ์เพิ่มเติมทีละรายการ/);
  assert.doesNotMatch(html, /<summary>สิทธิ์เพิ่มเติม|ยืนยันเงินรับ/);
  assert.equal(original.can_confirm_finance_payments, false);
});
test('Admin create needs no capability editor; inactive Admin is clearly denied access', () => {
  const form = { email: '', full_name: '', staff_name: '', role: 'admin', account_type: '', assignable: false };
  assert.match(render({ 'UsersPage.form': form }), /สิทธิ์เต็มจากบทบาทผู้ดูแลระบบ/);
  const inactive = { ...person, role: 'admin', active: false };
  const html = render({ 'UsersPage.form': inactive, 'UsersPage.original': inactive });
  assert.match(html, /บัญชีนี้ปิดใช้งานอยู่ จึงไม่สามารถเข้าใช้งานระบบได้/);
  assert.doesNotMatch(html, /<summary>สิทธิ์เพิ่มเติม/);
});
test('lawyer/Admin role selector toggles presentation only; saved explicit permissions reappear intact', () => {
  const lawyer = Object.freeze({ ...person, can_confirm_finance_payments: true });
  const adminHtml = render({ 'UsersPage.original': lawyer, 'UsersPage.form': { ...lawyer, role: 'admin' } });
  assert.doesNotMatch(adminHtml, /<summary>สิทธิ์เพิ่มเติม/);
  const lawyerHtml = render({ 'UsersPage.original': { ...lawyer, role: 'admin' }, 'UsersPage.form': lawyer });
  assert.match(lawyerHtml, /type="checkbox" checked=""\/>ยืนยันเงินรับ/);
  assert.equal(lawyer.can_confirm_finance_payments, true);
});
test('list shows Admin role authority instead of misleading zero additional-permission count', () => {
  const html = render({ 'UsersPage.users': [{ ...person, role: 'admin', financial_access: false, can_confirm_finance_payments: false }] });
  assert.match(html, /สิทธิ์เต็มจากบทบาท/);
  assert.doesNotMatch(html, /System Access|Full access from Admin role/);
});
