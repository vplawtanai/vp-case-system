import type { SupabaseClient } from '@supabase/supabase-js';

// Human-reviewed 095 UAT identities. These never belong in the real Legacy
// Archive, even if a UAT record has no New-create Activity. Keep in sync with
// advisory-095-reviewed-targets.json (covered by the archive contract test).
export const legacyArchiveExcludedMatterIds = [
  '8f375864-0fb3-4d17-9e07-d4f6d76cf4fe', '7583d780-9e98-4852-bf5a-98c40fbf8072',
  '02e5ba61-af9b-4dc0-8729-9e334639b652', 'c9aa7141-ed6a-4cdd-926a-ad261fb93dd6',
  '47bfb55e-3ac5-445c-b335-5d48417f793e', '7442060f-5a6b-4235-a826-597a6a53bb37',
  'b02ba4f6-ccc8-43df-91d1-9d584ef6a7e0', '6c717f2e-aff6-44af-9774-e910d7a61047',
  '35583652-f594-4d7b-8f6a-24991df14dad', '50221a99-f188-4f18-9017-b6f3302a5c2f',
  '8cf4af68-18cd-415f-a56e-578e4ccaa2d1',
] as const;

export type ArchiveRow = { id: string; [key: string]: unknown };
export type ArchiveMatter = ArchiveRow & {
  title: string; matter_no: string; client_id: string; status: string;
  client: { name: string } | null;
};
export const archiveTables = {
  issues: 'advisory_issues', tasks: 'advisory_issue_tasks',
  time: 'advisory_time_logs', advice: 'advisory_advice_records',
} as const;
export type ArchiveSection = keyof typeof archiveTables;
export type ArchiveDetail = {
  matter: ArchiveMatter; records: Record<ArchiveSection, ArchiveRow[]>;
  history: ArchiveRow[]; historyUnavailable: boolean;
};

// Since 076, every New create transaction writes both kind='create' Activity
// and its private request receipt atomically. Only that transaction emits this
// Activity kind; adopting an old Matter through note/team/stage does not.
// Activity is the SELECT-authorized witness of that transaction. Never expose
// the private request ledger or use a snapshot/control/date as an origin proxy.
// Filtering in the same request avoids a fetch-IDs-then-list race/truncation.
export function legacyMatterQuery(db: SupabaseClient) {
  // Historical read only: operational archive markers must not hide history.
  // Base-table RLS and the existing read permission check still apply.
  return db.from('advisory_matters')
    .select('*,client:clients(name),new_creation:advisory_matter_activities()')
    .not('id', 'in', `(${legacyArchiveExcludedMatterIds.join(',')})`)
    .eq('new_creation.kind', 'create').is('new_creation', null);
}
async function requireArchiveRead(db: SupabaseClient) {
  // The activity RLS uses this same predicate. Fail closed before an anti-join
  // so an unauthorized/failed evidence read cannot classify New rows as Legacy.
  const access = await db.rpc('advisory076_allowed', { p_action: 'read' });
  if (access.error || access.data !== true) throw Error('ARCHIVE_READ_DENIED');
}
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [], size = 250;
  for (let from = 0; ; from += size) {
    const result = await page(from, from + size - 1);
    if (result.error || !Array.isArray(result.data)) throw Error('ARCHIVE_READ_FAILED');
    rows.push(...result.data as T[]);
    if (result.data.length < size) return rows;
  }
}
export async function readLegacyMatters(db: SupabaseClient): Promise<ArchiveMatter[]> {
  await requireArchiveRead(db);
  return allRows<ArchiveMatter>((from, to) => legacyMatterQuery(db).order('created_at', { ascending: false }).order('id').range(from, to));
}
export async function readLegacyDetail(db: SupabaseClient, matterId: string): Promise<ArchiveDetail | null> {
  await requireArchiveRead(db);
  const result = await legacyMatterQuery(db).eq('id', matterId).maybeSingle();
  if (result.error) throw Error('ARCHIVE_READ_FAILED');
  if (!result.data) return null;
  const entries = await Promise.all(Object.entries(archiveTables).map(async ([section, table]) => [section,
    await allRows<ArchiveRow>((from, to) => db.from(table).select('*').eq('advisory_matter_id', matterId)
      .order('created_at', { ascending: false }).order('id').range(from, to)),
  ] as const));
  const records = Object.fromEntries(entries) as ArchiveDetail['records'];
  // Include deleted records for historical reading only. Never expose restore.
  // Do not classify child origin: the approved scope is the Matter's origin.
  const ids = [matterId, ...Object.values(records).flat().map(row => row.id)];
  const history: ArchiveRow[] = [];
  let historyUnavailable = false;
  try {
    for (let from = 0; from < ids.length; from += 100) {
      history.push(...await allRows<ArchiveRow>((start, end) => db.from('case_audit_logs').select('*')
        .in('table_name', ['advisory_matters', ...Object.values(archiveTables)])
        .in('record_id', ids.slice(from, from + 100)).order('created_at', { ascending: false }).order('id').range(start, end)));
    }
  } catch { historyUnavailable = true; }
  history.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.id.localeCompare(b.id));
  return { matter: result.data as unknown as ArchiveMatter, records, history, historyUnavailable };
}
