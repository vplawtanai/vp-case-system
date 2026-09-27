/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { workspaceFixture } = require('./i18n-workspace-fixture.cjs');

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
  assert.equal((html.match(/<td>รับมอบหมายงานได้<\/td>/g) || []).length, 1);
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
