"use client";

import { useCallback, useEffect, useState } from "react";
import AuthGuard from "../../components/AuthGuard";
import AppTopNav from "../../components/AppTopNav";
import DetailModal from "../../components/DetailModal";
import { supabase } from "../../../lib/supabase";
import { CAPABILITY_LABELS, PEOPLE_ERRORS, PEOPLE_ROLES, PROFILE_FIELDS, ROLE_LABELS, isAssignablePerson, type PeopleProfile } from "../../../lib/people";
import ui from "../../components/ui/vp-ui.module.css";
import styles from "./users.module.css";
import { organizeUsers, USER_LIST_FILTERS, USER_LIST_SORTS, type UserListFilter, type UserListSort } from "./list";

import TemporaryPasswordFields from "./TemporaryPasswordFields";
import { useI18n } from "../../../lib/i18n/provider";
import { passwordText, validatePassword } from "../../../lib/password-onboarding";

type Form = Record<string, unknown>;
type ApiResult = { users?: PeopleProfile[]; actor?: string; id?: string; warning?: string; message?: string; error?: string; reference?: string; deletable?: boolean; code?: string };
async function adminRequest(body?: Record<string, unknown>): Promise<ApiResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error(PEOPLE_ERRORS.UNAUTHORIZED);
  const response = await fetch("/api/admin/users", {
    method: body ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result: ApiResult = await response.json();
  if (!response.ok) throw new Error(`${result.message || PEOPLE_ERRORS.OPERATION_FAILED}${result.reference ? ` (${result.reference})` : ""}`);
  return result;
}
const accountLabel = (value: unknown) => value === "operational" ? "ใช้งานจริง" : value === "uat" ? "UAT / ทดสอบ" : "ยังไม่จัดประเภท";

export default function UsersPage() {
  const { locale } = useI18n();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [users, setUsers] = useState<PeopleProfile[]>([]);
  const [actor, setActor] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserListFilter>("all");
  const [sort, setSort] = useState<UserListSort>("recommended");
  const [form, setForm] = useState<Form | null>(null);
  const [original, setOriginal] = useState<PeopleProfile | null>(null);
  const [formError, setFormError] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setPageError("");
    try { const result = await adminRequest(); setUsers(result.users || []); setActor(result.actor || ""); }
    catch (error) { setUsers([]); setActor(""); setPageError(error instanceof Error ? error.message : PEOPLE_ERRORS.OPERATION_FAILED); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = (user?: PeopleProfile) => {
    setTemporaryPassword(""); setConfirmTemporaryPassword("");
    setOriginal(user || null); setFormError(""); setCanDelete(false); setConfirmation(""); setNotice("");
    setForm(user ? { ...user } : { email: "", full_name: "", staff_name: "", role: "lawyer", account_type: "", assignable: false });
  };
  const close = () => { if (!busy) { setTemporaryPassword(""); setConfirmTemporaryPassword(""); setForm(null); setOriginal(null); } };
  const change = (key: string, value: unknown) => {
    setCanDelete(false);
    setForm(current => {
      const next = { ...current, [key]: value };
      if (next.account_type !== "operational" || next.active === false) next.assignable = false;
      return next;
    });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!form || busy) return;
    setBusy(true); setFormError("");
    try {
      if (!original) validatePassword(temporaryPassword, confirmTemporaryPassword);
      const input = original
        ? Object.fromEntries(PROFILE_FIELDS.filter(key => form[key] !== original[key]).map(key => [key, form[key]]))
        : Object.fromEntries(["email", "full_name", "staff_name", "role", "account_type", "assignable"].map(key => [key, form[key]]));
      if (original && !Object.keys(input).length) { setForm(null); return; }
      const result = await adminRequest(original ? { action: "save", id: original.id, input, expected: original } : { action: "create", input, temporaryPassword, confirmTemporaryPassword });
      setNotice(result.warning ? (result.message || PEOPLE_ERRORS.OPERATION_FAILED) : original ? "บันทึกผู้ใช้แล้ว" : passwordText("created", locale));
      setTemporaryPassword(""); setConfirmTemporaryPassword("");
      setForm(null); setOriginal(null); await load();
    } catch (error) { setFormError(error instanceof Error ? PEOPLE_ERRORS[error.message] || error.message : PEOPLE_ERRORS.OPERATION_FAILED); }
    finally { setBusy(false); }
  };
  const checkDelete = async () => {
    if (!original) return;
    setBusy(true); setFormError("");
    try {
      const result = await adminRequest({ action: "delete-check", id: original.id });
      setCanDelete(result.deletable === true);
      if (!result.deletable) setFormError(PEOPLE_ERRORS[result.code || "USER_HISTORY_REQUIRED"] || PEOPLE_ERRORS.USER_HISTORY_REQUIRED);
    } catch (error) { setFormError(error instanceof Error ? PEOPLE_ERRORS[error.message] || error.message : PEOPLE_ERRORS.OPERATION_FAILED); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!original || !canDelete || confirmation !== original.email) return;
    setBusy(true); setFormError("");
    try {
      await adminRequest({ action: "delete", id: original.id, confirmation });
      setForm(null); setOriginal(null); setNotice("ลบบัญชีที่ไม่มีประวัติแล้ว"); await load();
    } catch (error) { setFormError(error instanceof Error ? PEOPLE_ERRORS[error.message] || error.message : PEOPLE_ERRORS.OPERATION_FAILED); }
    finally { setBusy(false); }
  };
  const resetPassword = async () => {
    if (!original || busy) return;
    setBusy(true); setFormError("");
    try {
      validatePassword(temporaryPassword, confirmTemporaryPassword);
      await adminRequest({ action: "reset-password", id: original.id, temporaryPassword, confirmTemporaryPassword });
      setNotice(passwordText("resetDone", locale));
      setForm(null); setOriginal(null); await load();
    } catch (error) { setFormError(error instanceof Error ? PEOPLE_ERRORS[error.message] || error.message : PEOPLE_ERRORS.OPERATION_FAILED); }
    finally { setTemporaryPassword(""); setConfirmTemporaryPassword(""); setBusy(false); }
  };
  const visible = organizeUsers(users, query, filter, sort);
  return <AuthGuard><main className={`${ui.scope} ${styles.page}`}>
    <AppTopNav title="จัดการผู้ใช้" subtitle="บัญชีเข้าใช้งาน สิทธิ์ และสถานะบุคลากร" activePage="users" />
    <div className={styles.toolbar}>
      <label className={styles.search}>ค้นหาผู้ใช้<input value={query} onChange={event => setQuery(event.target.value)} placeholder="ชื่อหรืออีเมล" /></label>
      {actor && <button className={ui.primary} onClick={() => open()}>เพิ่มผู้ใช้</button>}
      <button className={ui.secondary} onClick={() => void load()} disabled={loading}>รีเฟรช</button>
    </div>
    {pageError && <p role="alert" className={styles.error}>{pageError}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loading ? <p role="status">กำลังโหลดผู้ใช้…</p> : actor && <>
      <p className={styles.hint}>บัญชีเดิมที่ยังไม่จัดประเภทใช้งานได้ตามสิทธิ์เดิม ผู้ดูแลระบบเป็นผู้ระบุประเภทและการรับมอบหมายงาน</p>
      <div className={styles.listControls}>
        <div className={styles.filters} role="group" aria-label="ตัวกรองผู้ใช้">
          {USER_LIST_FILTERS.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
        <label className={styles.sort}>เรียงตาม<select value={sort} onChange={event => setSort(event.target.value as UserListSort)}>{USER_LIST_SORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <p className={styles.resultCount} role="status">แสดง {visible.length} จาก {users.length} ผู้ใช้</p>
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr>
        <th>ชื่อ / อีเมล</th><th>บทบาท</th><th>ประเภทบัญชี</th><th>สถานะ</th><th>การรับมอบหมายงาน</th><th>สิทธิ์เพิ่มเติม</th><th>จัดการ</th>
      </tr></thead><tbody>{visible.map(user => <tr key={user.id}>
        <td className={styles.identity}><strong>{user.full_name || user.staff_name || "—"}</strong><span className={styles.secondaryText}>{user.email}</span>{user.staff_name && user.staff_name !== user.full_name && <span className={styles.secondaryText}>{user.staff_name}</span>}</td>
        <td data-label="บทบาท">{ROLE_LABELS[user.role] || user.role}</td><td data-label="ประเภทบัญชี">{accountLabel(user.account_type)}</td>
        <td data-label="สถานะ"><span className={user.active ? styles.active : styles.inactive}>{user.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>{user.must_change_password && <span className={styles.secondaryText}>{passwordText("required", locale)}</span>}</td>
        <td data-label="การรับมอบหมายงาน">{isAssignablePerson(user) ? "รับมอบหมายงานได้" : "ไม่รับมอบหมายงาน"}</td>
        <td data-label="สิทธิ์เพิ่มเติม">{user.role === "admin" ? user.active ? "สิทธิ์เต็มจากบทบาท" : "ปิดใช้งาน" : Object.keys(CAPABILITY_LABELS).filter(key => user[key] === true).length || "—"}</td>
        <td className={styles.editCell}><button className={ui.secondary} onClick={() => open(user)} aria-label={`แก้ไขผู้ใช้ ${user.full_name || user.email}`}>แก้ไข</button></td>
      </tr>)}</tbody></table>{visible.length === 0 && <p className={styles.empty}>ไม่พบผู้ใช้</p>}</div>
    </>}
    <DetailModal open={!!form} title={original ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้"} subtitle={original?.email || passwordText("hint", locale)} size="edit" onClose={close} closeOnBackdrop={!busy} closeLabel="ปิด">
      {form && <form onSubmit={save} className={styles.form}>
        {formError && <p role="alert" className={styles.error}>{formError}</p>}
        <fieldset disabled={busy} className={styles.fields}><div className={styles.grid}>
          <label>อีเมล<input type="email" required maxLength={254} disabled={!!original} value={String(form.email || "")} onChange={e => change("email",e.target.value)} autoComplete="off" /></label>
          <label>ชื่อเต็ม<input required maxLength={200} value={String(form.full_name || "")} onChange={e => change("full_name",e.target.value)} /></label>
          <label>ชื่อที่ใช้ปฏิบัติงาน (ถ้ามี)<input maxLength={200} value={String(form.staff_name || "")} onChange={e => change("staff_name",e.target.value)} /></label>
          <label>บทบาทหลัก<select value={String(form.role)} onChange={e => change("role",e.target.value)} disabled={original?.id === actor}>{PEOPLE_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
          <label>ประเภทบัญชี<select required={!original} value={String(form.account_type || "")} onChange={e => change("account_type",e.target.value || null)}>
            <option value="">{original ? "ยังไม่จัดประเภท" : "เลือกประเภทบัญชี"}</option><option value="operational">ใช้งานจริง</option><option value="uat">UAT / ทดสอบ</option>
          </select></label>
          {!original && <TemporaryPasswordFields password={temporaryPassword} confirmation={confirmTemporaryPassword} onPassword={setTemporaryPassword} onConfirmation={setConfirmTemporaryPassword} />}
        </div>
        <label className={styles.check}><input type="checkbox" checked={form.assignable === true} disabled={form.account_type !== "operational" || form.active === false} onChange={e => change("assignable",e.target.checked)} />รับมอบหมายงานได้</label>
        <p className={styles.hint}>เฉพาะบัญชีใช้งานจริงที่เปิดใช้งานเท่านั้น บัญชีทดสอบไม่รับมอบหมายงาน</p>
        {form.role === "admin" && <section className={styles.systemAccess} aria-label="สิทธิ์ระบบ">
          <strong>สิทธิ์เต็มจากบทบาทผู้ดูแลระบบ</strong>
          <p>ผู้ดูแลระบบที่เปิดใช้งานมีสิทธิ์ใช้งานทุกส่วนของระบบโดยอัตโนมัติ ไม่จำเป็นต้องกำหนดสิทธิ์เพิ่มเติมทีละรายการ</p>
          <p>สิทธิ์เพิ่มเติมที่เคยบันทึกไว้ยังคงเดิม และจะใช้ตามกฎของบทบาทนั้นหากเปลี่ยนเป็นบทบาทอื่น</p>
          {form.active === false && <p>บัญชีนี้ปิดใช้งานอยู่ จึงไม่สามารถเข้าใช้งานระบบได้</p>}
        </section>}
        {original && <>
          <label className={styles.check}><input type="checkbox" checked={form.active === true} disabled={original.id === actor} onChange={e => change("active",e.target.checked)} />เปิดใช้งาน</label>
          <p className={styles.hint}>หากเลิกใช้งาน ให้เอาเครื่องหมายออกแล้วบันทึก ประวัติการทำงานยังคงอยู่</p>
          {form.role !== "admin" && <details className={styles.advanced}><summary>สิทธิ์เพิ่มเติม</summary><p className={styles.hint}>เป็นสิทธิ์เฉพาะบัญชี การเปลี่ยนบทบาทจะไม่ล้างค่าเหล่านี้</p><div className={styles.grid}>
            {Object.entries(CAPABILITY_LABELS).filter(([key]) => key in original).map(([key,label]) => <label className={styles.check} key={key}><input type="checkbox" checked={form[key] === true} onChange={e => change(key,e.target.checked)} />{label}</label>)}
          </div></details>}
        </>}
        </fieldset>
        <div className={styles.actions}><button type="button" className={ui.secondary} onClick={close} disabled={busy}>ยกเลิก</button><button type="submit" className={ui.primary} disabled={busy}>{busy ? "กำลังดำเนินการ…" : original ? "บันทึก" : passwordText("create", locale)}</button></div>
        {original && <details className={styles.advanced}><summary>การจัดการบัญชีเพิ่มเติม</summary>
          <fieldset disabled={busy} className={styles.fields}><div className={styles.grid}>
            <TemporaryPasswordFields password={temporaryPassword} confirmation={confirmTemporaryPassword} onPassword={setTemporaryPassword} onConfirmation={setConfirmTemporaryPassword} required={false} />
          </div><button type="button" className={ui.secondary} onClick={() => void resetPassword()} disabled={busy}>{passwordText("reset", locale)}</button></fieldset>
          <p className={styles.hint}>แนะนำให้ปิดใช้งานแทนการลบถาวร ระบบจะไม่ลบผู้ใช้ที่มีประวัติ</p>
          <button type="button" className={ui.danger} disabled={busy || original.id === actor || original.active || !original.account_type} onClick={() => void checkDelete()}>ตรวจสอบก่อนลบถาวร</button>
          {canDelete && <div className={styles.deleteBox}><p>การลบถาวรจะลบบัญชีเข้าใช้งานและโปรไฟล์ และไม่สามารถย้อนกลับได้</p><label>พิมพ์อีเมลเพื่อยืนยัน<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button type="button" className={ui.danger} onClick={() => void remove()} disabled={busy || confirmation !== original.email}>ยืนยันลบถาวร</button></div>}
        </details>}
      </form>}
    </DetailModal>
  </main></AuthGuard>;
}
