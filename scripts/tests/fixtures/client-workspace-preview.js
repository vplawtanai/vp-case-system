import fixtures from './client-workspace.cjs';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const mock=fixtures.database(fixtures.fixture(today));
window.calls=mock.calls;
window.clientPreview=mock.state;
export const supabase=mock.db;
